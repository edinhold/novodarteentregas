import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Route, MapPin, Package, Check, User, Phone, Loader2, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface Props {
  userId: string;
  hasActiveSingleRequest: boolean;
}

const DriverGroupedDeliveries = ({ userId, hasActiveSingleRequest }: Props) => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectedGroups, setRejectedGroups] = useState<string[]>([]);

  // Pending groups available to me
  const { data: pendingGroups = [] } = useQuery({
    queryKey: ["driver-pending-groups", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_groups")
        .select("*, restaurants(name, address)")
        .eq("status", "pending")
        .or(`driver_id.is.null,driver_id.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // My active group
  const { data: activeGroup } = useQuery({
    queryKey: ["driver-active-group", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_groups")
        .select("*, restaurants(name, address)")
        .eq("driver_id", userId)
        .in("status", ["accepted", "picked_up"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Stops of the active group
  const { data: stops = [] } = useQuery({
    queryKey: ["driver-active-group-stops", activeGroup?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*")
        .eq("group_id", activeGroup!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeGroup,
  });

  useEffect(() => {
    const ch = supabase
      .channel("driver-groups-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_groups" }, () => {
        queryClient.invalidateQueries({ queryKey: ["driver-pending-groups", userId] });
        queryClient.invalidateQueries({ queryKey: ["driver-active-group", userId] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_requests" }, () => {
        if (activeGroup) queryClient.invalidateQueries({ queryKey: ["driver-active-group-stops", activeGroup.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, activeGroup?.id, queryClient]);

  const accept = async (groupId: string) => {
    setBusy(groupId);
    try {
      const { error } = await supabase.rpc("accept_delivery_group", { p_group_id: groupId });
      if (error) throw error;
      toast.success("Rota aceita!");
      queryClient.invalidateQueries({ queryKey: ["driver-pending-groups", userId] });
      queryClient.invalidateQueries({ queryKey: ["driver-active-group", userId] });
    } catch (e: any) {
      toast.error(e.message || "Não foi possível aceitar a rota");
    } finally {
      setBusy(null);
    }
  };

  const pickup = async () => {
    if (!activeGroup) return;
    setBusy(activeGroup.id);
    try {
      const { error } = await supabase.rpc("pickup_delivery_group", { p_group_id: activeGroup.id });
      if (error) throw error;
      toast.success("Coleta registrada!");
      queryClient.invalidateQueries({ queryKey: ["driver-active-group", userId] });
      queryClient.invalidateQueries({ queryKey: ["driver-active-group-stops", activeGroup.id] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao registrar coleta");
    } finally {
      setBusy(null);
    }
  };

  const completeStop = async (requestId: string) => {
    setBusy(requestId);
    try {
      const { error } = await supabase.rpc("complete_group_stop", { p_request_id: requestId });
      if (error) throw error;
      toast.success("Parada entregue!");
      queryClient.invalidateQueries({ queryKey: ["driver-active-group", userId] });
      queryClient.invalidateQueries({ queryKey: ["driver-active-group-stops", activeGroup!.id] });
      queryClient.invalidateQueries({ queryKey: ["driver-earnings", userId] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao concluir parada");
    } finally {
      setBusy(null);
    }
  };

  const openNav = (addr: string) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, "_blank");
  };

  const nextStopIdx = stops.findIndex((s: any) => s.status !== "delivered");

  return (
    <div className="space-y-4">
      {/* Active group */}
      {activeGroup && (
        <Card className="border-primary shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Route className="w-4 h-4 text-primary" /> Rota Ativa
              <Badge className="ml-auto">
                {stops.filter((s: any) => s.status === "delivered").length}/{stops.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="font-bold">{activeGroup.restaurants?.name || "Loja"}</p>
              <p className="text-xs text-muted-foreground">📍 Coleta: {activeGroup.pickup_address}</p>
              {activeGroup.notes && <p className="text-xs">📝 {activeGroup.notes}</p>}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => openNav(activeGroup.pickup_address)}>
                  <MapPin className="w-3 h-3 mr-1" /> Navegar até a loja
                </Button>
                {activeGroup.status === "accepted" && (
                  <Button size="sm" onClick={pickup} disabled={busy === activeGroup.id}>
                    {busy === activeGroup.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : "📦"} Coletei tudo
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              {stops.map((s: any, idx: number) => {
                const isNext = idx === nextStopIdx && activeGroup.status === "picked_up";
                const done = s.status === "delivered";
                return (
                  <div
                    key={s.id}
                    className={`rounded-lg border p-3 space-y-2 ${done ? "opacity-60 bg-muted/30" : isNext ? "border-primary bg-primary/5" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant={done ? "secondary" : isNext ? "default" : "outline"} className="gap-1">
                        {done ? <CheckCircle2 className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                        Parada {idx + 1}
                      </Badge>
                      <span className="text-sm font-semibold">R$ {Number(s.driver_fee || 0).toFixed(2)}</span>
                    </div>
                    <div className="text-sm space-y-0.5">
                      {s.customer_name && (
                        <p className="flex items-center gap-1"><User className="w-3 h-3" /> {s.customer_name}</p>
                      )}
                      {s.customer_phone && (
                        <p className="flex items-center gap-1 text-xs">
                          <Phone className="w-3 h-3" />
                          <a href={`tel:${s.customer_phone}`} className="text-primary underline">{s.customer_phone}</a>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0" /> {s.delivery_address}
                      </p>
                      {s.notes && <p className="text-xs">📝 {s.notes}</p>}
                    </div>
                    {!done && activeGroup.status === "picked_up" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => openNav(s.delivery_address)}>
                          <MapPin className="w-3 h-3 mr-1" /> Navegar
                        </Button>
                        <Button size="sm" className="flex-1" disabled={busy === s.id || !isNext} onClick={() => completeStop(s.id)}>
                          {busy === s.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                          Entreguei
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending groups (offers) */}
      {pendingGroups.filter((g: any) => !rejectedGroups.includes(g.id)).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Route className="w-4 h-4 text-primary" /> Rotas Disponíveis (Multi-Entregas)</span>
              <Badge variant="secondary">{pendingGroups.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingGroups
              .filter((g: any) => !rejectedGroups.includes(g.id))
              .map((g: any) => (
                <div key={g.id} className="rounded-xl border bg-card p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-sm">{g.restaurants?.name || "Loja"}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">📍 {g.pickup_address}</p>
                      <p className="text-xs mt-1">
                        <Badge variant="outline" className="mr-1">{g.stops_count} paradas</Badge>
                        {g.driver_id === userId && <span className="text-primary font-semibold">⭐ Direcionada</span>}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-primary whitespace-nowrap">R$ {Number(g.total_cost).toFixed(2)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      setRejectedGroups((p) => [...p, g.id]);
                      toast.info("Rota recusada");
                    }}>
                      Recusar
                    </Button>
                    <Button
                      size="sm"
                      disabled={!!activeGroup || hasActiveSingleRequest || busy === g.id}
                      onClick={() => accept(g.id)}
                    >
                      {busy === g.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                      Aceitar Rota
                    </Button>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DriverGroupedDeliveries;
