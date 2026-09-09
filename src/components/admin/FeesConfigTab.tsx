import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Settings, MessageCircle, Ruler, Calendar, DollarSign, Flame } from "lucide-react";

const DAYS_OF_WEEK = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira (Padrão)" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
];

const FeesConfigTab = () => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    base_fee: "5",
    fee_per_km: "1.5",
    early_withdrawal_fee_percent: "10",
    withdrawal_fixed_fee: "1.00",
    payment_day: "3",
    app_fee_per_delivery: "2",
    whatsapp_number: "",
    recharge_url: "",
    min_km: "0",
    max_km: "0",
    round_km_up: false,
    dynamic_pricing_enabled: false,
    dynamic_fee_per_km: "2.5",
  });

  const { data: config } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_config").select("*").limit(1).maybeSingle();
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
        withdrawal_fixed_fee: String((config as any).withdrawal_fixed_fee ?? 1.00),
        payment_day: String((config as any).payment_day ?? 3),
        app_fee_per_delivery: String((config as any).app_fee_per_delivery ?? 2),
        whatsapp_number: (config as any).whatsapp_number || "",
        recharge_url: (config as any).recharge_url || "",
        min_km: String((config as any).min_km ?? 0),
        max_km: String((config as any).max_km ?? 0),
        round_km_up: !!(config as any).round_km_up,
        dynamic_pricing_enabled: !!(config as any).dynamic_pricing_enabled,
        dynamic_fee_per_km: String((config as any).dynamic_fee_per_km ?? 2.5),
      });
    }
  }, [config]);

  const handleSave = async () => {
    if (!config) return;
    setLoading(true);
    try {
      const baseFeeVal = isNaN(parseFloat(form.base_fee)) ? 5 : Math.max(0, parseFloat(form.base_fee));
      const feePerKmVal = isNaN(parseFloat(form.fee_per_km)) ? 1.5 : Math.max(0, parseFloat(form.fee_per_km));
      const minKmVal = isNaN(parseFloat(form.min_km)) ? 0 : Math.max(0, parseFloat(form.min_km));
      const maxKmVal = isNaN(parseFloat(form.max_km)) ? 0 : Math.max(0, parseFloat(form.max_km));
      const earlyWithdrawalFeePercentVal = isNaN(parseFloat(form.early_withdrawal_fee_percent)) ? 10 : Math.max(0, parseFloat(form.early_withdrawal_fee_percent));
      const withdrawalFixedFeeVal = isNaN(parseFloat(form.withdrawal_fixed_fee)) ? 1.00 : Math.max(0, parseFloat(form.withdrawal_fixed_fee));
      const paymentDayVal = isNaN(parseInt(form.payment_day, 10)) ? 3 : parseInt(form.payment_day, 10);
      const appFeePerDeliveryVal = isNaN(parseFloat(form.app_fee_per_delivery)) ? 2 : Math.max(0, parseFloat(form.app_fee_per_delivery));
      const dynamicFeePerKmVal = isNaN(parseFloat(form.dynamic_fee_per_km)) ? 0 : Math.max(0, parseFloat(form.dynamic_fee_per_km));
      
      if (maxKmVal > 0 && minKmVal > maxKmVal) {
        toast.error("Km mínimo não pode ser maior que o máximo");
        setLoading(false);
        return;
      }

      const { error } = await supabase.from("delivery_config").update({
        base_fee: baseFeeVal,
        fee_per_km: feePerKmVal,
        early_withdrawal_fee_percent: earlyWithdrawalFeePercentVal,
        withdrawal_fixed_fee: withdrawalFixedFeeVal,
        payment_day: paymentDayVal,
        app_fee_per_delivery: appFeePerDeliveryVal,
        whatsapp_number: form.whatsapp_number.trim(),
        recharge_url: form.recharge_url.trim(),
        min_km: minKmVal,
        max_km: maxKmVal,
        round_km_up: form.round_km_up,
        dynamic_pricing_enabled: form.dynamic_pricing_enabled,
        dynamic_fee_per_km: dynamicFeePerKmVal,
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
          <Label>Taxa por km regular (R$/km)</Label>
          <Input type="number" step="0.1" value={form.fee_per_km} onChange={(e) => setForm(f => ({ ...f, fee_per_km: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Valor adicional por quilômetro percorrido em condições normais</p>
        </div>

        {/* Tarifa Dinâmica de Corridas */}
        <div className="border-t pt-4 mt-4 space-y-3 bg-amber-500/5 p-3 rounded-lg border border-amber-500/20">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400">
              <Flame className="w-4 h-4 text-amber-500 fill-amber-500" /> Tarifa Dinâmica (Horário de Pico)
            </Label>
            <Switch 
              checked={form.dynamic_pricing_enabled} 
              onCheckedChange={(checked) => setForm(f => ({ ...f, dynamic_pricing_enabled: checked }))} 
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Ative a tarifa dinâmica em horários de alta demanda para ajustar o valor cobrado por KM em todas as entregas.
          </p>

          {form.dynamic_pricing_enabled && (
            <div className="space-y-2 pt-1">
              <Label>Taxa Dinâmica por KM (R$/km)</Label>
              <Input 
                type="number" 
                step="0.1" 
                min="0" 
                value={form.dynamic_fee_per_km} 
                onChange={(e) => setForm(f => ({ ...f, dynamic_fee_per_km: e.target.value }))} 
              />
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Substitui a taxa normal por KM (R$ {form.fee_per_km}/km) enquanto a tarifa dinâmica estiver ATIVA.
              </p>
            </div>
          )}
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

        <div className="space-y-2 border-t pt-4 mt-4">
          <Label>Taxa do app por corrida (%)</Label>
          <Input type="number" step="1" min="0" max="100" value={form.app_fee_per_delivery} onChange={(e) => setForm(f => ({ ...f, app_fee_per_delivery: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Porcentagem que o aplicativo cobra do motorista por corrida. O restante fica com o motorista.</p>
        </div>

        {/* Regras de Saques e Adiantamentos de Motoristas */}
        <div className="border-t pt-4 mt-4 space-y-3">
          <Label className="flex items-center gap-2 font-bold text-foreground">
            <Calendar className="w-4 h-4 text-primary" /> Regras de Saques e Adiantamentos
          </Label>

          <div className="space-y-2">
            <Label>Dia Oficial de Saque (Sem taxa de adiantamento)</Label>
            <Select value={form.payment_day} onValueChange={(val) => setForm(f => ({ ...f, payment_day: val }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o dia da semana" />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Dia da semana em que os motoristas podem solicitar saque sem cobrança da taxa de adiantamento.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Taxa de Manutenção no Dia Oficial (R$)</Label>
            <Input 
              type="number" 
              step="0.5" 
              min="0" 
              value={form.withdrawal_fixed_fee} 
              onChange={(e) => setForm(f => ({ ...f, withdrawal_fixed_fee: e.target.value }))} 
            />
            <p className="text-xs text-muted-foreground">
              Valor fixo de manutenção cobrado no dia oficial de saque (ex: R$ 1,00).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Taxa de Adiantamento nos Demais Dias (%)</Label>
            <Input 
              type="number" 
              step="1" 
              min="0" 
              max="100" 
              value={form.early_withdrawal_fee_percent} 
              onChange={(e) => setForm(f => ({ ...f, early_withdrawal_fee_percent: e.target.value }))} 
            />
            <p className="text-xs text-muted-foreground">
              Porcentagem descontada em solicitações de adiantamento feitas fora do dia oficial de saque.
            </p>
          </div>
        </div>

        <div className="border-t pt-4 mt-4 space-y-2">
          <Label className="flex items-center gap-2"><MessageCircle className="w-4 h-4 text-[#25D366]" /> Número do WhatsApp</Label>
          <Input placeholder="5511999999999" value={form.whatsapp_number} onChange={(e) => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Número com código do país (ex: 5511999999999). Deixe vazio para desativar o botão flutuante.</p>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">🔗 Link de Compra de Recarga</Label>
          <Input placeholder="https://seusite.com/recargas" value={form.recharge_url} onChange={(e) => setForm(f => ({ ...f, recharge_url: e.target.value }))} />
          <p className="text-xs text-muted-foreground">URL do site para compra de créditos. Aparecerá como botão no painel da loja.</p>
        </div>
        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? "Salvando..." : "Salvar Configuração"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FeesConfigTab;

