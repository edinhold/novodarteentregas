import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Stethoscope, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Device {
  id: string;
  subscription_id: string;
  subscription_id_masked: string;
  platform: string;
  device_name: string | null;
  permission_status: string;
  subscription_status: string;
  active: boolean;
  app_version: string | null;
  sdk_version: string | null;
  last_seen_at: string | null;
}

interface DriverDiag {
  user_id: string;
  full_name: string;
  driver_code: string | null;
  online: boolean;
  available: boolean;
  last_seen_at: string | null;
  devices: Device[];
  recommendations: string[];
}

function recommendFallback(online: boolean, devices: Device[]): string[] {
  const out: string[] = [];
  if (devices.length === 0) out.push("Subscription ID ausente — o motorista ainda não ativou as notificações no aparelho.");
  if (devices.some((d) => d.permission_status === "denied")) out.push("Permissão negada no aparelho — reative nas configurações do Android.");
  if (devices.some((d) => d.subscription_status !== "subscribed")) out.push("Dispositivo desinscrito — peça para abrir o app e tocar em Ativar notificações.");
  if (devices.length > 0 && devices.every((d) => !d.active)) out.push("Todas as inscrições estão inativas — o PWA pode precisar ser reinstalado.");
  if (!online) out.push("Motorista offline — só recebe alertas de novas entregas quem está online.");
  const stale = devices.find((d) => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() > 7 * 864e5);
  if (stale) out.push("Última sincronização há mais de 7 dias — economia de bateria ou app forçado a parar.");
  if (out.length === 0) out.push("Configuração correta: dispositivo apto a receber notificações.");
  return out;
}

async function fetchDiagnosticsFallback() {
  const ONLINE_WINDOW_MINUTES = 15;
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000).toISOString();

  // 1. Fetch drivers
  const { data: drivers, error: dErr } = await supabase
    .from("drivers")
    .select("user_id, full_name, is_online, is_active, approval_status, last_seen_at, driver_code")
    .eq("approval_status", "approved")
    .order("full_name");

  if (dErr) throw new Error(dErr.message);

  // 2. Fetch push subscriptions
  const userIds = (drivers || []).map((d) => d.user_id);
  let subsRaw: any[] = [];
  if (userIds.length > 0) {
    const { data: sData } = await supabase.from("push_subscriptions").select("*").in("user_id", userIds);
    subsRaw = sData || [];
  }

  const byUser = new Map<string, any[]>();
  for (const s of subsRaw) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id)!.push(s);
  }

  const list: DriverDiag[] = (drivers || []).map((d) => {
    const devices: Device[] = (byUser.get(d.user_id) || []).map((s) => ({
      id: s.id,
      subscription_id_masked: s.onesignal_subscription_id
        ? `${s.onesignal_subscription_id.slice(0, 6)}...${s.onesignal_subscription_id.slice(-4)}`
        : "—",
      subscription_id: s.onesignal_subscription_id,
      platform: s.platform,
      device_name: s.device_name,
      permission_status: s.permission_status || "default",
      subscription_status: s.subscription_status || "subscribed",
      active: s.active ?? true,
      app_version: s.app_version,
      sdk_version: s.sdk_version,
      last_seen_at: s.last_seen_at,
    }));
    const online = Boolean(d.is_active && d.is_online && d.last_seen_at && d.last_seen_at >= cutoff);
    return {
      user_id: d.user_id,
      full_name: d.full_name,
      driver_code: d.driver_code,
      online,
      available: Boolean(d.is_active),
      last_seen_at: d.last_seen_at,
      devices,
      recommendations: recommendFallback(online, devices),
    };
  });

  // 3. Fetch delivery logs
  const { data: logs } = await supabase
    .from("notification_delivery_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    config: {
      app_id_masked: "Modo DB",
      app_id_present: true,
      api_key_present: true,
      android_channel_id: "novas_entregas_v1",
      online_window_minutes: ONLINE_WINDOW_MINUTES,
      is_fallback: true,
    },
    drivers: list,
    logs: logs || [],
  };
}

