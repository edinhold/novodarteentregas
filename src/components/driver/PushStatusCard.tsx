import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Loader2, Smartphone, Trash2, CheckCircle2 } from "lucide-react";
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
  const { state, loading, activate, unregister } = usePushNotifications(userId, "driver");

  const granted = state?.permission === "granted" && !!state?.subscriptionId;

  const handle = async () => {
    toast.info("A integração de notificações push foi removida para reimplantação limpa do zero.");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BellOff className="w-4 h-4 text-amber-500" />
          Notificações de novas entregas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
            Aguardando Nova Implantação
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Smartphone className="w-3 h-3" />
            {state?.platform === "android_apk" ? "Aplicativo Android" : state?.platform === "ios" ? "iOS" : "Navegador / PWA"}
          </Badge>
        </div>

        <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/60">
          <span className="font-semibold text-foreground">Status do Sistema:</span> A implementação antiga do OneSignal foi completamente removida. O sistema de alertas sonoros internos e radar continua funcionando normalmente.
        </div>

        <Button onClick={handle} variant="outline" className="w-full">
          <Bell className="w-4 h-4 mr-2" />
          Notificações Push (Pausadas)
        </Button>

        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Alertas Ativos:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Alertas sonoros de radar no painel do motorista (Sons e Assovio)</li>
            <li>Alertas na tela do dispositivo e atualizações em tempo real</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default PushStatusCard;
