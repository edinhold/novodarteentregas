import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, MapPin, Store, DollarSign, AlertTriangle, Loader2 } from "lucide-react";
import type { OverlayDelivery, OverlayState } from "@/hooks/useDeliveryOverlay";

interface Props {
  delivery: OverlayDelivery | null;
  state: OverlayState;
  secondsLeft?: number;
  permissionWarning: boolean;
  onAccept: () => void;
  onReject: () => void;
  onRequestPermission?: () => void;
}

/**
 * Full-screen / corner overlay shown when a new delivery arrives while the
 * driver is in standby mode. On native Android this should be paired with
 * SYSTEM_ALERT_WINDOW (Draw Over Other Apps); on the web we render the
 * highest-z modal possible as a fallback.
 */
const DeliveryOverlay = ({ delivery, state, secondsLeft = 0, permissionWarning, onAccept, onReject, onRequestPermission }: Props) => {
  const visible = !!delivery || state === "loading" || state === "error";

  const { data: config } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data } = await supabase.from("delivery_config").select("app_fee_per_delivery").limit(1).maybeSingle();
      return data;
    },
  });

  const appFeePct = Number((config as any)?.app_fee_per_delivery ?? 2);
  const grossVal = Number(delivery?.driver_fee || delivery?.credit_cost || 0);
  const netVal = Math.max(0, grossVal * (1 - appFeePct / 100));

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="delivery-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-start justify-center bg-background/80 backdrop-blur-sm p-4 md:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Nova entrega disponível"
        >
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md md:max-w-lg md:mt-8 lg:absolute lg:top-6 lg:right-6 lg:max-w-sm"
          >
            <Card className="shadow-xl border-2 border-primary overflow-hidden transition-all duration-200 ring-4 ring-primary/30">
              <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-foreground" />
                  </span>
                  <p className="text-sm font-semibold">Nova entrega disponível</p>
                </div>
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {secondsLeft > 0 ? `${secondsLeft}s para responder` : "Standby"}
                </Badge>
              </div>

              <div className="p-4 space-y-3">
                {permissionWarning && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive p-2 text-xs">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      Permissão de notificação/sobreposição não concedida. O overlay pode não aparecer com o app fechado.
                      {onRequestPermission && (
                        <button
                          onClick={onRequestPermission}
                          className="ml-1 underline font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          Conceder
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {state === "loading" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando dados da entrega...
                  </div>
                )}

                {state === "error" && (
                  <div className="flex items-center gap-2 text-sm text-destructive py-4">
                    <AlertTriangle className="h-4 w-4" />
                    Falha ao carregar os dados da entrega.
                  </div>
                )}

                {state === "success" && delivery && (
                  <>
                    <div className="flex items-start gap-2">
                      <Store className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Estabelecimento</p>
                        <p className="font-semibold truncate">
                          {delivery.restaurant?.name || "Loja"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Coleta</p>
                        <p className="text-sm break-words">{delivery.pickup_address}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Entrega</p>
                        <p className="text-sm break-words">{delivery.delivery_address}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-600" />
                        <div>
                          <p className="text-xs font-semibold text-foreground">Ganho Líquido</p>
                          <p className="text-[10px] text-muted-foreground">Comissão do app descontada ({appFeePct}%)</p>
                        </div>
                      </div>
                      <span className="font-extrabold text-base text-green-600">
                        R$ {netVal.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}

                <div className="flex flex-col md:flex-row gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={onReject}
                    className="w-full md:flex-1 transition-all duration-200"
                    aria-label="Recusar entrega"
                  >
                    <X className="h-4 w-4 mr-1" /> Recusar
                  </Button>
                  <Button
                    onClick={onAccept}
                    disabled={state !== "success"}
                    className="w-full md:flex-1 transition-all duration-200"
                    aria-label="Aceitar entrega"
                  >
                    <Check className="h-4 w-4 mr-1" /> Aceitar{secondsLeft > 0 ? ` (${secondsLeft}s)` : ""}
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DeliveryOverlay;
