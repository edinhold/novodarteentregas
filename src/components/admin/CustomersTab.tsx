import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, UserCog, Users, Search, History, Ban, ShieldCheck } from "lucide-react";

type RoleFilter = "all" | "customer" | "driver" | "store_owner" | "admin";

const CustomersTab = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<any[] | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [promoteCustomer, setPromoteCustomer] = useState<any>(null);
  const [promoting, setPromoting] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<any>(null);
  const [suspendDays, setSuspendDays] = useState<string>("7");
  const [suspendReason, setSuspendReason] = useState("");
  const [suspending, setSuspending] = useState(false);
  const [driverForm, setDriverForm] = useState({
    vehicleType: "moto",
    vehiclePlate: "",
    pixKey: "",
    pixKeyType: "cpf",
  });


  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: drivers } = await supabase.from("drivers").select("user_id");
      const driverUserIds = new Set((drivers || []).map((d: any) => d.user_id));
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const roleMap: Record<string, string[]> = {};
      (roles || []).forEach((r: any) => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      });
      return (data || []).map((p: any) => ({
        ...p,
        isDriver: driverUserIds.has(p.user_id),
        roles: roleMap[p.user_id] || [],
      }));
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["customer-deletion-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_deletion_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      return (data as any[]) || [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter((c: any) => {
      const matchesSearch =
        !q ||
        (c.full_name || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (roleFilter === "all") return true;
      if (roleFilter === "customer") return c.roles.length === 0;
      return c.roles.includes(roleFilter);
    });
  }, [customers, search, roleFilter]);

  const allSelected = filtered.length > 0 && filtered.every((c: any) => selected.has(c.user_id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((c: any) => next.delete(c.user_id));
    else filtered.forEach((c: any) => next.add(c.user_id));
    setSelected(next);
  };
  const toggleOne = (uid: string) => {
    const next = new Set(selected);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    setSelected(next);
  };

  const openBulkDelete = () => {
    const targets = customers.filter((c: any) => selected.has(c.user_id));
    if (targets.length === 0) return toast.error("Selecione ao menos um cliente");
    setDeleteTarget(targets);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!reason.trim()) return toast.error("Informe o motivo da exclusão");
    setDeleting(true);
    let ok = 0, fail = 0;
    const { data: { user: adminUser } } = await supabase.auth.getUser();
    for (const c of deleteTarget) {
      try {
        const { data, error } = await supabase.functions.invoke("delete-user", {
          body: { user_id: c.user_id },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        await supabase.from("customer_deletion_logs" as any).insert({
          admin_id: adminUser?.id,
          deleted_user_id: c.user_id,
          deleted_name: c.full_name,
          deleted_phone: c.phone,
          reason: reason.trim(),
        });
        ok++;
      } catch (err: any) {
        console.error("delete failed", c.user_id, err);
        fail++;
      }
    }
    setDeleting(false);
    setDeleteTarget(null);
    setReason("");
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
    queryClient.invalidateQueries({ queryKey: ["customer-deletion-logs"] });
    if (ok) toast.success(`${ok} cliente(s) excluído(s)`);
    if (fail) toast.error(`${fail} falha(s) ao excluir`);
  };

  const handlePromote = async () => {
    if (!promoteCustomer) return;
    setPromoting(true);
    try {
      const { error: driverError } = await supabase.from("drivers").insert({
        user_id: promoteCustomer.user_id,
        full_name: promoteCustomer.full_name || "Sem nome",
        phone: promoteCustomer.phone || "",
        vehicle_type: driverForm.vehicleType,
        vehicle_plate: driverForm.vehiclePlate || null,
        pix_key: driverForm.pixKey || null,
        pix_key_type: driverForm.pixKeyType || null,
      });
      if (driverError) throw driverError;
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: promoteCustomer.user_id,
        role: "driver" as any,
      });
      if (roleError) throw roleError;
      toast.success(`${promoteCustomer.full_name} promovido a motorista!`);
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      setPromoteCustomer(null);
      setDriverForm({ vehicleType: "moto", vehiclePlate: "", pixKey: "", pixKeyType: "cpf" });
    } catch (err: any) {
      toast.error(err.message || "Erro ao promover cliente");
    } finally {
      setPromoting(false);
    }
  };

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    const days = parseInt(suspendDays, 10);
    if (!Number.isFinite(days) || days <= 0) return toast.error("Informe um número de dias válido");
    if (!suspendReason.trim()) return toast.error("Informe o motivo");
    setSuspending(true);
    try {
      const until = new Date(Date.now() + days * 86400000).toISOString();
      const { error } = await (supabase as any).rpc("admin_suspend_user", {
        p_target_user_id: suspendTarget.user_id,
        p_until: until,
        p_reason: suspendReason.trim(),
      });
      if (error) throw error;
      toast.success(`${suspendTarget.full_name || "Usuário"} suspenso até ${new Date(until).toLocaleDateString("pt-BR")}`);
      setSuspendTarget(null);
      setSuspendReason("");
      setSuspendDays("7");
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao suspender");
    } finally {
      setSuspending(false);
    }
  };

  const handleUnsuspend = async (c: any) => {
    if (!confirm(`Reativar ${c.full_name || "este usuário"}?`)) return;
    try {
      const { error } = await (supabase as any).rpc("admin_unsuspend_user", {
        p_target_user_id: c.user_id,
      });
      if (error) throw error;
      toast.success("Usuário reativado");
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao reativar");
    }
  };


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Clientes Cadastrados ({filtered.length})
          </CardTitle>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="customer">Somente clientes</SelectItem>
                <SelectItem value="driver">Motoristas</SelectItem>
                <SelectItem value="store_owner">Lojistas</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Button
              size="sm"
              variant="destructive"
              disabled={selected.size === 0}
              onClick={openBulkDelete}
            >
              <Trash2 className="w-4 h-4 mr-1" /> Excluir selecionados ({selected.size})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Funções</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(c.user_id)}
                        onCheckedChange={() => toggleOne(c.user_id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{c.full_name || "—"}</TableCell>
                    <TableCell>{c.phone || "—"}</TableCell>
                    <TableCell>{c.city || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {c.roles.length === 0 && (
                          <span className="text-xs text-muted-foreground">Cliente</span>
                        )}
                        {c.roles.map((r: string) => (
                          <span key={r} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {r === "admin" ? "Admin" : r === "driver" ? "Motorista" : r === "store_owner" ? "Lojista" : r}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 items-center flex-wrap">
                        {c.suspended_until && new Date(c.suspended_until).getTime() > Date.now() && (
                          <span
                            className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded"
                            title={c.suspension_reason || ""}
                          >
                            Suspenso até {new Date(c.suspended_until).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                        {!c.isDriver && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => setPromoteCustomer(c)}
                          >
                            <UserCog className="w-3.5 h-3.5 mr-1" />
                            Motorista
                          </Button>
                        )}
                        {c.suspended_until && new Date(c.suspended_until).getTime() > Date.now() ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => handleUnsuspend(c)}
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Reativar
                          </Button>
                        ) : (
                          !c.roles.includes("admin") && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-amber-600"
                              title="Suspender"
                              onClick={() => setSuspendTarget(c)}
                            >
                              <Ban className="w-4 h-4" />
                            </Button>
                          )
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteTarget([c])}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      Nenhum cliente encontrado
                    </TableCell>
                  </TableRow>

                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Histórico de Exclusões
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>{l.deleted_name || "—"}</TableCell>
                  <TableCell>{l.deleted_phone || "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{l.reason || "—"}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhuma exclusão registrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              {deleteTarget?.length === 1
                ? `Excluir cliente "${deleteTarget[0]?.full_name || "sem nome"}" permanentemente?`
                : `Excluir ${deleteTarget?.length} clientes permanentemente?`}
              {" "}Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivo (obrigatório)</label>
            <Textarea
              placeholder="Ex: Solicitação do usuário / conta duplicada / spam..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setReason(""); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || !reason.trim()}>
              {deleting ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!promoteCustomer} onOpenChange={(o) => !o && setPromoteCustomer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promover para Motorista</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Completar cadastro de <strong>{promoteCustomer?.full_name}</strong> como motorista:
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Veículo</label>
              <Select value={driverForm.vehicleType} onValueChange={(v) => setDriverForm(f => ({ ...f, vehicleType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="moto">Moto</SelectItem>
                  <SelectItem value="carro">Carro</SelectItem>
                  <SelectItem value="bicicleta">Bicicleta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Placa do Veículo</label>
              <Input
                placeholder="ABC-1234"
                value={driverForm.vehiclePlate}
                onChange={(e) => setDriverForm(f => ({ ...f, vehiclePlate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo da Chave PIX</label>
              <Select value={driverForm.pixKeyType} onValueChange={(v) => setDriverForm(f => ({ ...f, pixKeyType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="aleatoria">Aleatória</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Chave PIX</label>
              <Input
                placeholder="Digite a chave PIX"
                value={driverForm.pixKey}
                onChange={(e) => setDriverForm(f => ({ ...f, pixKey: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteCustomer(null)}>Cancelar</Button>
            <Button onClick={handlePromote} disabled={promoting}>
              {promoting ? "Promovendo..." : "Promover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!suspendTarget} onOpenChange={(o) => { if (!o) { setSuspendTarget(null); setSuspendReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspender usuário</DialogTitle>
            <DialogDescription>
              Bloquear temporariamente o acesso de <strong>{suspendTarget?.full_name || "usuário"}</strong>. Ele será deslogado ao tentar entrar até o fim do período.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Duração (dias)</label>
              <Input
                type="number"
                min={1}
                value={suspendDays}
                onChange={(e) => setSuspendDays(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo (obrigatório)</label>
              <Textarea
                placeholder="Ex: comportamento inadequado, cobrança pendente..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSuspendTarget(null); setSuspendReason(""); }}>Cancelar</Button>
            <Button onClick={handleSuspend} disabled={suspending || !suspendReason.trim()}>
              {suspending ? "Suspendendo..." : "Confirmar suspensão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
};

export default CustomersTab;
