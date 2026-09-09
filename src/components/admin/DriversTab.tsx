import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DriverPhoto } from "@/components/DriverPhoto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Wallet, Trash2, Eye, Check, X, KeyRound, EyeOff, Lock, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { AdjustDriverWalletModal } from "./financial/AdjustDriverWalletModal";

import DeleteConfirm from "./DeleteConfirm";

const DriversTab = () => {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<{ id: string; userId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewDriver, setViewDriver] = useState<any>(null);
  const [adjustDriverId, setAdjustDriverId] = useState<string | null>(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);

  // Password Reset Modal State
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [targetDriver, setTargetDriver] = useState<{ userId: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const openAdjustFor = (driverId: string | null) => {
    setAdjustDriverId(driverId);
    setAdjustModalOpen(true);
  };

  const openPasswordModal = (driver: { user_id: string; full_name: string }) => {
    setTargetDriver({ userId: driver.user_id, name: driver.full_name });
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setPasswordModalOpen(true);
  };

  const { data: drivers = [] } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: earnings = [] } = useQuery({
    queryKey: ["admin-driver-earnings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("driver_earnings").select("*").eq("status", "pending");
      if (error) throw error;
      return data;
    },
  });

  const getDriverEarnings = (driverId: string) => {
    return earnings.filter((e) => e.driver_id === driverId).reduce((sum, e) => sum + Number(e.amount), 0);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      let functionSuccess = false;
      try {
        const res = await supabase.functions.invoke("delete-user", {
          body: { user_id: deleteId.userId },
        });
        if (!res.error && !res.data?.error && res.data?.success !== false) {
          functionSuccess = true;
        }
      } catch (e) {
        console.warn("[delete-user] Edge Function/roteador indisponível:", e);
      }

      if (!functionSuccess) {
        const { error: rpcErr } = await (supabase as any).rpc("admin_delete_user_cascade", {
          p_target_user_id: deleteId.userId || null,
        });

        if (rpcErr) {
          console.warn("[delete-user] RPC fallback falhou, aplicando limpeza direta de motorista:", rpcErr.message);
          await supabase.from("delivery_requests").update({ driver_id: null }).eq("driver_id", deleteId.userId);
          await supabase.from("withdrawal_requests").update({ driver_user_id: null }).eq("driver_user_id", deleteId.userId);
          await supabase.from("drivers").delete().eq("id", deleteId.id);
          if (deleteId.userId) {
            await supabase.from("user_roles").delete().eq("user_id", deleteId.userId);
            await supabase.from("profiles").delete().eq("user_id", deleteId.userId);
          }
        }
      }

      toast.success(`${deleteId.name} removido com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-drivers-financial"] });
      queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] });
      setDeleteId(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover motorista");
    } finally {
      setDeleting(false);
    }
  };

  const handleApproval = async (driverId: string, status: "approved" | "rejected", name: string) => {
    try {
      const { error } = await supabase
        .from("drivers")
        .update({ approval_status: status } as any)
        .eq("id", driverId);
      if (error) throw error;
      toast.success(`${name} ${status === "approved" ? "aprovado" : "rejeitado"}!`);
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar");
    }
  };

  const handleSavePassword = async () => {
    if (!targetDriver) return;
    if (!newPassword || newPassword.trim().length < 6) {
      return toast.error("A nova senha deve ter pelo menos 6 caracteres.");
    }
    if (newPassword !== confirmPassword) {
      return toast.error("As senhas digitadas não coincidem.");
    }

    setSavingPassword(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_user_password", {
        p_target_user_id: targetDriver.userId,
        p_new_password: newPassword.trim(),
      });

      if (error) {
        console.error("[DriversTab] RPC admin_set_user_password error:", error);
        throw new Error(error.message || "Erro ao alterar a senha do motorista.");
      }

      if (data && typeof data === "object" && (data as any).success === false) {
        throw new Error((data as any).message || "Falha ao alterar senha.");
      }

      toast.success(`Senha do motorista ${targetDriver.name} alterada com sucesso!`);
      setPasswordModalOpen(false);
      setTargetDriver(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("[DriversTab] Exception changing driver password:", err);
      toast.error(err.message || "Erro ao redefinir a senha do motorista.");
    } finally {
      setSavingPassword(false);
    }
  };

  // Realtime: auto-update earnings when a driver finishes a delivery
  useEffect(() => {
    const channel = supabase.channel("admin-earnings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_earnings" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-driver-earnings"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-driver-earnings"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Motoristas Ativos</CardTitle>
          <Button
            variant="default"
            size="sm"
            className="gap-1.5 font-medium"
            onClick={() => openAdjustFor(null)}
          >
            <Wallet className="w-4 h-4" /> Ajustar Carteira
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Saldo Atual</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d) => {
                const approval = (d as any).approval_status || "approved";
                return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.full_name}</TableCell>
                  <TableCell>{d.phone}</TableCell>
                  <TableCell className="capitalize">{d.vehicle_type}</TableCell>
                  <TableCell>{d.vehicle_plate || "—"}</TableCell>
                  <TableCell className="font-semibold text-accent">
                    R$ {getDriverEarnings(d.id).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={d.is_active ? "default" : "secondary"} className="w-fit">
                        {d.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                      <Badge
                        variant={approval === "approved" ? "default" : approval === "rejected" ? "destructive" : "secondary"}
                        className="w-fit text-[10px]"
                      >
                        {approval === "approved" ? "Aprovado" : approval === "rejected" ? "Rejeitado" : "Pendente"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                        title="Ajustar Carteira (Crédito/Débito)"
                        onClick={() => openAdjustFor(d.id)}
                      >
                        <Wallet className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                        title="Trocar Senha do Motorista"
                        onClick={() => openPasswordModal(d)}
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      {approval !== "approved" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700" title="Aprovar" onClick={() => handleApproval(d.id, "approved", d.full_name)}>
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      {approval !== "rejected" && approval === "pending" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Rejeitar" onClick={() => handleApproval(d.id, "rejected", d.full_name)}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDriver(d)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId({ id: d.id, userId: d.user_id, name: d.full_name })}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
              {drivers.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum motorista cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <DeleteConfirm open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title={deleteId?.name || "motorista"} loading={deleting} />

      <AdjustDriverWalletModal
        open={adjustModalOpen}
        onOpenChange={setAdjustModalOpen}
        driverId={adjustDriverId}
        driversList={drivers}
      />

      {/* Driver detail dialog */}
      <Dialog open={!!viewDriver} onOpenChange={(o) => !o && setViewDriver(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastro do Motorista</DialogTitle>
          </DialogHeader>
          {viewDriver && (
            <div className="space-y-3">
              {/* Photo */}
              <div className="flex justify-center">
                <DriverPhoto
                  photoUrl={(viewDriver as any).photo_url}
                  driverId={viewDriver.user_id}
                  alt={viewDriver.full_name}
                  className="w-24 h-24 rounded-full border-2 border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Nome completo" value={viewDriver.full_name} />
                <InfoField label="Telefone" value={viewDriver.phone} />
                <InfoField label="CPF" value={viewDriver.cpf || "Não informado"} />
                <InfoField label="Veículo" value={viewDriver.vehicle_type} />
                <InfoField label="Placa" value={viewDriver.vehicle_plate || "Não informada"} />
                <InfoField label="Status" value={viewDriver.is_active ? "Ativo" : "Inativo"} />
                <InfoField label="Chave PIX" value={viewDriver.pix_key || "Não informada"} />
                <InfoField label="Tipo PIX" value={viewDriver.pix_key_type || "—"} />
              </div>
              <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                <p>Cadastro: {new Date(viewDriver.created_at).toLocaleString("pt-BR")}</p>
                <p>Atualização: {new Date(viewDriver.updated_at).toLocaleString("pt-BR")}</p>
                <p className="font-mono text-[10px]">ID: {viewDriver.user_id}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Saldo Atual (A Receber)</p>
                  <p className="text-xl font-extrabold text-accent">R$ {getDriverEarnings(viewDriver.id).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 font-medium text-xs border-primary/30 text-primary"
                    onClick={() => {
                      const driver = viewDriver;
                      setViewDriver(null);
                      openPasswordModal(driver);
                    }}
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Trocar Senha
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-1 font-medium text-xs"
                    onClick={() => {
                      const id = viewDriver.id;
                      setViewDriver(null);
                      openAdjustFor(id);
                    }}
                  >
                    <Wallet className="w-3.5 h-3.5" /> Ajustar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Password Reset Modal Dialog for Driver */}
      <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <KeyRound className="w-5 h-5 text-primary" /> Alterar Senha do Motorista
            </DialogTitle>
            <DialogDescription>
              Definir uma nova senha de acesso para {targetDriver?.name}. Não é necessária a senha atual.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="driver-new-password">Nova Senha *</Label>
              <div className="relative">
                <Input
                  id="driver-new-password"
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
              <Label htmlFor="driver-confirm-password">Confirmar Nova Senha *</Label>
              <Input
                id="driver-confirm-password"
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
                A nova senha será aplicada imediatamente. O motorista poderá fazer login utilizando a nova senha fornecida aqui.
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

const InfoField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium capitalize">{value}</p>
  </div>
);

export default DriversTab;
