import React, { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Store, Loader2, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export interface StoreOption {
  id: string;
  name: string;
  owner_id?: string | null;
  phone?: string | null;
  balance?: number;
}

interface DirectRechargeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores?: StoreOption[];
  promoPercent?: number;
}

export const DirectRechargeModal: React.FC<DirectRechargeModalProps> = ({
  open,
  onOpenChange,
  stores = [],
  promoPercent = 0,
}) => {
  const queryClient = useQueryClient();
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [amount, setAmount] = useState("50");
  const [applyPromo, setApplyPromo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  // Generate a fresh idempotency key every time modal is opened
  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [open]);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const currentBalance = Number(selectedStore?.balance || 0);
  const val = parseFloat(amount) || 0;
  const bonus = applyPromo && promoPercent > 0 ? (val * promoPercent) / 100 : 0;
  const totalCredited = val + bonus;
  const projectedBalance = currentBalance + totalCredited;

  const handleConfirm = async () => {
    if (!selectedStore) {
      toast.error("Selecione a loja destinatária");
      return;
    }
    if (val <= 0) {
      toast.error("Informe um valor numérico válido maior que zero");
      return;
    }
    if (!selectedStore.owner_id) {
      toast.error(`A loja "${selectedStore.name}" não possui um usuário proprietário vinculado.`);
      return;
    }

    setLoading(true);
    try {
      // 1. Send recharge request with idempotency key
      const { data, error } = await supabase.functions.invoke("admin-recharge-store", {
        body: {
          store_id: selectedStore.id,
          store_owner_id: selectedStore.owner_id,
          amount: val,
          apply_promo: applyPromo,
          idempotency_key: idempotencyKey,
        },
      });

      if (error) {
        // Fallback to direct RPC if Edge Function call had an error
        const { data: rpcData, error: rpcError } = await supabase.rpc("admin_recharge_store", {
          p_store_owner_id: selectedStore.owner_id,
          p_amount: val,
          p_apply_promo: applyPromo,
        });
        if (rpcError) throw rpcError;

        const auditCode = `RECARGA-${selectedStore.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()}-${idempotencyKey.slice(0, 6).toUpperCase()}`;
        await supabase.from("credit_codes").insert({
          code: auditCode,
          value: totalCredited,
          assigned_to_user_id: selectedStore.owner_id,
          used_by: selectedStore.owner_id,
          is_used: true,
          used_at: new Date().toISOString(),
        } as any);

        toast.success(
          `Recarga de R$ ${val.toFixed(2)} creditada na loja "${selectedStore.name}"! Total creditado: R$ ${Number(rpcData || totalCredited).toFixed(2)}`
        );
      } else if (!data?.success) {
        throw new Error(data?.message || "Erro ao realizar recarga");
      } else {
        toast.success(
          data.message || `Recarga de R$ ${val.toFixed(2)} creditada com sucesso na loja "${selectedStore.name}"!`
        );
      }

      // Invalidate all related caches
      queryClient.invalidateQueries({ queryKey: ["admin-credit-codes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stores-recharge-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-store-credits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });

      onOpenChange(false);
      setAmount("50");
      setSelectedStoreId("");
      setIdempotencyKey(crypto.randomUUID());
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar recarga direta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Store className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Lançar Recarga Direta na Loja
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Adiciona crédito imediatamente na carteira da loja selecionada com garantia de idempotência e registro financeiro auditável.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Loja Destinatária */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Loja Destinatária *</Label>
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a loja..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    <span className="font-medium">{s.name}</span>{" "}
                    <span className="text-muted-foreground">
                      (Saldo: R$ {(s.balance ?? 0).toFixed(2)})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor da Recarga */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Valor da Recarga (R$) *</Label>
            <Input
              type="number"
              step="0.01"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-sm font-semibold h-9"
              placeholder="Ex: 50.00"
            />
          </div>

          {/* Bônus Promocional */}
          {promoPercent > 0 && (
            <div className="flex items-center space-x-2 pt-0.5">
              <Checkbox
                id="applyPromoModal"
                checked={applyPromo}
                onCheckedChange={(c) => setApplyPromo(!!c)}
              />
              <label
                htmlFor="applyPromoModal"
                className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Aplicar bônus promocional configurado (+{promoPercent}%)
              </label>
            </div>
          )}

          {/* Painel de Conferência de Saldos */}
          {selectedStore && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-xs">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Loja:</span>
                <span className="font-semibold text-foreground">{selectedStore.name}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Saldo atual:</span>
                <span className="font-medium text-foreground">R$ {currentBalance.toFixed(2)}</span>
              </div>
              {bonus > 0 && (
                <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                  <span>Bônus promocional (+{promoPercent}%):</span>
                  <span className="font-medium">+ R$ {bonus.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-teal-700 dark:text-teal-300 font-medium">
                <span>Total a creditar:</span>
                <span className="font-bold">+ R$ {totalCredited.toFixed(2)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center font-bold">
                <span className="flex items-center gap-1">
                  Saldo final projetado <ArrowRight className="w-3 h-3 text-muted-foreground" />
                </span>
                <span className="text-sm text-primary">R$ {projectedBalance.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
            <span>Operação com controle de idempotência contra cliques duplicados.</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={loading || !selectedStoreId || val <= 0}
            className="bg-teal-600 hover:bg-teal-700 text-white font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Creditando Loja...
              </>
            ) : (
              "Confirmar e Creditar Loja"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
