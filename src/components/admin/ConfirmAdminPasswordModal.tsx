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
import { Badge } from "@/components/ui/badge";
import { Lock, ShieldCheck, Loader2, KeyRound, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ConfirmAdminPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

export const ConfirmAdminPasswordModal: React.FC<ConfirmAdminPasswordModalProps> = ({
  open,
  onOpenChange,
  title = "Confirmação de Segurança Requerida",
  description = "Por motivos de segurança, digite a sua senha de administrador para autorizar esta alteração.",
  actionLabel = "Confirmar Alteração",
  onConfirm,
  loading: externalLoading = false,
}) => {
  const [password, setPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setErrorMsg(null);
      setVerifying(false);
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user?.email) {
          setAdminEmail(user.email);
        }
      });
    }
  }, [open]);

  const handleVerifyAndProceed = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim()) {
      setErrorMsg("Informe sua senha de administrador para continuar.");
      return;
    }

    setVerifying(true);
    setErrorMsg(null);

    try {
      // Fetch current admin user
      const { data: { user } } = await supabase.auth.getUser();
      const emailToVerify = adminEmail || user?.email;

      if (!emailToVerify) {
        throw new Error("Sessão de administrador não identificada.");
      }

      // Re-authenticate with entered password to verify admin identity
      const { error } = await supabase.auth.signInWithPassword({
        email: emailToVerify,
        password: password,
      });

      if (error) {
        setErrorMsg("Senha incorreta. A alteração foi bloqueada por segurança.");
        toast.error("Senha administrativa incorreta!");
        setVerifying(false);
        return;
      }

      // Password is valid! Proceed with callback action
      toast.success("Autenticação de admin confirmada com sucesso.");
      onOpenChange(false);
      await onConfirm();
    } catch (err: any) {
      console.error("[ConfirmAdminPasswordModal] Error:", err);
      setErrorMsg(err?.message || "Erro ao autenticar senha administrativa.");
      toast.error("Falha na validação da senha.");
    } finally {
      setVerifying(false);
    }
  };

  const isProcessing = verifying || externalLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleVerifyAndProceed}>
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <div className="p-2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Lock className="w-5 h-5" />
              </div>
              {title}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {adminEmail && (
              <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg border text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> Admin Autenticado:
                </span>
                <Badge variant="outline" className="font-mono text-[11px] bg-background">
                  {adminEmail}
                </Badge>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="admin-verify-password" className="text-xs font-semibold flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" /> Senha do Administrador *
              </Label>
              <Input
                id="admin-verify-password"
                type="password"
                placeholder="Digite sua senha de acesso..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                disabled={isProcessing}
                autoFocus
                className="h-10 text-sm"
              />
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
              className="text-xs font-medium"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isProcessing || !password.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verificando...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-1.5" /> {actionLabel}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmAdminPasswordModal;
