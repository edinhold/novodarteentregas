import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings, MessageCircle, Ruler } from "lucide-react";

const FeesConfigTab = () => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ base_fee: "5", fee_per_km: "1.5", early_withdrawal_fee_percent: "10", app_fee_per_delivery: "2", whatsapp_number: "", recharge_url: "", min_km: "0", max_km: "0", round_km_up: false });

  const { data: config } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_config").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (config) {
      setForm({
        base_fee: String(config.base_fee),
        fee_per_km: String(config.fee_per_km),
        early_withdrawal_fee_percent: String((config as any).early_withdrawal_fee_percent ?? 10),
        app_fee_per_delivery: String((config as any).app_fee_per_delivery ?? 2),
        whatsapp_number: (config as any).whatsapp_number || "",
        recharge_url: (config as any).recharge_url || "",
        min_km: String((config as any).min_km ?? 0),
        max_km: String((config as any).max_km ?? 0),
        round_km_up: !!(config as any).round_km_up,
      });
    }
  }, [config]);

  const handleSave = async () => {
    if (!config) return;
    setLoading(true);
    try {
      const baseFeeVal = Math.max(0, parseFloat(form.base_fee) || 0);
      const feePerKmVal = Math.max(0, parseFloat(form.fee_per_km) || 0);
      const minKmVal = Math.max(0, parseFloat(form.min_km) || 0);
      const maxKmVal = Math.max(0, parseFloat(form.max_km) || 0);
      
      if (maxKmVal > 0 && minKmVal > maxKmVal) {
        toast.error("Km mínimo não pode ser maior que o máximo");
        setLoading(false);
        return;
      }

      const { error } = await supabase.from("delivery_config").update({
        base_fee: baseFeeVal,
        fee_per_km: feePerKmVal,
        early_withdrawal_fee_percent: parseFloat(form.early_withdrawal_fee_percent) || 10,
        app_fee_per_delivery: parseFloat(form.app_fee_per_delivery) || 2,
        whatsapp_number: form.whatsapp_number.trim(),
        recharge_url: form.recharge_url.trim(),
        min_km: minKmVal,
        max_km: maxKmVal,
        round_km_up: form.round_km_up,
      } as any).eq("id", config.id);
      if (error) throw error;
      toast.success("Configuração salva!");
      queryClient.invalidateQueries({ queryKey: ["delivery-config"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="w-4 h-4" /> Configuração de Taxas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label>Taxa base de entrega (R$)</Label>
          <Input type="number" step="0.5" value={form.base_fee} onChange={(e) => setForm(f => ({ ...f, base_fee: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Valor fixo cobrado em toda entrega</p>
        </div>
        <div className="space-y-2">
          <Label>Taxa por km (R$/km)</Label>
          <Input type="number" step="0.1" value={form.fee_per_km} onChange={(e) => setForm(f => ({ ...f, fee_per_km: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Valor adicional por quilômetro percorrido</p>
        </div>
        <div className="border-t pt-4 mt-4 space-y-2">
          <Label className="flex items-center gap-2"><Ruler className="w-4 h-4" /> Regras de Quilometragem</Label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Km mínimo</Label>
            <Input type="number" step="0.5" min="0" value={form.min_km} onChange={(e) => setForm(f => ({ ...f, min_km: e.target.value }))} />
            <p className="text-xs text-muted-foreground">0 = sem mínimo</p>
          </div>
          <div className="space-y-2">
            <Label>Km máximo</Label>
            <Input type="number" step="0.5" min="0" value={form.max_km} onChange={(e) => setForm(f => ({ ...f, max_km: e.target.value }))} />
            <p className="text-xs text-muted-foreground">0 = sem limite</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Arredondar km para cima</Label>
            <p className="text-xs text-muted-foreground">Cobrar apenas quilômetros cheios (ex: 3.2km → 4km)</p>
          </div>
          <Switch checked={form.round_km_up} onCheckedChange={(v) => setForm(f => ({ ...f, round_km_up: v }))} />
        </div>
        <div className="space-y-2">
          <Label>Taxa do app por corrida (%)</Label>
          <Input type="number" step="1" min="0" max="100" value={form.app_fee_per_delivery} onChange={(e) => setForm(f => ({ ...f, app_fee_per_delivery: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Porcentagem que o aplicativo cobra do motorista por corrida. O restante fica com o motorista.</p>
        </div>
        <div className="space-y-2">
          <Label>Taxa de saque antecipado (%)</Label>
          <Input type="number" step="1" min="0" max="100" value={form.early_withdrawal_fee_percent} onChange={(e) => setForm(f => ({ ...f, early_withdrawal_fee_percent: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Porcentagem descontada em saques antecipados do motorista</p>
        </div>
        <div className="border-t pt-4 mt-4 space-y-2">
          <Label className="flex items-center gap-2"><MessageCircle className="w-4 h-4 text-[#25D366]" /> Número do WhatsApp</Label>
          <Input placeholder="5511999999999" value={form.whatsapp_number} onChange={(e) => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Número com código do país (ex: 5511999999999). Deixe vazio para desativar o botão flutuante.</p>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">🔗 Link de Compra de Recarga</Label>
          <Input placeholder="https://seusite.com/recargas" value={form.recharge_url} onChange={(e) => setForm(f => ({ ...f, recharge_url: e.target.value }))} />
          <p className="text-xs text-muted-foreground">URL do site para compra de créditos. Aparecerá como botão no painel do lojista.</p>
        </div>
        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? "Salvando..." : "Salvar Configuração"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FeesConfigTab;
