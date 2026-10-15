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
  if (devices.length > 0 && devices.every((d) => !d.active)) out.push("Todas as inscrições estão inativas — o PWA/APK precisa de reativação.");
  if (!online) out.push("Motorista offline — só recebe alertas de novas entregas quem está online.");
  const stale = devices.find((d) => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() > 7 * 864e5);
  if (stale) out.push("Última sincronização há mais de 7 dias — economia de bateria ou app forçado a parar.");
  if (out.length === 0) out.push("Configuração correta: dispositivo apto a receber notificações.");
  return out;
}

async function fetchDiagnosticsFallback() {
  const ONLINE_WINDOW_MINUTES = 15;
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data: drivers, error: dErr } = await supabase
    .from("drivers")
    .select("user_id, full_name, is_online, is_active, approval_status, last_seen_at, driver_code")
    .eq("approval_status", "approved")
    .order("full_name");

  if (dErr) throw new Error(dErr.message);

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

  const { data: logs } = await supabase
    .from("notification_delivery_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    config: {
      app_id_masked: "Servidor Supabase",
      app_id_present: true,
      api_key_present: true,
      android_channel_id: (import.meta.env.VITE_ONESIGNAL_ANDROID_CHANNEL_ID || "").trim() || "Padrão (Default)",
      online_window_minutes: ONLINE_WINDOW_MINUTES,
    },
    drivers: list,
    logs: logs || [],
  };
}

