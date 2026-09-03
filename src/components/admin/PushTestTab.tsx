import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Stethoscope, RefreshCw } from "lucide-react";
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

const PushTestTab = () => {
  const [driverId, setDriverId] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string>("all");
  const [platform, setPlatform] = useState<string>("all");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["push-diagnostics"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("push-diagnostics", { body: {} });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.message || "Falha ao carregar diagnóstico.");
      return data as { config: any; drivers: DriverDiag[]; logs: any[] };
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
      const { data, error } = await supabase.functions.invoke("push-test", { body });
      if (error) throw new Error(error.message);
      setResult(data);
      if (data?.success) toast.success(data.message);
      else toast.error(`${data?.code ?? "ERRO"}: ${data?.message ?? "Falha no envio."}`);
    } catch (e: any) {
      toast.error(e.message || "Falha ao chamar a Edge Function.");
      setResult({ success: false, edge_function_ok: false, message: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Teste de Notificação Push</CardTitle>
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
              <p>Edge Function acessada: <b>{result.edge_function_ok ? "sim" : "não"}</b></p>
              <p>OneSignal aceitou a mensagem: <b>{result.onesignal_accepted ? "sim" : "não"}</b></p>
              <p>Destinatários solicitados: <b>{result.recipients_requested ?? 0}</b></p>
              <p>Destinatários encontrados pelo OneSignal: <b>{result.recipients_found ?? 0}</b></p>
              {(result.results ?? []).map((r: any, i: number) => (
                <p key={i}>
                  {r.platform}: HTTP {r.http_status} • ID {r.notification_id ?? "—"} • recebedores {r.recipients ?? 0}
                  {r.error_code ? ` • erro ${r.error_code}: ${r.error_message}` : ""}
                </p>
              ))}
              {result.message && <p className="pt-1">{result.message}</p>}
              <p className="text-muted-foreground pt-1">
                HTTP 200 significa apenas que o OneSignal aceitou a mensagem. Confirme a exibição no aparelho real.
              </p>
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
