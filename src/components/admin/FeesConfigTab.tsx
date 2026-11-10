import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Settings, MessageCircle, Ruler, Calendar, Flame, CheckCircle2, Percent } from "lucide-react";

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
  const isSavingRef = useRef(false);

  const [form, setForm] = useState({
    base_fee: "5.3",
    fee_per_km: "1.7",
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
    dynamic_fee_per_km: "1.0",
  });

  const { data: rawConfig, isLoading: configLoading } = useQuery({
    queryKey: ["admin-delivery-config"],
    queryFn: async () => {
      // 1. Prioridade máxima: SELECT direto da tabela delivery_config (traz todos os campos do admin)
      try {
        const { data: tableData, error: tableError } = await supabase
          .from("delivery_config")
          .select("*")
          .limit(1)
          .maybeSingle();

        if (!tableError && tableData) {
          return tableData;
        }
      } catch (e) {
        console.warn("[FeesConfigTab] Aviso ao buscar direto da tabela delivery_config:", e);
      }

      // 2. RPC get_admin_delivery_config (retorna JSONB com todos os campos)
      try {
        const { data: adminRpcData, error: adminRpcError } = await (supabase as any).rpc("get_admin_delivery_config");
        if (!adminRpcError && adminRpcData) {
          const item = Array.isArray(adminRpcData) ? adminRpcData[0] : adminRpcData;
          if (item) return item;
        }
      } catch (e) {
        console.warn("[FeesConfigTab] Aviso RPC get_admin_delivery_config:", e);
      }

      // 3. Fallback para get_public_delivery_config
      try {
        const { data: rpcData, error: rpcError } = await (supabase as any).rpc("get_public_delivery_config");
        if (!rpcError && rpcData) {
          const item = Array.isArray(rpcData) ? rpcData[0] : rpcData;
          if (item) return item;
        }
      } catch (e) {
        console.warn("[FeesConfigTab] Erro RPC get_public_delivery_config:", e);
      }

      return null;
    },
    staleTime: 1000 * 30,
  });

  const config = useMemo(() => {
    if (!rawConfig) return null;
    return Array.isArray(rawConfig) ? rawConfig[0] : rawConfig;
  }, [rawConfig]);

  useEffect(() => {
    // Não substitui o formulário durante uma operação ativa de salvamento
    if (config && !isSavingRef.current) {
      const rawAppFee = (config as any).app_fee_per_delivery;
      const parsedAppFee = rawAppFee !== undefined && rawAppFee !== null && !isNaN(Number(rawAppFee))
        ? String(rawAppFee)
        : "2";

      setForm({
        base_fee: String(config.base_fee ?? "5.3"),
        fee_per_km: String(config.fee_per_km ?? "1.7"),
        early_withdrawal_fee_percent: String((config as any).early_withdrawal_fee_percent ?? 10),
        withdrawal_fixed_fee: String((config as any).withdrawal_fixed_fee ?? 1.00),
        payment_day: String((config as any).payment_day ?? 3),
        app_fee_per_delivery: parsedAppFee,
        whatsapp_number: (config as any).whatsapp_number || "",
        recharge_url: (config as any).recharge_url || "",
        min_km: String((config as any).min_km ?? 0),
        max_km: String((config as any).max_km ?? 0),
        round_km_up: !!(config as any).round_km_up,
        dynamic_pricing_enabled: !!(config as any).dynamic_pricing_enabled,
        dynamic_fee_per_km: String((config as any).dynamic_fee_per_km ?? 1.0),
      });
    }
  }, [config]);

  const regularKmFee = useMemo(() => {
    const val = parseFloat(form.fee_per_km);
    return isNaN(val) ? 0 : Math.max(0, val);
  }, [form.fee_per_km]);

  const dynamicKmFee = useMemo(() => {
    const val = parseFloat(form.dynamic_fee_per_km);
    return isNaN(val) ? 0 : Math.max(0, val);
  }, [form.dynamic_fee_per_km]);

  const totalEffectiveKmFee = useMemo(() => {
    if (!form.dynamic_pricing_enabled) {
      return regularKmFee;
    }
    return regularKmFee + dynamicKmFee;
  }, [regularKmFee, dynamicKmFee, form.dynamic_pricing_enabled]);

  const appFeePercentNumber = useMemo(() => {
    const val = parseFloat(form.app_fee_per_delivery);
    return isNaN(val) ? 0 : Math.max(0, val);
  }, [form.app_fee_per_delivery]);

  const handleSave = async () => {
    const minKmVal = isNaN(parseFloat(form.min_km)) ? 0 : Math.max(0, parseFloat(form.min_km));
    const maxKmVal = isNaN(parseFloat(form.max_km)) ? 0 : Math.max(0, parseFloat(form.max_km));

    if (maxKmVal > 0 && minKmVal > maxKmVal) {
      toast.error("Km mínimo não pode ser maior que o máximo");
      return;
    }

    setLoading(true);
    isSavingRef.current = true;

    try {
      const baseFeeVal = isNaN(parseFloat(form.base_fee)) ? 5.3 : Math.max(0, parseFloat(form.base_fee));
      const feePerKmVal = isNaN(parseFloat(form.fee_per_km)) ? 1.7 : Math.max(0, parseFloat(form.fee_per_km));
      const earlyWithdrawalFeePercentVal = isNaN(parseFloat(form.early_withdrawal_fee_percent)) ? 10 : Math.max(0, parseFloat(form.early_withdrawal_fee_percent));
      const withdrawalFixedFeeVal = isNaN(parseFloat(form.withdrawal_fixed_fee)) ? 1.00 : Math.max(0, parseFloat(form.withdrawal_fixed_fee));
      const paymentDayVal = isNaN(parseInt(form.payment_day, 10)) ? 3 : parseInt(form.payment_day, 10);
      const appFeePerDeliveryVal = isNaN(parseFloat(form.app_fee_per_delivery)) ? 2 : Math.max(0, parseFloat(form.app_fee_per_delivery));
      const dynamicFeePerKmVal = isNaN(parseFloat(form.dynamic_fee_per_km)) ? 0 : Math.max(0, parseFloat(form.dynamic_fee_per_km));

      let savedRecord: any = null;

      // 1. Tenta salvar via RPC dedicada SECURITY DEFINER com permissão direta
      try {
        const { data: rpcData, error: rpcError } = await (supabase as any).rpc("update_delivery_config", {
          p_base_fee: baseFeeVal,
          p_fee_per_km: feePerKmVal,
          p_min_km: minKmVal,
          p_max_km: maxKmVal,
          p_round_km_up: form.round_km_up,
          p_dynamic_pricing_enabled: form.dynamic_pricing_enabled,
          p_dynamic_fee_per_km: dynamicFeePerKmVal,
          p_early_withdrawal_fee_percent: earlyWithdrawalFeePercentVal,
          p_withdrawal_fixed_fee: withdrawalFixedFeeVal,
          p_payment_day: paymentDayVal,
          p_app_fee_per_delivery: appFeePerDeliveryVal,
          p_whatsapp_number: form.whatsapp_number.trim(),
          p_recharge_url: form.recharge_url.trim(),
        });
        if (!rpcError && rpcData) {
          savedRecord = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        }
      } catch (rpcErr) {
        console.warn("[FeesConfigTab] RPC update_delivery_config indisponível, tentando update direto:", rpcErr);
      }

      // 2. Se a RPC não foi executada ou falhou, realiza update/insert direto na tabela
      if (!savedRecord) {
        const payload: any = {
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
          updated_at: new Date().toISOString(),
        };

        if (config?.id) {
          const { data: updated, error } = await supabase
            .from("delivery_config")
            .update(payload)
            .eq("id", config.id)
            .select()
            .maybeSingle();

          if (error) throw error;
          savedRecord = updated || payload;
        } else {
          // Busca registro existente ou insere
          const { data: existing } = await supabase.from("delivery_config").select("id").limit(1).maybeSingle();
          if (existing?.id) {
            const { data: updated, error } = await supabase
              .from("delivery_config")
              .update(payload)
              .eq("id", existing.id)
              .select()
              .maybeSingle();

            if (error) throw error;
            savedRecord = updated || payload;
          } else {
            const { data: inserted, error } = await supabase
              .from("delivery_config")
              .insert(payload)
              .select()
              .maybeSingle();

            if (error) throw error;
            savedRecord = inserted || payload;
          }
        }
      }

      // Atualiza o cache imediatamente com o registro salvo com sucesso
      if (savedRecord) {
        queryClient.setQueryData(["admin-delivery-config"], savedRecord);
        queryClient.setQueryData(["delivery-config"], savedRecord);
      }

      toast.success("Configuração de taxas salva com sucesso!");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-delivery-config"] }),
        queryClient.invalidateQueries({ queryKey: ["delivery-config"] }),
        queryClient.invalidateQueries({ queryKey: ["public-delivery-config"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-delivery-config"] }),
      ]);
    } catch (err: any) {
      console.error("[FeesConfigTab] Erro ao salvar taxas:", err);
      toast.error(err.message || "Erro ao salvar configuração de taxas.");
    } finally {
      setLoading(false);
      setTimeout(() => {
        isSavingRef.current = false;
      }, 500);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="w-4 h-4" /> Configuração de Taxas e Precificação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label>Taxa base de entrega (R$)</Label>
          <Input 
            type="number" 
            step="0.1" 
            value={form.base_fee} 
            onChange={(e) => setForm(f => ({ ...f, base_fee: e.target.value }))} 
          />
          <p className="text-xs text-muted-foreground">Valor fixo de partida cobrado em toda corrida</p>
        </div>

        <div className="space-y-2">
          <Label>Taxa por km regular (R$/km)</Label>
          <Input 
            type="number" 
            step="0.1" 
            value={form.fee_per_km} 
            onChange={(e) => setForm(f => ({ ...f, fee_per_km: e.target.value }))} 
          />
          <p className="text-xs text-muted-foreground">Valor por quilômetro percorrido em condições normais</p>
        </div>

        {/* Tarifa Dinâmica de Corridas */}
        <div className="border-t pt-4 mt-4 space-y-3 bg-amber-500/5 p-4 rounded-lg border border-amber-500/30">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400">
              <Flame className="w-5 h-5 text-amber-500 fill-amber-500" /> Tarifa Dinâmica (Horário de Pico / Alta Demanda)
            </Label>
            <Switch 
              checked={form.dynamic_pricing_enabled} 
              onCheckedChange={(checked) => setForm(f => ({ ...f, dynamic_pricing_enabled: checked }))} 
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Quando ativada, o valor adicional configurado abaixo é <strong>SOMADO</strong> ao valor do km normal (R$ {form.fee_per_km}/km).
          </p>

          {form.dynamic_pricing_enabled && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Valor Adicional Dinâmico por KM (+ R$/km)</Label>
                <Input 
                  type="number" 
                  step="0.1" 
                  min="0" 
                  value={form.dynamic_fee_per_km} 
                  onChange={(e) => setForm(f => ({ ...f, dynamic_fee_per_km: e.target.value }))} 
                  placeholder="Ex: 1.00"
                />
              </div>

              {/* Box de cálculo em tempo real */}
              <div className="p-3 bg-amber-500/10 rounded-md border border-amber-500/20 text-xs space-y-1.5 text-amber-900 dark:text-amber-200">
                <div className="flex justify-between">
                  <span>Taxa Base Regular por KM:</span>
                  <strong>R$ {regularKmFee.toFixed(2)}/km</strong>
                </div>
                <div className="flex justify-between text-amber-600 dark:text-amber-400 font-medium">
                  <span>+ Adicional Dinâmico:</span>
                  <strong>+ R$ {dynamicKmFee.toFixed(2)}/km</strong>
                </div>
                <div className="border-t border-amber-500/30 pt-1.5 flex justify-between font-bold text-sm text-amber-700 dark:text-amber-300">
                  <span>= Taxa Total Cobrada por KM:</span>
                  <span>R$ {totalEffectiveKmFee.toFixed(2)}/km</span>
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                  As lojas e motoristas pagarão/receberão com base em R$ {totalEffectiveKmFee.toFixed(2)}/km
                </div>
              </div>
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

        {/* Taxa do App por Corrida (%) com visualização explicativa */}
        <div className="space-y-3 border-t pt-4 mt-4 bg-muted/20 p-3 rounded-lg border">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 font-semibold">
              <Percent className="w-4 h-4 text-primary" /> Taxa do app por corrida (%)
            </Label>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
              {appFeePercentNumber}%
            </span>
          </div>
          <Input 
            type="number" 
            step="0.5" 
            min="0" 
            max="100" 
            value={form.app_fee_per_delivery} 
            onChange={(e) => setForm(f => ({ ...f, app_fee_per_delivery: e.target.value }))} 
            placeholder="Ex: 2.0"
          />
          <p className="text-xs text-muted-foreground">
            Porcentagem que o aplicativo retém de cada corrida realizada pelos entregadores.
          </p>

          <div className="p-2.5 bg-background rounded border text-xs space-y-1 text-muted-foreground">
            <div className="flex justify-between">
              <span>Exemplo corrida de R$ 10,00:</span>
              <span className="font-semibold text-foreground">
                Retenção App ({appFeePercentNumber}%): R$ {((10 * appFeePercentNumber) / 100).toFixed(2).replace(".", ",")}
              </span>
            </div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
              <span>Líquido para o motorista:</span>
              <span>R$ {(Math.max(0, 10 - (10 * appFeePercentNumber) / 100)).toFixed(2).replace(".", ",")}</span>
            </div>
          </div>
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
        <Button onClick={handleSave} disabled={loading || configLoading} className="w-full">
          {loading ? "Salvando taxas..." : "Salvar Configuração"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FeesConfigTab;
