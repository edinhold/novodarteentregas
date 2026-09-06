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
      const { data: { user } } = await supabase.auth.getUser();

      // 1. If RPC admin_cleanup_financials exists, call it. Otherwise do structured table operations safely.
      let rpcSuccess = false;
      try {
        const { error: rpcError } = await supabase.rpc("admin_cleanup_financials" as any);
        if (!rpcError) {
          rpcSuccess = true;
        }
      } catch (e) {
        // Fallback to table queries if RPC isn't available
        rpcSuccess = false;
      }

      if (!rpcSuccess) {
        // Safe table-level reset without breaking operational schema
        // a) Zero out store credits balances
        const { error: creditsError } = await supabase
          .from("store_credits")
          .update({ balance: 0, updated_at: new Date().toISOString() })
          .neq("balance", 0);
        if (creditsError) console.warn("Aviso ao zerar store_credits:", creditsError);

        // b) Clear withdrawal requests
        const { error: withdrawalsError } = await supabase
          .from("withdrawal_requests")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (withdrawalsError) console.warn("Aviso ao limpar withdrawal_requests:", withdrawalsError);

        // c) Clear credit codes
        const { error: codesError } = await supabase
          .from("credit_codes")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (codesError) console.warn("Aviso ao limpar credit_codes:", codesError);
      }

      // 2. Insert audit log in financial_cleanup_logs
      try {
        await supabase.from("financial_cleanup_logs" as any).insert({
          performed_by: user?.id || null,
          cleanup_type: "RESET_FINANCIAL_MODULE",
          backup_executed: backupExecuted,
          notes: `Módulo financeiro reiniciado pelo administrador em ${new Date().toLocaleString("pt-BR")}.`,
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn("Aviso ao registrar log de auditoria:", logErr);
      }

      // 3. Invalidate query cache so UI refreshes cleanly
      await queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] });
      await queryClient.invalidateQueries({ queryKey: ["store-credits"] });
      await queryClient.invalidateQueries({ queryKey: ["my-credits"] });
      await queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] });
      await queryClient.invalidateQueries({ queryKey: ["credit-codes"] });

      toast.success("Módulo financeiro zerado e reiniciado com sucesso! Todos os dados operacionais foram preservados.");
      
      setConfirmationInput("");
      onOpenChange(false);
      if (onResetSuccess) onResetSuccess();
    } catch (error: any) {
      console.error("Erro ao reiniciar módulo financeiro:", error);
      toast.error(`Falha ao reiniciar módulo financeiro: ${error.message || "Erro no servidor"}`);
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
          <DialogDescription className="text-xs">
            Esta ação é irreversível e zerará todos os saldos de créditos, códigos e solicitações de saques.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning Banner */}
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-xs space-y-2">
            <div className="flex items-start gap-2 font-bold text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>O QUE SERÁ AFETADO E O QUE SERÁ MANTIDO:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px] pl-1">
              <li>
                <strong className="text-foreground">Zerar:</strong> Saldos de créditos das lojas, históricos de saques e códigos de créditos.
              </li>
              <li>
                <strong className="text-emerald-600 dark:text-emerald-400">Preservados:</strong> Lojas, Motoristas, Pedidos de entrega, Produtos, Usuários, Autenticação e Configurações da Plataforma.
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
