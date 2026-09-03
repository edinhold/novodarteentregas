import { notifyAvailableDrivers } from "@/lib/push";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, User, Phone, Package, Route, Loader2 } from "lucide-react";

const MAX_STOPS = 10;

type Stop = {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  notes: string;
  distance_km: string; // string for input control
};

const emptyStop = (): Stop => ({
  customer_name: "",
  customer_phone: "",
  delivery_address: "",
  notes: "",
  distance_km: "",
});

interface Props {
  restaurant: any;
  userId: string;
}

// Geocode via Nominatim
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
    const json = await res.json();
    if (Array.isArray(json) && json[0]) {
      return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
    }
  } catch (_) {}
  return null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const MultiDeliveryOrder = ({ restaurant, userId }: Props) => {
  const queryClient = useQueryClient();
  const [stops, setStops] = useState<Stop[]>([emptyStop()]);
  const [groupNotes, setGroupNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [calculating, setCalculating] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["public-delivery-config"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_delivery_config").single();
      return data as any;
    },
  });

  const { data: credits } = useQuery({
    queryKey: ["my-credits", userId],
    queryFn: async () => {
      const { data } = await supabase.from("store_credits").select("*").eq("user_id", userId).limit(1).single();
      return data;
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["my-delivery-groups", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_groups")
        .select("*")
        .eq("store_owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("multi-delivery-groups")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_groups", filter: `store_owner_id=eq.${userId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-delivery-groups", userId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, queryClient]);

  const baseFee = Number(config?.base_fee ?? 5);
  const feePerKm = Number(config?.fee_per_km ?? 1.5);
  const minKm = Number(config?.min_km ?? 0);
  const maxKm = Number(config?.max_km ?? 0);
  const roundUp = Boolean(config?.round_km_up);

  const calcCost = (kmStr: string) => {
    let km = parseFloat(kmStr) || 0;
    if (roundUp && km > 0) km = Math.ceil(km);
    if (minKm > 0 && km < minKm) km = minKm;
    if (maxKm > 0 && km > maxKm) km = maxKm;
    return baseFee + feePerKm * km;
  };

  const total = useMemo(() => stops.reduce((acc, s) => acc + calcCost(s.distance_km), 0), [stops, baseFee, feePerKm, minKm, maxKm, roundUp]);
  const balance = Number(credits?.balance ?? 0);
  const insufficient = total > balance;

  const updateStop = (idx: number, patch: Partial<Stop>) => {
    setStops(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const addStop = () => {
    if (stops.length >= MAX_STOPS) return toast.error(`Máximo de ${MAX_STOPS} paradas`);
    setStops(prev => [...prev, emptyStop()]);
  };

  const removeStop = (idx: number) => {
    setStops(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
  };

  const calculateAllDistances = async () => {
    if (!restaurant?.address) return toast.error("Loja sem endereço de coleta");
    setCalculating(true);
    try {
      const origin = (restaurant.lat != null && restaurant.lng != null)
        ? { lat: Number(restaurant.lat), lng: Number(restaurant.lng) }
        : await geocode(restaurant.address);
      if (!origin) {
        toast.error("Não foi possível localizar o endereço da loja");
        return;
      }
      const next = [...stops];
      for (let i = 0; i < next.length; i++) {
        if (!next[i].delivery_address.trim()) continue;
        const dest = await geocode(next[i].delivery_address);
        if (dest) {
          const km = haversineKm(origin, dest);
          next[i] = { ...next[i], distance_km: km.toFixed(2) };
        }
      }
      setStops(next);
      toast.success("Distâncias calculadas");
    } catch (e: any) {
      toast.error("Erro ao calcular distâncias");
    } finally {
      setCalculating(false);
    }
  };

  const submit = async () => {
    if (!restaurant) return toast.error("Cadastre sua loja primeiro");
    if (!restaurant.address) return toast.error("Defina o endereço de coleta da loja");

    const valid = stops.filter(s => s.delivery_address.trim() && s.customer_name.trim());
    if (valid.length === 0) return toast.error("Preencha cliente e endereço de pelo menos uma parada");
    if (valid.length !== stops.length) return toast.error("Preencha cliente e endereço em todas as paradas (ou remova as vazias)");
    if (insufficient) return toast.error("Créditos insuficientes para esta rota");

    setSubmitting(true);
    try {
      const payload = stops.map(s => ({
        delivery_address: s.delivery_address.trim(),
        customer_name: s.customer_name.trim(),
        customer_phone: s.customer_phone.trim() || null,
        notes: s.notes.trim() || null,
        distance_km: parseFloat(s.distance_km) || 0,
      }));
      const { data, error } = await supabase.rpc("create_delivery_group", {
        p_restaurant_id: restaurant.id,
        p_pickup_address: restaurant.address,
        p_stops: payload,
        p_preferred_driver_id: null,
        p_group_notes: groupNotes.trim() || null,
      });
      if (error) throw error;

      // Notifica motoristas online sobre cada parada criada
      try {
        const { data: created } = await supabase
          .from("delivery_requests")
          .select("id")
          .eq("group_id", String(data))
          .eq("status", "pending");
        (created ?? []).forEach((r: any) => void notifyAvailableDrivers(r.id));
      } catch { /* push nunca bloqueia a criação */ }





      toast.success(`Rota criada com ${stops.length} parada(s)!`);

      setStops([emptyStop()]);
      setGroupNotes("");
      queryClient.invalidateQueries({ queryKey: ["my-credits", userId] });
      queryClient.invalidateQueries({ queryKey: ["my-delivery-groups", userId] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar rota");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="w-5 h-5" /> Agrupar Entregas (Multi-pedido)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Monte uma rota com até {MAX_STOPS} paradas. Coleta única na loja, um motorista entrega todos.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
            <div className="text-sm">
              <div className="font-medium">Coleta: {restaurant?.name || "—"}</div>
              <div className="text-muted-foreground truncate">{restaurant?.address || "Endereço não cadastrado"}</div>
            </div>
            <Badge variant="secondary">{stops.length}/{MAX_STOPS}</Badge>
          </div>

          {stops.map((s, idx) => (
            <Card key={idx} className="border-dashed">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="gap-1"><Package className="w-3 h-3" /> Parada {idx + 1}</Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">R$ {calcCost(s.distance_km).toFixed(2)}</span>
                    {stops.length > 1 && (
                      <Button size="icon" variant="ghost" onClick={() => removeStop(idx)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-xs"><User className="w-3 h-3" /> Cliente</Label>
                    <Input value={s.customer_name} onChange={(e) => updateStop(idx, { customer_name: e.target.value })} placeholder="Nome do cliente" />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" /> Telefone</Label>
                    <Input value={s.customer_phone} onChange={(e) => updateStop(idx, { customer_phone: e.target.value })} placeholder="(opcional)" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="flex items-center gap-1 text-xs"><MapPin className="w-3 h-3" /> Endereço de entrega</Label>
                  <Input value={s.delivery_address} onChange={(e) => updateStop(idx, { delivery_address: e.target.value })} placeholder="Rua, número, bairro" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Distância (km)</Label>
                    <Input type="number" step="0.1" min="0" value={s.distance_km} onChange={(e) => updateStop(idx, { distance_km: e.target.value })} placeholder="0.0" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Observação</Label>
                    <Input value={s.notes} onChange={(e) => updateStop(idx, { notes: e.target.value })} placeholder="Ex.: portão azul" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={addStop} disabled={stops.length >= MAX_STOPS}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar parada
            </Button>
            <Button variant="outline" onClick={calculateAllDistances} disabled={calculating}>
              {calculating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MapPin className="w-4 h-4 mr-1" />}
              Calcular distâncias
            </Button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Observação geral da rota</Label>
            <Textarea value={groupNotes} onChange={(e) => setGroupNotes(e.target.value)} rows={2} placeholder="Instruções para o motorista (opcional)" />
          </div>

          <Separator />

          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex justify-between text-sm"><span>Paradas</span><span>{stops.length}</span></div>
            <div className="flex justify-between text-sm"><span>Saldo de créditos</span><span>R$ {balance.toFixed(2)}</span></div>
            <div className="flex justify-between text-base font-bold">
              <span>Total da rota</span>
              <span className={insufficient ? "text-destructive" : ""}>R$ {total.toFixed(2)}</span>
            </div>
            {insufficient && <p className="text-xs text-destructive">Créditos insuficientes. Recarregue para criar a rota.</p>}
          </div>

          <Button className="w-full" size="lg" onClick={submit} disabled={submitting || insufficient}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Route className="w-4 h-4 mr-2" />}
            Criar rota agrupada
          </Button>
        </CardContent>
      </Card>

      {groups.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Rotas recentes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {groups.map((g: any) => (
              <div key={g.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="text-sm">
                  <div className="font-medium">{g.stops_count} paradas · R$ {Number(g.total_cost).toFixed(2)}</div>
                  <div className="text-muted-foreground text-xs">{new Date(g.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <Badge variant={g.status === "pending" ? "secondary" : "default"}>{g.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MultiDeliveryOrder;
