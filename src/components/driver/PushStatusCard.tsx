import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Loader2, Smartphone, Trash2, CheckCircle2 } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";
import { useState } from "react";

const PushStatusCard = ({ userId }: { userId?: string | null }) => {
  const { state, loading, activate, unregister } = usePushNotifications(userId, "driver");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isGranted = state?.permission === "granted" && !!state?.subscriptionId;

  const handleActivate = async () => {
    if (!userId) {
      toast.error("Motorista não autenticado.");
      return;
    }
    const res = await activate();
    if (res?.permission === "granted" && res?.subscriptionId) {
      toast.success("Notificações push ativadas com sucesso!");
    } else {
      toast.error(res?.error || "Permissão de notificação negada no aparelho.");
    }
  };

  const handleUnregister = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const ok = await unregister();
    if (ok) {
      toast.success("Dispositivo desvinculado com sucesso.");
      setConfirmDelete(false);
    } else {
      toast.error("Falha ao desvincular dispositivo.");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isGranted ? <Bell className="w-4 h-4 text-emerald-500" /> : <BellOff className="w-4 h-4 text-amber-500" />}
            Notificações de novas entregas
          </div>
          {isGranted ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1 text-xs">
              <CheckCircle2 className="w-3 h-3" /> Ativo (1 Aparelho)
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs">
              Inativo / Pendente
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            <Smartphone className="w-3 h-3" />
            {state?.platform === "android_apk" ? "Aplicativo Android (10+)" : state?.platform === "ios" ? "iOS" : "Navegador / PWA (Android 10+)"}
          </Badge>
          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
            Android 10+ OK
          </Badge>
          {state?.subscriptionId && (
            <span className="text-muted-foreground font-mono text-[10px]">
              ID: ***{state.subscriptionId.slice(-8)}
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/60">
          <span className="font-semibold text-foreground">Regra do Sistema:</span> Cada motorista possui apenas 1 dispositivo ativo por vez. Acessar em um novo aparelho ativará o novo e desativará o anterior automaticamente.
        </div>

        {isGranted ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleActivate} disabled={loading} className="flex-1 text-xs">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Bell className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />}
              Reativar Dispositivo
            </Button>
            <Button
              variant={confirmDelete ? "destructive" : "outline"}
              size="sm"
              onClick={handleUnregister}
              disabled={loading}
              className="text-xs"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
              {confirmDelete ? "Confirmar Desvinculação?" : "Desvincular"}
            </Button>
          </div>
        ) : (
          <Button onClick={handleActivate} disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-xs">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
            Ativar Notificações Push neste Aparelho
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default PushStatusCard;