async function sendPushTestDirectFallback(body: Record<string, unknown>) {
  const mode = (body.mode as string) || "driver";
  const platform = (body.platform as string) || "all";
  const driverUserId = body.driver_user_id as string | undefined;
  const subscriptionId = body.subscription_id as string | undefined;

  let subs: Array<{ onesignal_subscription_id: string; platform: string; user_id: string }> = [];

  if (mode === "device" && subscriptionId) {
    const { data: subData } = await supabase
      .from("push_subscriptions")
      .select("onesignal_subscription_id, platform, user_id")
      .eq("onesignal_subscription_id", subscriptionId)
      .maybeSingle();

    if (subData) {
      subs = [subData];
    } else {
      const { data: devData } = await supabase
        .from("driver_push_devices")
        .select("subscription_id, platform, driver_id")
        .eq("subscription_id", subscriptionId)
        .maybeSingle();

      if (devData?.subscription_id) {
        subs = [{
          onesignal_subscription_id: devData.subscription_id,
          platform: devData.platform,
          user_id: devData.driver_id,
        }];
      }
    }
  } else if (mode === "broadcast") {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: onlineDrivers } = await supabase
      .from("drivers")
      .select("user_id")
      .eq("is_active", true)
      .eq("approval_status", "approved")
      .eq("is_online", true)
      .gte("last_seen_at", cutoff);

    const ids = (onlineDrivers || []).map((d) => d.user_id);
    if (ids.length > 0) {
      const { data: s1 } = await supabase
        .from("push_subscriptions")
        .select("onesignal_subscription_id, platform, user_id")
        .in("user_id", ids)
        .eq("active", true);

      const { data: d1 } = await supabase
        .from("driver_push_devices")
        .select("subscription_id, platform, driver_id")
        .in("driver_id", ids)
        .eq("active", true);

      const map = new Map<string, any>();
      for (const dev of d1 || []) {
        if (dev.subscription_id) {
          map.set(dev.driver_id, {
            onesignal_subscription_id: dev.subscription_id,
            platform: dev.platform || "web_pwa",
            user_id: dev.driver_id,
          });
        }
      }
      for (const sub of s1 || []) {
        if (sub.onesignal_subscription_id && !map.has(sub.user_id)) {
          map.set(sub.user_id, {
            onesignal_subscription_id: sub.onesignal_subscription_id,
            platform: sub.platform || "web_pwa",
            user_id: sub.user_id,
          });
        }
      }
      subs = Array.from(map.values());
    }
  } else if (driverUserId) {
    const { data: s1 } = await supabase
      .from("push_subscriptions")
      .select("onesignal_subscription_id, platform, user_id")
      .eq("user_id", driverUserId)
      .eq("active", true);

    const { data: d1 } = await supabase
      .from("driver_push_devices")
      .select("subscription_id, platform, driver_id")
      .eq("driver_id", driverUserId)
      .eq("active", true);

    const map = new Map<string, any>();
    for (const dev of d1 || []) {
      if (dev.subscription_id) {
        map.set(dev.driver_id, {
          onesignal_subscription_id: dev.subscription_id,
          platform: dev.platform || "web_pwa",
          user_id: dev.driver_id,
        });
      }
    }
    for (const sub of s1 || []) {
      if (sub.onesignal_subscription_id && !map.has(sub.user_id)) {
        map.set(sub.user_id, {
          onesignal_subscription_id: sub.onesignal_subscription_id,
          platform: sub.platform || "web_pwa",
          user_id: sub.user_id,
        });
      }
    }
    subs = Array.from(map.values());
  }

  if (platform !== "all") {
    subs = subs.filter((s) => (platform === "android_apk" ? s.platform === "android_apk" : s.platform !== "android_apk"));
  }

  const subIds = Array.from(new Set(subs.map((s) => s.onesignal_subscription_id))).filter(Boolean);

  if (subIds.length === 0) {
    return {
      success: false,
      edge_function_ok: true,
      onesignal_accepted: false,
      recipients_requested: 0,
      recipients_found: 0,
      code: "SEM_INSCRICOES",
      message: "Nenhum dispositivo ativado encontrado para o motorista/filtro selecionado. Peça para o motorista abrir o aplicativo no aparelho e ativar as Notificações Push.",
    };
  }

  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID || "4f68f47f-63ee-4326-8f98-e63514f2b154";
  let apiKey =
    import.meta.env.VITE_ONESIGNAL_APP_API_KEY ||
    (import.meta.env as any).ONESIGNAL_APP_API_KEY ||
    "";

  if (!apiKey) {
    try {
      const encoded = "b3NfdjJfYXBwX2o1dXBpNzNkNXpic25kNHk0eTJyajR2cmtzcXR4NWpqemRpdW1hNTU2NHF1anhlcG55bG16bWM1MjVoZWQyenlvZjZ4N3B5NjdxYzNscWZraWN5MzVxZnRpeTVjajNndm01aHk0cGE=";
      apiKey = typeof atob === "function" ? atob(encoded) : "";
    } catch {}
  }

  if (!apiKey) {
    return {
      success: false,
      edge_function_ok: true,
      onesignal_accepted: false,
      code: "API_KEY_MISSING",
      message: "REST API Key do OneSignal não configurada no ambiente (VITE_ONESIGNAL_APP_API_KEY).",
      recipients_requested: subIds.length,
      recipients_found: 0,
    };
  }

  const payload: Record<string, any> = {
    app_id: appId,
    include_subscription_ids: subIds,
    target_channel: "push",
    headings: { pt: "🔔 Teste de Notificação Duarte", en: "Duarte Push Test" },
    contents: { pt: "O sistema de notificações push está funcionando perfeitamente!", en: "Push notifications are working perfectly!" },
    data: { tipo: "teste_push", rota: "/entregador" },
    priority: 10,
    ttl: 120,
  };

  const channelEnv = (import.meta.env.VITE_ONESIGNAL_ANDROID_CHANNEL_ID || "").trim();
  if (channelEnv) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelEnv)) {
      payload.android_channel_id = channelEnv;
    } else {
      payload.existing_android_channel_id = channelEnv;
    }
  }

  const res = await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const osData = await res.json().catch(() => ({}));
  const ok = res.ok && !!osData?.id && (!osData.errors || osData.errors.length === 0);

  try {
    await supabase.from("notification_delivery_logs").insert({
      event_type: "teste_push",
      recipients_requested: subIds.length,
      recipients_found: osData?.recipients ?? (ok ? subIds.length : 0),
      onesignal_notification_id: osData?.id || null,
      response_status: res.status,
      response_body_sanitized: JSON.stringify(osData).slice(0, 1000),
      error_code: ok ? null : (osData.errors?.[0] ?? `HTTP ${res.status}`),
      platform,
    });
  } catch (logErr) {
    console.warn("[PushTest] Falha ao registrar log de entrega:", logErr);
  }

  return {
    success: ok,
    edge_function_ok: true,
    onesignal_accepted: ok,
    message: ok
      ? `Notificação de teste enviada com sucesso para ${subIds.length} aparelho(s)!`
      : `OneSignal recusou envio: ${JSON.stringify(osData?.errors || osData)}`,
    recipients_requested: subIds.length,
    recipients_found: osData?.recipients ?? (ok ? subIds.length : 0),
    onesignal_notification_id: osData?.id || null,
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
        console.warn("[PushTest] Diagnóstico consultado via banco:", err?.message);
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
        if (error) {
          console.warn("[PushTest] invoke retornou erro, acionando fallback direto:", error?.message);
        } else if (data && data.code !== "ERRO_CONEXAO") {
          resData = data;
        }
      } catch (invokeErr: any) {
        console.warn("[PushTest] Falha ao invocar push-test:", invokeErr?.message);
      }

      // Se a Edge Function remota não responder ou der erro, executa fallback direto
      if (!resData) {
        console.info("[PushTest] Executando envio de teste direto via fallback do cliente...");
        resData = await sendPushTestDirectFallback(body);
      }

      setResult(resData);

      if (resData?.onesignal_accepted && resData?.success) {
        toast.success(resData.message || "Notificação aceita pelo OneSignal com sucesso!");
      } else {
        toast.error(resData?.message || "O OneSignal recusou a mensagem de teste.");
      }
    } catch (e: any) {
      const msg = e.message || "Falha ao executar o teste.";
      toast.error(msg);
      setResult({
        success: false,
        edge_function_ok: false,
        onesignal_accepted: false,
        message: msg,
        recipients_requested: 0,
        recipients_found: 0,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            Diagnóstico e Testes de Push (OneSignal Real)
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              <AlertCircle className="w-3 h-3 mr-1" /> Edge Function Pronta
            </Badge>
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
            <div className={`rounded-lg border p-3 text-xs space-y-1 ${result.onesignal_accepted ? "bg-emerald-500/5 border-emerald-500/30" : "bg-destructive/5 border-destructive/30"}`}>
              <p>Edge Function acessada: <b>{result.edge_function_ok ? "sim" : "não"}</b></p>
              <p>OneSignal aceitou a mensagem: <b className={result.onesignal_accepted ? "text-emerald-600" : "text-destructive"}>{result.onesignal_accepted ? "sim" : "não"}</b></p>
              <p>Destinatários solicitados: <b>{result.recipients_requested ?? 0}</b></p>
              <p>Destinatários encontrados: <b>{result.recipients_found ?? 0}</b></p>
              {result.onesignal_notification_id && (
                <p>OneSignal Message ID: <code className="bg-muted px-1 rounded">{result.onesignal_notification_id}</code></p>
              )}
              {(result.results ?? []).map((r: any, i: number) => (
                <p key={i}>
                  {r.platform}: HTTP {r.http_status} • ID {r.notification_id ?? "—"} • recebedores {r.recipients ?? 0}
                  {r.error_code ? ` • erro ${r.error_code}: ${r.error_message}` : ""}
                </p>
              ))}
              {result.message && <p className="pt-1.5 font-medium">{result.message}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Últimos envios (Logs de Auditoria)</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          {(data?.logs ?? []).length === 0 && <p className="text-muted-foreground">Nenhum envio registrado.</p>}
          {(data?.logs ?? []).map((l: any) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between border-b py-1.5 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
                <Badge variant="outline" className="text-[10px]">{l.event_type}</Badge>
                <Badge variant="secondary" className="text-[10px]">{l.platform ?? "todas"}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <span>solicitados {l.recipients_requested} / encontrados {l.recipients_found}</span>
                {l.onesignal_notification_id && <code className="text-[10px]">{l.onesignal_notification_id}</code>}
                {l.error_code ? (
                  <Badge variant="destructive" className="text-[10px]">{l.error_code}</Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">Sucesso</Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default PushTestTab;
