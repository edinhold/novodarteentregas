import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/utils/financialCalculations";
import {
  Wallet,
  PlusCircle,
  MinusCircle,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

interface AdjustDriverWalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId?: string | null;
  driversList?: { id: string; full_name?: string; phone?: string }[];
  onSuccess?: () => void;
}

export const AdjustDriverWalletModal: React.FC<AdjustDriverWalletModalProps> = ({
  open,
  onOpenChange,
  driverId: preselectedDriverId,
  driversList: providedDriversList,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [operation, setOperation] = useState<"add" | "subtract">("add");
  const [amountInput, setAmountInput] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const idempotencyKeyRef = useRef<string>("");

  // Fetch drivers list if not provided
  const { data: fetchedDrivers = [] } = useQuery({
    queryKey: ["admin-drivers-adjust-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, full_name, phone")
        .order("full_name");
      if (error) return [];
      return data || [];
    },
    enabled: open && !providedDriversList,
  });

  const driversOptions = useMemo(() => {
    const list = providedDriversList || fetchedDrivers;
    return list.map((d) => ({
      id: d.id,
      name: d.full_name || "Motorista sem nome",
      phone: d.phone || "",
    }));
  }, [providedDriversList, fetchedDrivers]);

  // Pre-select driver when dialog opens or prop changes
  useEffect(() => {
    if (open) {
      if (preselectedDriverId) {
        setSelectedDriverId(preselectedDriverId);
      } else if (driversOptions.length > 0 && !selectedDriverId) {
        setSelectedDriverId(driversOptions[0].id);
      }
      setAmountInput("");
      setReason("");
      setOperation("add");
      idempotencyKeyRef.current = `adj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }
  }, [open, preselectedDriverId, driversOptions]);

  // Fetch current driver pending balance
  const { data: currentBalance = 0, isLoading: loadingBalance } = useQuery({
    queryKey: ["admin-driver-balance", selectedDriverId],
    queryFn: async () => {
      if (!selectedDriverId) return 0;
      const { data, error } = await supabase
        .from("driver_earnings")
        .select("amount")
        .eq("driver_id", selectedDriverId)
        .eq("status", "pending");

      if (error) return 0;
      const total = (data || []).reduce((acc, row) => acc + Number(row.amount || 0), 0);
      return Math.max(0, total);
    },
    enabled: open && !!selectedDriverId,
  });

  const amountVal = useMemo(() => {
    const parsed = parseFloat(amountInput.replace(",", "."));
    return isNaN(parsed) || parsed <= 0 ? 0 : parsed;
  }, [amountInput]);

  const newBalance = useMemo(() => {
    if (operation === "add") {
      return currentBalance + amountVal;
    } else {
      return currentBalance - amountVal;
    }
  }, [currentBalance, amountVal, operation]);

  const isDebitExceeded = operation === "subtract" && amountVal > currentBalance;

  const selectedDriverName = useMemo(() => {
    const found = driversOptions.find((d) => d.id === selectedDriverId);
    return found ? found.name : "Motorista selecionado";
  }, [driversOptions, selectedDriverId]);

  const handleAdjust = async () => {
    if (!selectedDriverId) {
      return toast.error("Selecione um motorista para realizar o ajuste.");
    }
    if (amountVal <= 0) {
      return toast.error("Informe um valor maior que zero para o ajuste.");
    }
    if (!reason.trim()) {
      return toast.error("O motivo/descrição do ajuste é obrigatório.");
    }
    if (isDebitExceeded) {
      return toast.error(
        `Débito não permitido: o valor (R$ ${amountVal.toFixed(
          2
        )}) é superior ao saldo disponível (R$ ${currentBalance.toFixed(2)}).`
      );
    }

    setSubmitting(true);
    const key = idempotencyKeyRef.current || `adj-${Date.now()}`;

    try {
      // Execute atomic PostgreSQL RPC function with admin permissions check
      const { data, error } = await (supabase as any).rpc("admin_adjust_driver_wallet", {
        p_driver_id: selectedDriverId,
        p_operation: operation,
        p_amount: amountVal,
        p_reason: reason.trim(),
        p_idempotency_key: key,
      });

      if (error) {
        console.warn("[AdjustDriverWallet] RPC error fallback:", error);

        // Fallback to direct transactional table inserts if RPC signature varies
        const signedAmount = operation === "add" ? amountVal : -amountVal;
        const authUser = (await supabase.auth.getUser()).data.user;

        const { data: earningData, error: earningErr } = await supabase
          .from("driver_earnings")
          .insert({
            driver_id: selectedDriverId,
            amount: signedAmount,
            status: "pending",
            delivery_request_id: null,
            description: reason.trim(),
            adjustment_type: operation === "add" ? "manual_credit" : "manual_debit",
            created_by_admin_id: authUser?.id,
          } as any)
          .select("id")
          .single();

        if (earningErr) throw earningErr;

        // Insert audit log
        await supabase.from("financial_adjustment_logs").insert({
          admin_user_id: authUser?.id || "admin",
          admin_email: authUser?.email || "admin@sistema",
          transaction_id: key,
          driver_id: selectedDriverId,
          driver_name: selectedDriverName,
          movement_type: operation === "add" ? "Ajuste Manual — Crédito" : "Ajuste Manual — Débito",
          old_value: currentBalance,
          new_value: newBalance,
          adjustment_amount: signedAmount,
          reason: reason.trim(),
        } as any);
      }

      toast.success(
        `Ajuste de R$ ${amountVal.toFixed(2)} (${
          operation === "add" ? "Crédito" : "Débito"
        }) aplicado à carteira de ${selectedDriverName}!`
      );

      // Invalidate queries to update all financial views
      queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] });
      queryClient.invalidateQueries({ queryKey: ["admin-driver-earnings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-driver-balance", selectedDriverId] });
      queryClient.invalidateQueries({ queryKey: ["my-earnings"] });

      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("[AdjustDriverWallet] Error:", err);
      toast.error(err?.message || "Erro ao realizar ajuste na carteira do motorista.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Wallet className="w-5 h-5 text-primary" /> Ajustar Carteira do Motorista
          </DialogTitle>
          <DialogDescription>
            Adicionar ou retirar valores diretamente do saldo do motorista sem necessidade de corrida vinculada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Seletor de Motorista */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-muted-foreground" /> Motorista
            </Label>
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o motorista..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {driversOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seleção de Operação (Adicionar / Retirar) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Operação</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={operation === "add" ? "default" : "outline"}
                className={`h-11 justify-center gap-2 font-semibold ${
                  operation === "add"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "hover:border-emerald-500 hover:text-emerald-600"
                }`}
                onClick={() => setOperation("add")}
              >
                <PlusCircle className="w-4 h-4" /> Adicionar (Crédito)
              </Button>

              <Button
                type="button"
                variant={operation === "subtract" ? "default" : "outline"}
                className={`h-11 justify-center gap-2 font-semibold ${
                  operation === "subtract"
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : "hover:border-rose-500 hover:text-rose-600"
                }`}
                onClick={() => setOperation("subtract")}
              >
                <MinusCircle className="w-4 h-4" /> Retirar (Débito)
              </Button>
            </div>
          </div>

          {/* Campo de Valor */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Valor do Ajuste (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="text-lg font-bold"
            />
          </div>

          {/* Motivo / Descrição Obrigatório */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Motivo / Descrição do Ajuste *
            </Label>
            <Textarea
              rows={2}
              placeholder="Ex.: Corridas realizadas durante indisponibilidade do sistema; ajuste de taxa; etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {/* Card de Previsão de Saldo */}
          {selectedDriverId && (
            <Card className="bg-muted/40 border-dashed">
              <CardContent className="p-3 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Saldo Atual Disponível:</span>
                  <span className="font-semibold text-foreground">
                    {loadingBalance ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                    ) : (
                      formatCurrency(currentBalance)
                    )}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Ajuste Solicitado:</span>
                  <span
                    className={`font-bold ${
                      operation === "add" ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {operation === "add" ? "+" : "-"} {formatCurrency(amountVal)}
                  </span>
                </div>

                <div className="border-t pt-1.5 flex justify-between items-center text-sm font-bold">
                  <span>Novo Saldo Previsto:</span>
                  <span
                    className={
                      isDebitExceeded
                        ? "text-rose-600"
                        : operation === "add"
                        ? "text-emerald-600"
                        : "text-foreground"
                    }
                  >
                    {formatCurrency(newBalance)}
                  </span>
                </div>

                {isDebitExceeded && (
                  <div className="flex items-center gap-1.5 text-rose-600 text-[11px] pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Débito excede o saldo atual disponível do motorista.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleAdjust}
            disabled={submitting || !selectedDriverId || amountVal <= 0 || isDebitExceeded}
            className={
              operation === "add"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                : "bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            }
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Confirmar {operation === "add" ? "Crédito" : "Débito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
