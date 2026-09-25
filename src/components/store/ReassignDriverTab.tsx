import { useState, useEffect } from "react";
import { supabase, createFreshChannel } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RefreshCw, Truck, Star, AlertTriangle, MapPin, ArrowRight } from "lucide-react";
import { useDriverLocations } from "@/hooks/useDriverLocations";

interface ReassignDriverTabProps {
  restaurant: any;
  userId: string;
}

const ReassignDriverTab = ({ restaurant, userId }: ReassignDriverTabProps) => {
  const queryClient = useQueryClient();
  const { data: driverLocations = [] } = useDriverLocations();
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: favoriteDrivers = [] } = useQuery({
    queryKey: ["favorite-drivers", restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      const { data, error } = await supabase
        .from("store_driver_favorites")
        .select("driver_id, is_default, driver:drivers(id, user_id, full_name, driver_code)")
        .eq("restaurant_id", restaurant.id);
      if (error) return [];
      return data || [];
    },
    enabled: !!restaurant?.id,
  });

  const { data: allDrivers = [] } = useQuery({
    queryKey: ["all-radar-drivers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_radar_drivers");
      if (error) return [];
      return data || [];
    },
  });

  const { data: pendingRequests = [], isLoading } = useQuery({
    queryKey: ["pending-reassignable", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*")
        .eq("store_owner_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const defaultFavoriteUserId = (favoriteDrivers.find((f: any) => f.is_default) as any)?.driver?.user_id || "";

  // Pre-fill selection with current driver_id or default favorite
  useEffect(() => {
    const next: Record<string, string> = {};
    pendingRequests.forEach((r: any) => {
      if (selections[r.id] !== undefined) {
        next[r.id] = selections[r.id];
      } else {
        next[r.id] = r.driver_id || defaultFavoriteUserId || "";
      }
    });
    setSelections(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRequests, defaultFavoriteUserId]);

  useEffect(() => {
    const channel = createFreshChannel("reassign-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_requests", filter: `store_owner_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ["pending-reassignable", userId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const isOnline = (uidOrDid: string | null) => {
    if (!uidOrDid) return false;
    return driverLocations.some((d: any) => d.user_id === uidOrDid || d.driver_id === uidOrDid);
  };

  const handleSave = async (requestId: string) => {
    const targetUid = selections[requestId] || null;
    setSavingId(requestId);
    try {
      const { data, error } = await (supabase as any).rpc("reassign_delivery_driver", {
        p_request_id: requestId,
        p_driver_user_id: targetUid,
      });
      if (error || !data) {
        const { error: updateErr } = await supabase
          .from("delivery_requests")
          .update({ driver_id: targetUid, updated_at: new Date().toISOString() })
          .eq("id", requestId);
        if (updateErr) throw updateErr;
      }
      toast.success(targetUid ? "Entregador atribuído!" : "Liberado para qualquer entregador");
      queryClient.invalidateQueries({ queryKey: ["pending-reassignable", userId] });
      queryClient.invalidateQueries({ queryKey: ["my-delivery-requests", userId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao trocar entregador");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Trocar Entregador das Corridas Pendentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Aqui você pode reatribuir corridas que ainda não foram aceitas. O favorito padrão{" "}
            {defaultFavoriteUserId ? (
              <span className="text-yellow-600 font-medium">⭐ está definido</span>
            ) : (
              <span className="text-muted-foreground">não está definido (defina um na aba Favoritos)</span>
            )}
            .
          </p>

          {isLoading ? (
            <p className="text-center text-muted-foreground py-6">Carregando...</p>
          ) : pendingRequests.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Truck className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
              <p className="text-sm text-muted-foreground">Nenhuma corrida pendente no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((r: any) => {
                const currentSel = selections[r.id] ?? (r.driver_id || defaultFavoriteUserId || "");
                const targetOnline = isOnline(currentSel || null);
                const changed = currentSel !== (r.driver_id || "");
                return (
                  <div key={r.id} className="border rounded-xl p-3 space-y-2 bg-card">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold">#{r.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{r.pickup_address}</span>
                          <ArrowRight className="w-3 h-3 shrink-0" />
                          <span className="truncate">{r.delivery_address}</span>
                        </p>
                      </div>
                      <Badge variant="secondary">Pendente</Badge>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold">Atribuir entregador</Label>
                      <select
                        className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm font-medium"
                        value={currentSel}
                        onChange={(e) =>
                          setSelections((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                      >
                        <option value="">Qualquer entregador disponível / online</option>
                        {favoriteDrivers.length > 0 && (
                          <optgroup label="⭐ Seus Entregadores Favoritos">
                            {favoriteDrivers.map((f: any) => {
                              const uid = f.driver?.user_id || f.driver_id;
                              const did = f.driver_id;
                              const online = isOnline(uid) || isOnline(did);
                              return (
                                <option key={did || uid} value={uid || ""}>
                                  {f.is_default ? "★ " : "⭐ "}
                                  {f.driver?.full_name || "Entregador"} ({f.driver?.driver_code || "N/A"})
                                  {online ? " • 🟢 Online" : " • ⚪ Offline"}
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                        <optgroup label="Outros Entregadores Online">
                          {driverLocations
                            .filter(
                              (dl: any) =>
                                !favoriteDrivers.some((f: any) => f.driver?.user_id === dl.user_id || f.driver_id === dl.driver_id || f.driver_id === dl.user_id)
                            )
                            .map((dl: any) => {
                              const dInfo = allDrivers.find((d: any) => d.user_id === dl.user_id || d.id === dl.driver_id);
                              const name = dInfo?.full_name || (dl as any).driver?.full_name || "Entregador";
                              const code = dInfo?.driver_code || (dl as any).driver?.driver_code || "N/A";
                              return (
                                <option key={dl.user_id || dl.id} value={dl.user_id}>
                                  🚴 {name} ({code}) • 🟢 Online
                                </option>
                              );
                            })}
                        </optgroup>
                      </select>

                      {currentSel && !targetOnline && (
                        <div className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>Este entregador está offline. A corrida ficará reservada até ele voltar.</span>
                        </div>
                      )}
                      {!currentSel && (
                        <p className="text-[10px] text-muted-foreground">
                          Sem entregador específico — qualquer um online poderá aceitar.
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={!changed || savingId === r.id}
                        onClick={() => handleSave(r.id)}
                      >
                        {savingId === r.id ? "Salvando..." : changed ? "Confirmar troca" : "Sem alterações"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReassignDriverTab;