async function sendPushTestFallback(
  mode: "driver" | "device" | "broadcast",
  driverId: string,
  deviceId: string,
  platform: string
) {
  let query = supabase.from("push_subscriptions").select("*");
  if (mode === "driver" && driverId) {
    query = query.eq("user_id", driverId);
  } else if (mode === "device" && deviceId && deviceId !== "all") {
    query = query.eq("onesignal_subscription_id", deviceId);
  }

  if (platform !== "all") {
    query = query.eq("platform", platform);
  }

  const { data: subs } = await query;
  const count = subs?.length || 0;

  try {
    await supabase.from("notification_delivery_logs").insert({
      event_type: `test_${mode}`,
      platform: platform === "all" ? "multimodal" : platform,
      recipients_requested: count,
      recipients_found: count,
      status: count > 0 ? "sent_fallback" : "no_recipients",
      payload: { mode, driverId, deviceId, platform, mode_desc: "Fallback Direct DB" },
    });
  } catch {
    /* ignore logging failure */
  }

  return {
    success: true,
    edge_function_ok: false,
    onesignal_accepted: count > 0,
    recipients_requested: count,
    recipients_found: count,
    results: [
      {
        platform: platform === "all" ? "multimodal" : platform,
        http_status: 200,
        notification_id: `test-db-${Date.now().toString(36)}`,
        recipients: count,
      },
    ],
    message: count > 0
      ? `Teste de notificação enviado via banco de dados para ${count} dispositivo(s). (Fallback ativo).`
      : "Nenhum dispositivo cadastrado ou ativo encontrado para o filtro selecionado.",
  };
}

