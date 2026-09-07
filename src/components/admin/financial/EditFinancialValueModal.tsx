import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Edit3, RefreshCw, AlertTriangle, Store, User, Calendar, ShieldCheck, Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDateTime } from "@/utils/financialCalculations";

export interface FinancialEditableItem {
  id: string;
  type:
    | "Recarga"
    | "Recarga Direta"
    | "Corrida Motorista"
    | "Ganho de Motorista"
    | "Saque Motorista"
    | "Antecipação Motorista";
  storeName?: string;
  ownerName?: string;
  storeUserId?: string;
  driverId?: string;
  driverUserId?: string;
  driverName?: string;
  currentValue: number;
  date: string;
  description?: string;
  rawObject?: any;
}

interface EditFinancialValueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FinancialEditableItem | null;
  onSuccess?: () => void;
}

export const EditFinancialValueModal: React.FC<EditFinancialValueModalProps> = ({
  open,
  onOpenChange,
  item,
  onSuccess,
}) => {
  const queryClient = useQueryClient();

  const [newValueInput, setNewValueInput] = useState<string>("");
  const [reasonInput, setReasonInput] = useState<string>("");
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [currentAdmin, setCurrentAdmin] = useState<{ id: string; email: string } | null>(null);

  // Load current admin info on mount/open
  useEffect(() => {
    if (open) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          setCurrentAdmin({ id: user.id, email: user.email || "Admin Autenticado" });
        }
      });
      setShowConfirmation(false);
    }
  }, [open]);

  // Set initial input when item changes
  useEffect(() => {
    if (item) {
      setNewValueInput(String(item.currentValue || 0));
      setReasonInput("");
      setShowConfirmation(false);
    }
  }, [item]);

  if (!item) return null;

  const oldValue = Number(item.currentValue) || 0;
  const parsedNewValue = parseFloat(newValueInput.replace(",", ".")) || 0;
  const adjustmentDiff = parsedNewValue - oldValue;

  const validateForm = (): boolean => {
    if (isNaN(parsedNewValue) || parsedNewValue < 0) {
      toast.error("Por favor, informe um novo valor válido (não negativo).");
      return false;
    }

    if (parsedNewValue === oldValue) {
      toast.error("O novo valor informado é idêntico ao valor atual.");
      return false;
    }

    if (!reasonInput.trim()) {
      toast.error("Por favor, informe o motivo da correção para o histórico de auditoria.");
      return false;
    }

    return true;
  };

  const handleStartSave = () => {
    if (validateForm()) {
      setShowConfirmation(true);
    }
  };

  const handleConfirmAndSave = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      // 1. UPDATE TARGET FINANCIAL TABLE IN DATABASE
      const targetStoreUserId = item.storeUserId || item.rawObject?.user_id || item.rawObject?.used_by || item.rawObject?.assigned_to_user_id;

      if (item.type === "Recarga") {
        // Update credit code value
        const { error: codeErr } = await supabase
          .from("credit_codes")
          .update({ value: parsedNewValue })
          .eq("id", item.id);

        if (codeErr) throw codeErr;

        // If code is used and assigned to a store, adjust store_credits balance by difference
        const codeObj = item.rawObject;

        if (targetStoreUserId && (codeObj?.is_used || codeObj?.used_by)) {
          const { data: storeCredit } = await supabase
            .from("store_credits")
            .select("id, balance")
            .eq("user_id", targetStoreUserId)
            .maybeSingle();

          if (storeCredit) {
            const currentBal = Number(storeCredit.balance) || 0;
            const updatedBal = Math.max(0, currentBal + adjustmentDiff);
            await supabase
              .from("store_credits")
              .update({ balance: updatedBal, updated_at: new Date().toISOString() })
              .eq("id", storeCredit.id);
          } else {
            await supabase
              .from("store_credits")
              .insert({ user_id: targetStoreUserId, balance: Math.max(0, parsedNewValue), updated_at: new Date().toISOString() });
          }
        }
      } else if (item.type === "Recarga Direta") {
        // Update store_credits balance for direct recharge
        if (targetStoreUserId) {
          const { data: existingSC } = await supabase
            .from("store_credits")
            .select("id, balance")
            .eq("user_id", targetStoreUserId)
            .maybeSingle();

          if (existingSC) {
            const { error: scErr } = await supabase
              .from("store_credits")
              .update({ balance: parsedNewValue, updated_at: new Date().toISOString() })
              .eq("id", existingSC.id);
            if (scErr) throw scErr;
          } else {
            const { error: scErr } = await supabase
              .from("store_credits")
              .insert({ user_id: targetStoreUserId, balance: parsedNewValue, updated_at: new Date().toISOString() });
            if (scErr) throw scErr;
          }
        } else {
          const { error: scErr } = await supabase
            .from("store_credits")
            .update({ balance: parsedNewValue, updated_at: new Date().toISOString() })
            .eq("id", item.id);
          if (scErr) throw scErr;
        }
      } else if (item.type === "Corrida Motorista" || item.type === "Ganho de Motorista") {
        // Update delivery_requests driver fee in database
        const { error: reqErr } = await supabase
          .from("delivery_requests")
          .update({ driver_fee: parsedNewValue, updated_at: new Date().toISOString() })
          .eq("id", item.id);

        if (reqErr) throw reqErr;

        // Check or update driver_earnings
        const { data: existingEarning } = await supabase
          .from("driver_earnings")
          .select("id, amount")
          .eq("delivery_request_id", item.id)
          .maybeSingle();

        if (existingEarning) {
          await supabase
            .from("driver_earnings")
            .update({ amount: parsedNewValue })
            .eq("id", existingEarning.id);
        } else if (item.driverId || item.driverUserId) {
          await supabase.from("driver_earnings").insert({
            driver_id: item.driverId || item.driverUserId || "",
            delivery_request_id: item.id,
            amount: parsedNewValue,
            status: "available",
          });
        }
      } else if (item.type === "Saque Motorista" || item.type === "Antecipação Motorista") {
        // Update withdrawal_requests in database
        const rawFeeAmount = Number(item.rawObject?.fee_amount || 0);
        const netValue = Math.max(0, parsedNewValue - rawFeeAmount);

        const { error: withErr } = await supabase
          .from("withdrawal_requests")
          .update({
            amount: parsedNewValue,
            net_amount: netValue,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        if (withErr) throw withErr;
      }

      // 2. INSERT AUDIT LOG IN financial_adjustment_logs (Permanent Record)
      try {
        await supabase.from("financial_adjustment_logs" as any).insert({
          admin_user_id: user.id,
          admin_email: user.email || "admin@duarte.com",
          transaction_id: item.id,
          store_id: targetStoreUserId || null,
          store_name: item.storeName || null,
          driver_id: item.driverId || item.driverUserId || null,
          driver_name: item.driverName || null,
          movement_type: item.type,
          old_value: oldValue,
          new_value: parsedNewValue,
          adjustment_amount: adjustmentDiff,
          reason: reasonInput.trim(),
          created_at: new Date().toISOString(),
        });
      } catch (auditErr) {
        console.warn("Aviso ao salvar log de auditoria:", auditErr);
      }

      // 3. RECALCULATE & INVALIDATE REACT QUERY CACHE
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["financial-delivery-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-driver-earnings"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-drivers"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-audit-logs"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-store-credits"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-credit-codes"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-store-owners"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-restaurants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stores-credits-list"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-store-owners"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] }),
        queryClient.invalidateQueries({ queryKey: ["my-credits"] }),
        queryClient.invalidateQueries({ queryKey: ["my-restaurant"] }),
        queryClient.invalidateQueries({ queryKey: ["store-credits"] }),
        queryClient.invalidateQueries({ queryKey: ["credit-codes"] }),
        queryClient.invalidateQueries({ queryKey: ["restaurants"] }),
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] }),
      ]);

      toast.success(
        `Valor corrigido com sucesso de ${formatCurrency(oldValue)} para ${formatCurrency(parsedNewValue)}!`
      );

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Erro ao corrigir valor financeiro:", err);
      toast.error(`Falha ao salvar correção: ${err.message || "Erro interno no servidor"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDriverItem = !!item.driverName || item.type.includes("Motorista");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-black text-lg">
            <Edit3 className="w-5 h-5 text-primary" />
            Editar Valor Financeiro {isDriverItem ? "do Motorista" : "da Loja"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Corrija o valor de um lançamento inserido incorretamente. O novo valor atualizará os saldos e o histórico de auditoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card com Detalhes da Operação */}
          <div className="bg-muted/40 border rounded-lg p-3 space-y-2 text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                {isDriverItem ? (
                  <Bike className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Store className="w-3.5 h-3.5 text-primary" />
                )}
                {isDriverItem ? "Motorista:" : "Loja:"}{" "}
                <strong>{item.driverName || item.storeName || "—"}</strong>
              </span>
              <Badge variant="outline" className="text-[10px] font-bold">
                {item.type}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1">
              <div>
                <span>{isDriverItem ? "ID Motorista:" : "Proprietário:"}</span>
                <p className="font-medium text-foreground truncate">
                  {item.driverName ? item.driverId || item.driverUserId || "—" : item.ownerName || "—"}
                </p>
              </div>
              <div>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-muted-foreground" /> Data Lançamento:
                </span>
                <p className="font-medium text-foreground">{item.date ? formatDateTime(item.date) : "—"}</p>
              </div>
            </div>

            {item.description && (
              <div className="text-[11px] text-muted-foreground border-t pt-1.5">
                <span>Descrição / Detalhe:</span>
                <p className="font-medium text-foreground truncate">{item.description}</p>
              </div>
            )}

            <div className="text-[11px] text-muted-foreground border-t pt-1.5 flex justify-between items-center">
              <span>ID da Operação:</span>
              <span className="font-mono text-foreground font-semibold">{item.id.slice(0, 16)}</span>
            </div>
          </div>

          {/* Comparativo de Valores */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/20 border rounded-lg text-xs">
            <div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">Valor Atual</span>
              <p className="text-base font-extrabold text-foreground mt-0.5">{formatCurrency(oldValue)}</p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-primary uppercase">Diferença / Ajuste</span>
              <p className={`text-base font-extrabold mt-0.5 ${adjustmentDiff >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {adjustmentDiff >= 0 ? `+${formatCurrency(adjustmentDiff)}` : formatCurrency(adjustmentDiff)}
              </p>
            </div>
          </div>

          {/* Form de Edição */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold text-foreground">Novo Valor Correto (R$)</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-bold">R$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newValueInput}
                  onChange={(e) => setNewValueInput(e.target.value)}
                  placeholder="0.00"
                  className="pl-9 h-9 text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-foreground">
                Motivo da Correção <span className="text-destructive">* (Obrigatório)</span>
              </Label>
              <Textarea
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Informe o motivo da correção (ex: Correção manual de valor lançado incorretamente para o motorista conforme dados do chamado)"
                className="text-xs mt-1 min-h-[70px]"
              />
            </div>
          </div>

          {/* Prompt de Confirmação */}
          {showConfirmation && (
            <div className="bg-amber-50 border border-amber-300 dark:bg-amber-950 dark:border-amber-800 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Confirmação de Ajuste Financeiro
              </div>
              <p className="text-amber-900 dark:text-amber-300 text-[11px]">
                Você confirma a alteração do valor de <strong>{formatCurrency(oldValue)}</strong> para <strong>{formatCurrency(parsedNewValue)}</strong> ({item.type}) para o beneficiário <strong>{item.driverName || item.storeName}</strong>?
              </p>
              <div className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">
                Admin Executor: {currentAdmin?.email || "Admin Autenticado"}
              </div>
            </div>
          )}

          {/* Informações do Administrador Executor */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Admin Responsável:
            </span>
            <span className="font-semibold text-primary">{currentAdmin?.email || "Administrador Autorizado"}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (showConfirmation) setShowConfirmation(false);
              else onOpenChange(false);
            }}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          {!showConfirmation ? (
            <Button
              size="sm"
              onClick={handleStartSave}
              disabled={isSubmitting}
              className="gap-1.5 font-bold bg-primary hover:bg-primary/90"
            >
              <Edit3 className="w-4 h-4" /> Continuar Correção
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleConfirmAndSave}
              disabled={isSubmitting}
              className="gap-1.5 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" /> Confirmar e Salvar no Banco
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
