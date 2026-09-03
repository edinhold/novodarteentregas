import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, UserPlus, Trash2, Clock, CheckCircle, XCircle } from "lucide-react";

const AdminsTab = () => {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

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

  // Pending admin requests
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

  const handleAdd = async () => {
    if (!selectedUserId) {
      toast.error("Selecione um motorista");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("assign-admin-role", {
        body: { user_id: selectedUserId },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success("Administrador adicionado com sucesso!");
      setSelectedUserId("");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
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
      // Assign admin role via edge function
      const { data, error } = await supabase.functions.invoke("assign-admin-role", {
        body: { user_id: request.user_id },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); setApproving(null); return; }

      // Update request status
      const { data: { session } } = await supabase.auth.getSession();
      await (supabase.from("admin_requests" as any) as any)
        .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: session?.user.id })
        .eq("id", request.id);

      toast.success(`${request.full_name} aprovado como administrador!`);
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao aprovar");
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
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8"
                          onClick={() => handleApproveRequest(req)}
                          disabled={approving === req.id}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8"
                          onClick={() => handleRejectRequest(req)}
                          disabled={approving === req.id}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Recusar
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
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRemove(admin.id, admin.user_id)}
                      disabled={removing === admin.id}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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

      {/* Reviewed requests history */}
      {reviewed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de Solicitações</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminsTab;