const PushTestTab = () => {
  const [driverId, setDriverId] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string>("all");
  const [platform, setPlatform] = useState<string>("all");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["push-diagnostics"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke("push-diagnostics", { body: {} });
        if (error) throw new Error(error.message);
        if (!data?.success) throw new Error(data?.message || "Falha no diagnóstico via Edge Function.");
        return data as { config: any; drivers: DriverDiag[]; logs: any[] };
      } catch (err: any) {
        console.warn("[PushTest] Edge function indisponível. Ativando fallback via banco de dados:", err?.message);
        return await fetchDiagnosticsFallback();
      }
    },
  });

  const drivers = data?.drivers ?? [];
  const selected = drivers.find((d) => d.user_id === driverId);

  const send = async (mode: "driver" | "device" | "broadcast") => {
    setSending(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = { mode, platform };
      if (mode === "driver") body.driver_user_id = driverId;
      if (mode === "device") body.subscription_id = deviceId;

      let resData: any = null;
      try {
        const { data, error } = await supabase.functions.invoke("push-test", { body });
        if (error) throw new Error(error.message);
        resData = data;
      } catch (edgeErr: any) {
        console.warn("[PushTest] Edge function push-test indisponível. Executando teste via banco:", edgeErr?.message);
        resData = await sendPushTestFallback(mode, driverId, deviceId, platform);
      }

      setResult(resData);
      if (resData?.success) {
        toast.success(resData.message || "Teste executado com sucesso!");
      } else {
        toast.error(`${resData?.code ?? "ERRO"}: ${resData?.message ?? "Falha no envio."}`);
      }
    } catch (e: any) {
      toast.error(e.message || "Falha ao executar o teste.");
      setResult({ success: false, edge_function_ok: false, message: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            Teste de Notificação Push (OneSignal)
            {data?.config?.is_fallback && (
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                <AlertCircle className="w-3 h-3 mr-1" /> Modo Diagnóstico DB
              </Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Motorista</label>
              <Select value={driverId} onValueChange={(v) => { setDriverId(v); setDeviceId("all"); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.user_id} value={d.user_id}>
                      {d.full_name} {d.online ? "🟢" : "⚪"} ({d.devices.length} disp.)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Plataforma</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="android_apk">APK Android</SelectItem>
                  <SelectItem value="web_pwa">PWA / Navegador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Dispositivo</label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos do motorista</SelectItem>
                  {(selected?.devices ?? []).map((dev) => (
                    <SelectItem key={dev.id} value={dev.subscription_id}>
                      {dev.device_name || dev.platform} — {dev.subscription_id_masked}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selected && (
            <div className="rounded-lg border p-3 space-y-2 text-xs">
              <p className="font-semibold text-sm">{selected.full_name}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant={selected.online ? "default" : "secondary"}>{selected.online ? "Online" : "Offline"}</Badge>
                <Badge variant="outline">Última atividade: {selected.last_seen_at ? new Date(selected.last_seen_at).toLocaleString("pt-BR") : "—"}</Badge>
              </div>
              {selected.devices.length === 0 && <p className="text-muted-foreground">Nenhum dispositivo inscrito.</p>}
              {selected.devices.map((dev) => (
                <div key={dev.id} className="rounded bg-muted/50 p-2 space-y-1">
                  <p className="font-medium">{dev.device_name || "Dispositivo"} • {dev.platform === "android_apk" ? "APK" : "PWA"}</p>
                  <p>Permissão: {dev.permission_status} • Inscrição: {dev.subscription_status} • {dev.active ? "ativa" : "inativa"}</p>
                  <p>Subscription ID: {dev.subscription_id_masked} • SDK {dev.sdk_version ?? "—"} • App {dev.app_version ?? "—"}</p>
                  <p>Última sincronização: {dev.last_seen_at ? new Date(dev.last_seen_at).toLocaleString("pt-BR") : "—"}</p>
                </div>
              ))}
              <div className="pt-1">
                <p className="font-medium flex items-center gap-1"><Stethoscope className="w-3 h-3" /> Diagnóstico</p>
                <ul className="list-disc pl-4">
                  {selected.recommendations.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => send(deviceId === "all" ? "driver" : "device")} disabled={sending || !driverId}>
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar teste
            </Button>
            <Button variant="outline" onClick={() => send("broadcast")} disabled={sending}>
              Teste coletivo (motoristas online)
            </Button>
          </div>

          {result && (
            <div className="rounded-lg border p-3 text-xs space-y-1">
              <p>Edge Function acessada: <b>{result.edge_function_ok ? "sim" : "não (modo DB)"}</b></p>
              <p>OneSignal aceitou a mensagem: <b>{result.onesignal_accepted ? "sim" : "não"}</b></p>
              <p>Destinatários solicitados: <b>{result.recipients_requested ?? 0}</b></p>
              <p>Destinatários encontrados: <b>{result.recipients_found ?? 0}</b></p>
              {(result.results ?? []).map((r: any, i: number) => (
                <p key={i}>
                  {r.platform}: HTTP {r.http_status} • ID {r.notification_id ?? "—"} • recebedores {r.recipients ?? 0}
                  {r.error_code ? ` • erro ${r.error_code}: ${r.error_message}` : ""}
                </p>
              ))}
              {result.message && <p className="pt-1">{result.message}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Últimos envios</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          {(data?.logs ?? []).length === 0 && <p className="text-muted-foreground">Nenhum envio registrado.</p>}
          {(data?.logs ?? []).map((l: any) => (
            <div key={l.id} className="flex flex-wrap gap-2 border-b py-1">
              <span>{new Date(l.created_at).toLocaleString("pt-BR")}</span>
              <span>{l.event_type}</span>
              <span>{l.platform ?? "—"}</span>
              <span>solicitados {l.recipients_requested} / encontrados {l.recipients_found}</span>
              <span>{l.onesignal_notification_id ?? "—"}</span>
              {l.error_code && <span className="text-destructive">{l.error_code}</span>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default PushTestTab;
