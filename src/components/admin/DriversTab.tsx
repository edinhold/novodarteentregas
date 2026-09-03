import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DriverPhoto } from "@/components/DriverPhoto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Eye, Check, X } from "lucide-react";
import { toast } from "sonner";

import DeleteConfirm from "./DeleteConfirm";

const DriversTab = () => {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<{ id: string; userId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewDriver, setViewDriver] = useState<any>(null);

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
      const res = await supabase.functions.invoke("delete-user", {
        body: { user_id: deleteId.userId },
      });
      if (res.error) throw new Error(res.error.message || "Erro na função");
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(`${deleteId.name} removido!`);
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      setDeleteId(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover");
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
        <CardHeader>
          <CardTitle className="text-base">Motoristas Ativos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
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
                  <TableCell>
                    <div className="flex gap-1">
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
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">A Receber</p>
                <p className="text-xl font-extrabold text-accent">R$ {getDriverEarnings(viewDriver.id).toFixed(2)}</p>
              </div>
            </div>
          )}
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
