import React, { useState } from "react";
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
import { AlertTriangle, Download, RefreshCw, ShieldAlert, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { FinancialBackupService } from "@/services/FinancialBackupService";

interface FinancialResetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResetSuccess?: () => void;
}

const REQUIRED_CONFIRMATION_TEXT = "REINICIAR FINANCEIRO";

export const FinancialResetModal: React.FC<FinancialResetModalProps> = ({
  open,
  onOpenChange,
  onResetSuccess,
}) => {
  const queryClient = useQueryClient();
  const [confirmationInput, setConfirmationInput] = useState("");
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [backupExecuted, setBackupExecuted] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleBackup = async () => {
    setIsBackupLoading(true);
    try {
      const { filename, recordCount } = await FinancialBackupService.downloadBackup();
      setBackupExecuted(true);
      toast.success(`Backup baixado com sucesso: ${filename} (${recordCount} registros)`);
    } catch (error: any) {
      console.error("Erro ao gerar backup prévio:", error);
      toast.error(`Falha ao gerar backup: ${error.message || "Erro desconhecido"}`);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleReset = async () => {
    if (confirmationInput.trim() !== REQUIRED_CONFIRMATION_TEXT) {
      toast.error(`Digite exatamente "${REQUIRED_CONFIRMATION_TEXT}" para confirmar.`);
      return;
    }

    setIsResetting(true);
    try {
      let resetDone = false;
      let resetErrorMsg = "";

      // 1. Primary execution via Edge Function router
      try {
        const { data, error } = await supabase.functions.invoke("admin-reset-financial", {
          body: { backup_executed: backupExecuted },
        });

        if (!error && data && data.success !== false) {
          resetDone = true;
        } else {
          resetErrorMsg = error?.message || data?.error || "Falha na chamada do servidor.";
        }
      } catch (err: any) {
        resetErrorMsg = err?.message || "Erro de conexão com o servidor.";
      }

      // 2. Guaranteed local client fallback if edge function call failed or timed out
      if (!resetDone) {
        console.warn("[FinancialResetModal] Executando fallback seguro no cliente devido a:", resetErrorMsg);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sessão de usuário não encontrada.");

        const resetTimestamp = new Date().toISOString();

        // Store timestamp in site_settings
        const { error: setErr } = await supabase.from("site_settings").upsert(
          {
            key: "last_financial_reset_at",
            value: { timestamp: resetTimestamp, admin_id: user.id },
            updated_at: resetTimestamp,
          },
          { onConflict: "key" }
        );

        if (setErr) throw setErr;

        // Insert audit log (preserving wallet balances 100%)
        try {
          await supabase.from("financial_cleanup_logs" as any).insert({
            admin_user_id: user.id,
            reason: "RESET_FINANCIAL_PERIOD: Período financeiro reiniciado. Os saldos das carteiras de lojistas e motoristas foram 100% preservados.",
            deleted_delivered_requests: 0,
            deleted_delivered_orders: 0,
            deleted_earnings: 0,
            deleted_withdrawals: 0,
            created_at: resetTimestamp,
            from_date: null,
            to_date: resetTimestamp,
          });
        } catch (auditErr) {
          console.warn("[FinancialResetModal] Audit log warning:", auditErr);
        }

        resetDone = true;
      }

      // Invalidate all financial-related queries across TanStack Query cache
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-credit-codes"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-store-credits"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-delivery-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-driver-earnings"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-drivers"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-store-owners"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stores-recharge-list"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-cleanup-logs"] }),
        queryClient.invalidateQueries({ queryKey: ["delivery-config"] }),
        queryClient.invalidateQueries({ queryKey: ["site-settings-financial-reset"] }),
        queryClient.invalidateQueries({ queryKey: ["store-credits"] }),
        queryClient.invalidateQueries({ queryKey: ["my-credits"] }),
        queryClient.invalidateQueries({ queryKey: ["credit-codes"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] }),
        queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] }),
      ]);

      toast.success("Módulo financeiro reiniciado com sucesso! Indicadores zerados e saldos de carteiras 100% mantidos.");

      setConfirmationInput("");
      onOpenChange(false);
      if (onResetSuccess) onResetSuccess();
    } catch (error: any) {
      console.error("Erro ao reiniciar módulo financeiro:", error);
      toast.error(`Falha ao reiniciar módulo financeiro: ${error.message || "Erro na operação"}`);
    } finally {
      setIsResetting(false);
    }
  };

  const isConfirmed = confirmationInput.trim() === REQUIRED_CONFIRMATION_TEXT;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive font-black text-lg">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            Reiniciar Módulo Financeiro
          </DialogTitle>
          <DialogDescription className="text-xs text-foreground/90 font-medium pt-1">
            Deseja realmente reiniciar o Financeiro? Os indicadores e movimentações do período financeiro serão zerados. Os saldos das carteiras das lojas e os valores que os motoristas têm a receber NÃO serão alterados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning Banner */}
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-xs space-y-2">
            <div className="flex items-start gap-2 font-bold text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>SEPARAÇÃO ENTRE PERÍODO FINANCEIRO E CARTEIRAS:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px] pl-1">
              <li>
                <strong className="text-foreground">Zerar no Financeiro:</strong> Indicadores administrativos, Total de Recargas do período, Entradas, Comissão e Receita Operacional.
              </li>
              <li>
                <strong className="text-emerald-600 dark:text-emerald-400">Preservar 100% Intactos:</strong> Saldos de Créditos das Lojas, Valores a Receber dos Motoristas, Solicitações de Saques Pendentes, Usuários, Lojas e Motoristas.
              </li>
            </ul>
          </div>

          {/* Backup Button Recommendation */}
          <div className="bg-muted/40 border rounded-lg p-3 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-primary" />
                Backup Recomendado
              </span>
              {backupExecuted && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Backup Realizado
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Recomendamos fazer o download da cópia de segurança antes de prosseguir com a limpeza.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs font-semibold gap-1.5"
              onClick={handleBackup}
              disabled={isBackupLoading}
            >
              {isBackupLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Gerando Backup...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-primary" />
                  {backupExecuted ? "Baixar Backup Novamente" : "Fazer Backup dos Dados Agora"}
                </>
              )}
            </Button>
          </div>

          {/* Double Confirmation Input */}
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs font-bold text-foreground">
              Para confirmar, digite exatamente <span className="text-destructive font-mono uppercase">{REQUIRED_CONFIRMATION_TEXT}</span> abaixo:
            </Label>
            <Input
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder={REQUIRED_CONFIRMATION_TEXT}
              className="font-mono text-xs uppercase"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isResetting}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleReset}
            disabled={!isConfirmed || isResetting}
            className="gap-1.5 font-bold"
          >
            {isResetting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Reiniciando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" /> Confirmar Reinício do Financeiro
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
