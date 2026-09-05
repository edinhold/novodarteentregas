import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MapPin, Loader2, Crosshair } from "lucide-react";

interface Props {
  request: any;
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`;
    const r = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
    const j = await r.json();
    if (Array.isArray(j) && j.length > 0) {
      return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
    }
  } catch (e) {
    console.error("geocode error", e);
  }
  return null;
}

async function osrmDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const r = await fetch(url);
    const j = await r.json();
    const meters = j?.routes?.[0]?.distance;
    if (typeof meters === "number") return meters / 1000;
  } catch (e) {
    console.error("OSRM error", e);
  }
  // fallback haversine
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const AdminAddressCorrection = ({ request }: Props) => {
  const qc = useQueryClient();
  const [pickup, setPickup] = useState(request.pickup_address || "");
  const [delivery, setDelivery] = useState(request.delivery_address || "");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPickup(request.pickup_address || "");
    setDelivery(request.delivery_address || "");
    setDistanceKm(null);
  }, [request.id]);

  const recalc = async () => {
    if (!pickup.trim() || !delivery.trim()) {
      toast.error("Preencha os dois endereços");
      return;
    }
    setCalculating(true);
    try {
      const [a, b] = await Promise.all([geocode(pickup), geocode(delivery)]);
      if (!a || !b) {
        toast.error("Não foi possível localizar um dos endereços no GPS");
        return;
      }
      const km = await osrmDistanceKm(a, b);
      setDistanceKm(km);
      toast.success(`Distância GPS: ${km.toFixed(2)} km`);
    } finally {
      setCalculating(false);
    }
  };

  const save = async () => {
    if (distanceKm == null) {
      toast.error("Calcule a distância GPS antes de salvar");
      return;
    }
    setSaving(true);
    try {
      const oldPickup = request.pickup_address || "";
      const oldDelivery = request.delivery_address || "";
      const oldCost = Number(request.credit_cost || 0);
      const { data, error } = await supabase.rpc("admin_update_delivery_address", {
        p_request_id: request.id,
        p_pickup_address: pickup.trim(),
        p_delivery_address: delivery.trim(),
        p_distance_km: distanceKm,
      });
      if (error) throw error;
      const diff = (data as any)?.diff ?? 0;
      const newCost = (data as any)?.new_cost ?? 0;
      const newKm = (data as any)?.distance_km ?? distanceKm;

      // Notify merchant in chat with before/after
      const { data: auth } = await supabase.auth.getUser();
      const senderId = auth?.user?.id;
      if (senderId) {
        const diffLine =
          diff === 0
            ? "• Sem alteração de valor"
            : diff > 0
              ? `• Cobrado adicional: R$ ${Math.abs(diff).toFixed(2)}`
              : `• Estornado: R$ ${Math.abs(diff).toFixed(2)}`;
        const msg =
          `📍 *Endereços corrigidos pelo Admin (via GPS)*\n\n` +
          `*Coleta:*\nAntes: ${oldPickup}\nAgora: ${pickup.trim()}\n\n` +
          `*Entrega:*\nAntes: ${oldDelivery}\nAgora: ${delivery.trim()}\n\n` +
          `*Valor:*\nAntes: R$ ${oldCost.toFixed(2)}\nAgora: R$ ${Number(newCost).toFixed(2)} (${Number(newKm).toFixed(2)} km)\n` +
          diffLine;
        const { error: chatErr } = await supabase.from("chat_messages").insert({
          delivery_request_id: request.id,
          sender_id: senderId,
          message: msg,
        });
        if (chatErr) console.error("chat insert error", chatErr);
      }

      toast.success(
        `Endereço corrigido. Novo valor: R$ ${Number(newCost).toFixed(2)}` +
          (diff !== 0
            ? ` (${diff > 0 ? "cobrado" : "estornado"} R$ ${Math.abs(diff).toFixed(2)})`
            : "")
      );
      qc.invalidateQueries({ queryKey: ["admin-delivery-requests-chat"] });
      qc.invalidateQueries({ queryKey: ["admin-delivery-requests-chat-recent"] });
      qc.invalidateQueries({ queryKey: ["chat-messages", request.id] });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao corrigir endereço");
    } finally {
      setSaving(false);
    }
  };

  const isFinal = ["delivered", "cancelled"].includes(request.status);

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-500" /> Corrigir Endereços (Admin)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isFinal ? (
          <p className="text-sm text-muted-foreground">
            Esta entrega já foi finalizada e não pode ser corrigida.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Endereço de coleta</Label>
              <Input value={pickup} onChange={(e) => { setPickup(e.target.value); setDistanceKm(null); }} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Endereço de entrega</Label>
              <Input value={delivery} onChange={(e) => { setDelivery(e.target.value); setDistanceKm(null); }} />
            </div>
            <div className="text-xs text-muted-foreground">
              Valor atual: R$ {Number(request.credit_cost || 0).toFixed(2)}
              {distanceKm != null && (
                <span className="ml-2 text-amber-600 font-semibold">
                  Nova distância: {distanceKm.toFixed(2)} km
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={recalc} disabled={calculating || saving} className="flex-1">
                {calculating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Crosshair className="w-4 h-4 mr-1" />}
                Calcular GPS
              </Button>
              <Button onClick={save} disabled={saving || distanceKm == null} className="flex-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Salvar correção
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A diferença de valor é automaticamente estornada ou cobrada nos créditos do lojista.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminAddressCorrection;
