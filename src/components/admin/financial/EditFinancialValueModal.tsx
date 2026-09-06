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
import { Edit3, RefreshCw, AlertTriangle, Store, Calendar, ShieldCheck, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDateTime } from "@/utils/financialCalculations";

export interface FinancialEditableItem {
  id: string;
  type: "Recarga" | "Recarga Direta";
  storeName: string;
  ownerName?: string;
  storeUserId?: string;
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
    }
  }, [open]);

  // Set initial input when item changes
  useEffect(() => {
    if (item) {
      setNewValueInput(String(item.currentValue || 0));
      setReasonInput("");
    }
  }, [item]);

  if (!item) return null;

  const oldValue = Number(item.currentValue) || 0;
  const parsedNewValue = parseFloat(newValueInput.replace(",", ".")) || 0;
  const adjustmentDiff = parsedNewValue - oldValue;

  const handleSaveCorrection = async () => {
    if (isNaN(parsedNewValue) || parsedNewValue < 0) {
      toast.error("Por favor, informe um novo valor válido (não negativo).");
      return;
    }

    if (parsedNewValue === oldValue) {
      toast.error("O novo valor informado é idêntico ao valor atual.");
      return;
    }

    if (!reasonInput.trim()) {
      toast.error("Por favor, informe o motivo da correção para o histórico de auditoria.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      // 1. UPDATE TARGET FINANCIAL TABLE
      if (item.type === "Recarga") {
        // Update credit code value
        const { error: codeErr } = await supabase
          .from("credit_codes")
          .update({ value: parsedNewValue })
          .eq("id", item.id);

        if (codeErr) throw codeErr;

        // If code is used and assigned to a store, adjust store_credits balance by the difference
        const codeObj = item.rawObject;
        const targetUserId = item.storeUserId || codeObj?.used_by || codeObj?.assigned_to_user_id;

        if (targetUserId && (codeObj?.is_used || codeObj?.used_by)) {
          // Fetch existing store_credits record
          const { data: storeCredit } = await supabase
            .from("store_credits")
            .select("id, balance")
            .eq("user_id", targetUserId)
            .maybeSingle();

          if (storeCredit) {
            const currentBal = Number(storeCredit.balance) || 0;
            const updatedBal = Math.max(0, currentBal + adjustmentDiff);
            await supabase
              .from("store_credits")
              .update({ balance: updatedBal, updated_at: new Date().toISOString() })
              .eq("id", storeCredit.id);
          }
        }
      } else if (item.type === "Recarga Direta") {
        // Update store_credits balance for direct recharge
        if (item.storeUserId) {
          const { data: storeCredit } = await supabase
            .from("store_credits")
            .select("id, balance")
            .eq("user_id", item.storeUserId)
            .maybeSingle();

          if (storeCredit) {
            const currentBal = Number(storeCredit.balance) || 0;
            const updatedBal = Math.max(0, currentBal + adjustmentDiff);
            const { error: scErr } = await supabase
              .from("store_credits")
              .update({ balance: updatedBal, updated_at: new Date().toISOString() })
              .eq("id", storeCredit.id);
            if (scErr) throw scErr;
          }
        } else {
          // Update by store_credits record id
          const { error: scErr } = await supabase
            .from("store_credits")
            .update({ balance: parsedNewValue, updated_at: new Date().toISOString() })
            .eq("id", item.id);
          if (scErr) throw scErr;
        }
      }

      // 2. INSERT AUDIT LOG IN financial_adjustment_logs
      try {
        await supabase.from("financial_adjustment_logs" as any).insert({
          admin_user_id: user.id,
          admin_email: user.email || "admin@duarte.com",
          transaction_id: item.id,
          store_id: item.storeUserId || null,
          store_name: item.storeName || "Loja",
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

      // 3. INVALIDATE REACT QUERY CACHE
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["financial-credit-codes"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-store-credits"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-audit-logs"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] }),
        queryClient.invalidateQueries({ queryKey: ["my-credits"] }),
        queryClient.invalidateQueries({ queryKey: ["store-credits"] }),
      ]);

      toast.success(`Valor corrigido com sucesso de ${formatCurrency(oldValue)} para ${formatCurrency(parsedNewValue)}!`);

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Erro ao corrigir valor financeiro:", err);
      toast.error(`Falha ao salvar correção: ${err.message || "Erro interno no servidor"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-black text-lg">
            <Edit3 className="w-5 h-5 text-primary" />
            Editar Valor do Lançamento Financeiro
          </DialogTitle>
          <DialogDescription className="text-xs">
            Corrija o valor de um lançamento inserido incorretamente. O novo valor atualizará o saldo da loja e recalculará os totais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card com Detalhes da Operação */}
          <div className="bg-muted/40 border rounded-lg p-3 space-y-2 text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-primary" />
                Loja: <strong>{item.storeName}</strong>
              </span>
              <Badge variant="outline" className="text-[10px] font-bold">
                {item.type}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1">
              <div>
                <span>Proprietário:</span>
                <p className="font-medium text-foreground truncate">{item.ownerName || "—"}</p>
              </div>
              <div>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-muted-foreground" /> Data Lançamento:
                </span>
                <p className="font-medium text-foreground">{item.date ? formatDateTime(item.date) : "—"}</p>
              </div>
            </div>

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
                placeholder="Informe o motivo da correção (ex: Digitação incorreta do valor da recarga por solicitação do lojista)"
                className="text-xs mt-1 min-h-[70px]"
              />
            </div>
          </div>

          {/* Informações do Administrador Executor */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Admin Responsável:
            </span>
            <span className="font-semibold text-primary">{currentAdmin?.email || "Administrador"}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSaveCorrection}
            disabled={isSubmitting}
            className="gap-1.5 font-bold bg-primary hover:bg-primary/90"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Salvando Correção...
              </>
            ) : (
              <>
                <Edit3 className="w-4 h-4" /> Confirmar e Salvar Correção
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
