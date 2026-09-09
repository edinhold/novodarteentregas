import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ShieldCheck,
  UserPlus,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  Loader2,
} from "lucide-react";

const AdminsTab = () => {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);

  // Password Reset Modal State
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [targetAdmin, setTargetAdmin] = useState<{ userId: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const { data: drivers = [] } = useQuery({
    queryKey: ["all-drivers-for-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("id, user_id, full_name, phone");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: admins = [] } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .eq("role", "admin");
      if (error) throw error;

      const enriched = await Promise.all(
        data.map(async (role: any) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, phone")
            .eq("user_id", role.user_id)
            .maybeSingle();
          return { ...role, full_name: profile?.full_name || "—", phone: profile?.phone || "—" };
        })
      );
      return enriched;
    },
  });

  // Pending and reviewed admin requests
  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["admin-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const adminUserIds = new Set(admins.map((a: any) => a.user_id));
  const availableDrivers = drivers.filter((d: any) => !adminUserIds.has(d.user_id));

  const assignAdminRole = async (targetUserId: string) => {
    // 1. Try Edge Function first
    try {
      const { data, error } = await supabase.functions.invoke("assign-admin-role", {
        body: { user_id: targetUserId },
      });
      if (!error && data?.success) {
        return true;
      }
      if (data?.error) {
        console.warn("[assign-admin-role] Edge Function retornou erro:", data.error);
      }
    } catch (e) {
      console.warn("[assign-admin-role] Edge Function falhou, aplicando fallback no banco de dados:", e);
    }

    // 2. Fallback: Direct database insertion into user_roles
    const { data: existing } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await supabase
        .from("user_roles")
        .insert({ user_id: targetUserId, role: "admin" as any });

      if (insertErr) {
        throw new Error(insertErr.message || "Não foi possível conceder a permissão de administrador.");
      }
    }

    return true;
  };

  const handleAdd = async () => {
    if (!selectedUserId) {
      toast.error("Selecione uma pessoa / motorista");
      return;
    }
    setLoading(true);
    try {
      await assignAdminRole(selectedUserId);
      toast.success("Administrador adicionado com sucesso!");
      setSelectedUserId("");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["all-drivers-for-admin"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar administrador");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (roleId: string, userId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id === userId) {
      toast.error("Você não pode remover a si mesmo como administrador");
      return;
    }
    setRemoving(roleId);
    try {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
      toast.success("Administrador removido");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover");
    } finally {
      setRemoving(null);
    }
  };

  const handleApproveRequest = async (request: any) => {
    setApproving(request.id);
    try {
      // Assign admin role with direct DB fallback
      await assignAdminRole(request.user_id);

      // Update admin_requests status
      const { data: { session } } = await supabase.auth.getSession();
      await (supabase.from("admin_requests" as any) as any)
        .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: session?.user.id })
        .eq("id", request.id);

      toast.success(`${request.full_name} aprovado como administrador!`);
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao aprovar administrador");
    } finally {
      setApproving(null);
    }
  };

  const handleRejectRequest = async (request: any) => {
    setApproving(request.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await (supabase.from("admin_requests" as any) as any)
        .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: session?.user.id })
        .eq("id", request.id);

      toast.success(`Solicitação de ${request.full_name} recusada`);
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao recusar");
    } finally {
      setApproving(null);
    }
  };

  // Delete individual request entry from admin_requests
  const handleDeleteRequest = async (requestId: string, name: string) => {
    setDeletingRequestId(requestId);
    try {
      const { error } = await supabase
        .from("admin_requests" as any)
        .delete()
        .eq("id", requestId);

      if (error) throw error;

      toast.success(`Solicitação de ${name} excluída com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
    } catch (err: any) {
      console.error("[AdminsTab] Error deleting admin_request:", err);
      toast.error(err.message || "Erro ao excluir solicitação do histórico.");
    } finally {
      setDeletingRequestId(null);
    }
  };

  // Open Change Password Modal for specific admin
  const openPasswordModal = (admin: { user_id: string; full_name: string }) => {
    setTargetAdmin({ userId: admin.user_id, name: admin.full_name });
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setPasswordModalOpen(true);
  };

  // Execute password change for specific admin (without requiring current password)
  const handleSavePassword = async () => {
    if (!targetAdmin) return;
    if (!newPassword || newPassword.trim().length < 6) {
      return toast.error("A nova senha deve ter pelo menos 6 caracteres.");
    }
    if (newPassword !== confirmPassword) {
      return toast.error("As senhas digitadas não coincidem.");
    }

    setSavingPassword(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_user_password", {
        p_target_user_id: targetAdmin.userId,
        p_new_password: newPassword.trim(),
      });

      if (error) {
        console.error("[AdminsTab] RPC admin_set_user_password error:", error);
        throw new Error(error.message || "Erro ao alterar a senha do administrador.");
      }

      if (data && typeof data === "object" && (data as any).success === false) {
        throw new Error((data as any).message || "Falha ao alterar senha.");
      }

      toast.success(`Senha de ${targetAdmin.name} alterada com sucesso!`);
      setPasswordModalOpen(false);
      setTargetAdmin(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("[AdminsTab] Exception changing admin password:", err);
      toast.error(err.message || "Erro ao redefinir a senha do administrador.");
    } finally {
      setSavingPassword(false);
    }
  };

  const pending = pendingRequests.filter((r: any) => r.status === "pending");
  const reviewed = pendingRequests.filter((r: any) => r.status !== "pending");

  return (
    <div className="space-y-4">
      {/* Pending admin requests */}
      {pending.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Solicitações Pendentes ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((req: any) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.full_name}</TableCell>
                    <TableCell className="text-sm">{req.email}</TableCell>
                    <TableCell className="text-sm">{req.phone || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8"
                          onClick={() => handleApproveRequest(req)}
                          disabled={approving === req.id || deletingRequestId === req.id}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8"
                          onClick={() => handleRejectRequest(req)}
                          disabled={approving === req.id || deletingRequestId === req.id}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Recusar
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          title="Excluir Solicitação"
                          onClick={() => handleDeleteRequest(req.id, req.full_name)}
                          disabled={deletingRequestId === req.id || approving === req.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Promote driver */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Promover Motorista a Administrador
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione um motorista..." />
              </SelectTrigger>
              <SelectContent>
                {availableDrivers.map((d: any) => (
                  <SelectItem key={d.user_id} value={d.user_id}>
                    {d.full_name} — {d.phone}
                  </SelectItem>
                ))}
                {availableDrivers.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum motorista disponível</div>
                )}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={loading || !selectedUserId}>
              {loading ? "Adicionando..." : "Promover"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Selecione um motorista cadastrado para promovê-lo a administrador.
          </p>
        </CardContent>
      </Card>

      {/* Current admins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Administradores Atuais
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin: any) => (
                <TableRow key={admin.id}>
                  <TableCell className="font-medium">{admin.full_name}</TableCell>
                  <TableCell>{admin.phone}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{admin.user_id.slice(0, 8)}...</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs font-medium border-primary/30 hover:bg-primary/10 hover:text-primary"
                        title="Alterar Senha deste Administrador"
                        onClick={() => openPasswordModal(admin)}
                      >
                        <KeyRound className="w-3.5 h-3.5 text-primary" />
                        Trocar Senha
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        title="Remover Permissão de Administrador"
                        onClick={() => handleRemove(admin.id, admin.user_id)}
                        disabled={removing === admin.id}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {admins.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhum administrador encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reviewed requests history with individual deletion */}
      {reviewed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Histórico de Solicitações ({reviewed.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewed.map((req: any) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.full_name}</TableCell>
                    <TableCell className="text-sm">{req.email}</TableCell>
                    <TableCell>
                      <Badge variant={req.status === "approved" ? "default" : "destructive"}>
                        {req.status === "approved" ? "Aprovado" : "Recusado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(req.reviewed_at || req.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        title="Excluir Definitivamente do Histórico"
                        onClick={() => handleDeleteRequest(req.id, req.full_name)}
                        disabled={deletingRequestId === req.id}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Password Reset Modal Dialog for Admin Users */}
      <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <KeyRound className="w-5 h-5 text-primary" /> Alterar Senha de Administrador
            </DialogTitle>
            <DialogDescription>
              Definir uma nova senha para {targetAdmin?.name}. Não é necessária a senha atual.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="admin-new-password">Nova Senha *</Label>
              <div className="relative">
                <Input
                  id="admin-new-password"
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
              <Label htmlFor="admin-confirm-password">Confirmar Nova Senha *</Label>
              <Input
                id="admin-confirm-password"
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
                A nova senha será aplicada imediatamente no sistema. O administrador poderá fazer login usando a nova senha sem precisar informar a antiga.
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
    </div>
  );
};

export default AdminsTab;
