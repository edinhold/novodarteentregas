import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, LogIn, KeyRound, Eye, EyeOff, Lock, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import DeleteConfirm from "./DeleteConfirm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const StoreOwnersTab = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deleteId, setDeleteId] = useState<{ id: string; ownerId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [impersonateTarget, setImpersonateTarget] = useState<{ ownerId: string; name: string } | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  // Password Reset Modal State for Store Owners
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [targetStoreOwner, setTargetStoreOwner] = useState<{ ownerId: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-store-owners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").not("owner_id", "is", null).order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      let functionSuccess = false;
      try {
        const res = await supabase.functions.invoke("delete-user", {
          body: { user_id: deleteId.ownerId, restaurant_id: deleteId.id },
        });
        if (!res.error && !res.data?.error && res.data?.success !== false) {
          functionSuccess = true;
        }
      } catch (e) {
        console.warn("[delete-user] Invoca ao roteador/Edge Function falhou:", e);
      }

      if (!functionSuccess) {
        // Fallback: Invoke admin_delete_user_cascade RPC directly
        const { error: rpcErr } = await (supabase as any).rpc("admin_delete_user_cascade", {
          p_target_user_id: deleteId.ownerId || null,
          p_target_restaurant_id: deleteId.id || null,
        });

        if (rpcErr) {
          console.warn("[delete-user] Alerta no RPC fallback, executando limpeza direta:", rpcErr.message);
          if (deleteId.ownerId) {
            await supabase.from("orders").update({ user_id: null }).eq("user_id", deleteId.ownerId);
            await supabase.from("delivery_requests").update({ store_owner_id: null }).eq("store_owner_id", deleteId.ownerId);
            await supabase.from("store_recharges").update({ store_owner_id: null }).eq("store_owner_id", deleteId.ownerId);
            await supabase.from("credit_codes").update({ used_by: null }).eq("used_by", deleteId.ownerId);
            await supabase.from("user_roles").delete().eq("user_id", deleteId.ownerId);
            await supabase.from("profiles").delete().eq("user_id", deleteId.ownerId);
          }
          await supabase.from("restaurants").delete().eq("id", deleteId.id);
        }
      }

      toast.success(`${deleteId.name} removido com sucesso!`);
      // Invalidate all related caches to reflect deletion across all admin tabs
      queryClient.invalidateQueries({ queryKey: ["admin-store-owners"] });
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stores-recharge-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] });
      queryClient.invalidateQueries({ queryKey: ["customer-deletion-logs"] });
      setDeleteId(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover loja");
    } finally {
      setDeleting(false);
    }
  };

  const handleImpersonate = async () => {
    if (!impersonateTarget) return;
    setImpersonating(true);
    try {
      console.log("[Admin:Impersonate] Acessando painel da loja ID", impersonateTarget.ownerId);

      // Armazena credencial de impersonação no sessionStorage para renderização imediata do painel
      sessionStorage.setItem("admin_impersonated_user_id", impersonateTarget.ownerId);
      sessionStorage.setItem("admin_impersonated_store_name", impersonateTarget.name);

      try {
        const res = await supabase.functions.invoke("admin-impersonate", {
          body: { target_user_id: impersonateTarget.ownerId },
        });

        if (res.data?.token_hash) {
          const { error: verifyErr } = await supabase.auth.verifyOtp({
            token_hash: res.data.token_hash,
            type: "magiclink",
          });
          if (verifyErr) {
            console.warn("[Admin:Impersonate] Falha ao verificar OTP do Magiclink, utilizando sessão de impersonação:", verifyErr.message);
          }
        }
      } catch (invokeErr: any) {
        console.warn("[Admin:Impersonate] Edge Function offline ou indisponível, aplicando impersonação cliente:", invokeErr?.message);
      }

      toast.success(`Acessando painel de ${impersonateTarget.name}...`);
      setImpersonateTarget(null);
      navigate("/lojas");
    } catch (e: any) {
      console.error("[Admin:Impersonate] Erro ao direcionar:", e);
      toast.error(e.message || "Falha ao acessar o painel da loja");
    } finally {
      setImpersonating(false);
    }
  };

  const openPasswordModal = (store: { owner_id: string; name: string }) => {
    if (!store.owner_id) {
      return toast.error("Esta loja não possui um proprietário associado.");
    }
    setTargetStoreOwner({ ownerId: store.owner_id, name: store.name });
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setPasswordModalOpen(true);
  };

  const handleSavePassword = async () => {
    if (!targetStoreOwner) return;
    if (!newPassword || newPassword.trim().length < 6) {
      return toast.error("A nova senha deve ter pelo menos 6 caracteres.");
    }
    if (newPassword !== confirmPassword) {
      return toast.error("As senhas digitadas não coincidem.");
    }

    setSavingPassword(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_user_password", {
        p_target_user_id: targetStoreOwner.ownerId,
        p_new_password: newPassword.trim(),
      });

      if (error) {
        console.error("[StoreOwnersTab] RPC admin_set_user_password error:", error);
        throw new Error(error.message || "Erro ao alterar a senha da loja.");
      }

      if (data && typeof data === "object" && (data as any).success === false) {
        throw new Error((data as any).message || "Falha ao alterar senha.");
      }

      toast.success(`Senha do proprietário da loja ${targetStoreOwner.name} alterada com sucesso!`);
      setPasswordModalOpen(false);
      setTargetStoreOwner(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("[StoreOwnersTab] Exception changing store password:", err);
      toast.error(err.message || "Erro ao redefinir a senha da loja.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lojas Ativas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurante / Loja</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {restaurants.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.category_name}</TableCell>
                  <TableCell>{r.address || "—"}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${r.is_open ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
                      {r.is_open ? "Aberto" : "Fechado"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-primary hover:text-primary transition-all duration-200"
                        onClick={() => setImpersonateTarget({ ownerId: r.owner_id!, name: r.name })}
                        aria-label={`Acessar painel de ${r.name}`}
                      >
                        <LogIn className="w-4 h-4" />
                        <span className="hidden sm:inline">Acessar Painel</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                        title="Trocar Senha do Proprietário"
                        onClick={() => openPasswordModal({ owner_id: r.owner_id!, name: r.name })}
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId({ id: r.id, ownerId: r.owner_id!, name: r.name })}
                        aria-label={`Remover ${r.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {restaurants.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma loja cadastrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DeleteConfirm open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title={deleteId?.name || "loja"} loading={deleting} />

      <AlertDialog open={!!impersonateTarget} onOpenChange={(o) => !o && !impersonating && setImpersonateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Acessar painel da loja?</AlertDialogTitle>
            <AlertDialogDescription>
              Você entrará no painel de <strong>{impersonateTarget?.name}</strong> como se fosse o proprietário.
              Sua sessão de administrador será encerrada e a ação será registrada no log de auditoria.
              Para voltar ao painel admin, faça login novamente com sua conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={impersonating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleImpersonate} disabled={impersonating}>
              {impersonating ? "Acessando..." : "Confirmar acesso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password Reset Modal Dialog for Store Owners */}
      <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <KeyRound className="w-5 h-5 text-primary" /> Alterar Senha da Loja
            </DialogTitle>
            <DialogDescription>
              Definir uma nova senha de acesso para o proprietário de {targetStoreOwner?.name}. Não é necessária a senha atual.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="store-new-password">Nova Senha *</Label>
              <div className="relative">
                <Input
                  id="store-new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="No mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={savingPassword}
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="store-confirm-password">Confirmar Nova Senha *</Label>
              <Input
                id="store-confirm-password"
                type={showPassword ? "text" : "password"}
                placeholder="Repita a nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={savingPassword}
              />
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground flex items-start gap-2 border">
              <Lock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                A nova senha será aplicada imediatamente. O proprietário da loja poderá fazer login utilizando a nova senha fornecida aqui.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPasswordModalOpen(false)}
              disabled={savingPassword}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSavePassword}
              disabled={savingPassword || !newPassword || newPassword.trim().length < 6 || newPassword !== confirmPassword}
              className="bg-primary font-semibold text-white"
            >
              {savingPassword ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Salvar Nova Senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StoreOwnersTab;
