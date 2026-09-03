import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

const TIPS = [
  "Permitir notificações para o aplicativo",
  "Manter o canal “Novas entregas” ativado com som e vibração",
  "Mostrar notificações na tela bloqueada",
  "Permitir execução em segundo plano",
  "Remover a restrição severa de bateria",
  "Não forçar a parada do aplicativo",
  "Manter a internet ativa",
];

const PushStatusCard = ({ userId }: { userId?: string | null }) => {
  const { state, loading, activate } = usePushNotifications(userId, "driver");

  const granted = state?.permission === "granted" && !!state?.subscriptionId;

  const handle = async () => {
    const s = await activate();
    if (s?.permission === "granted" && s.subscriptionId) toast.success("Notificações ativadas neste aparelho!");
    else if (s?.permission === "denied") toast.error("Permissão negada. Libere as notificações nas configurações do aparelho.");
    else toast.info("Não foi possível concluir a inscrição. Tente novamente.");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {granted ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
          Notificações de novas entregas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={granted ? "default" : "secondary"}>{granted ? "Ativas" : "Inativas"}</Badge>
          <Badge variant="outline" className="gap-1">
            <Smartphone className="w-3 h-3" />
            {state?.platform === "android_apk" ? "Aplicativo Android" : state?.platform === "ios" ? "iOS" : "Navegador / PWA"}
          </Badge>
          {state?.subscriptionId && (
            <Badge variant="outline">ID ***{state.subscriptionId.slice(-8)}</Badge>
          )}
        </div>

        {!granted && (
          <Button onClick={handle} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
            Ativar notificações
          </Button>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Configuração recomendada do aparelho:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {TIPS.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <p className="pt-1">
            O som e o banner dependem das configurações do seu aparelho e podem não aparecer no modo “Não perturbe”.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PushStatusCard;
