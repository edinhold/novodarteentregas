import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DriverPhoto } from "@/components/DriverPhoto";
import { normalizeWhatsAppNumber, formatPhoneNumber } from "@/lib/phoneUtils";
import {
  Truck,
  Phone,
  MessageCircle,
  XCircle,
  Clock,
  Car,
  IdCard,
  CheckCircle2,
  Loader2,
} from "lucide-react";

export interface AssignedDriverData {
  id?: string;
  user_id: string;
  full_name: string;
  phone: string;
  photo_url?: string | null;
  driver_code?: string | null;
  vehicle_plate?: string | null;
  vehicle_type?: string | null;
}

export interface ActiveDeliveryRequest {
  id: string;
  status: string;
  driver_id: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  notes?: string | null;
  created_at?: string;
  credit_cost?: number;
  driver_fee?: number;
}

interface AssignedDriverCardProps {
  activeRequest: ActiveDeliveryRequest | null;
  onCancelRequest?: (requestId: string) => void;
}

export const AssignedDriverCard = ({ activeRequest, onCancelRequest }: AssignedDriverCardProps) => {
  const assignedDriverId = activeRequest?.driver_id || null;
  const requestId = activeRequest?.id || null;
  const requestStatus = activeRequest?.status || "";

  const isAcceptedOrTransit =
    !!assignedDriverId &&
    ["accepted", "picked_up", "in_transit"].includes(requestStatus);

  // Fetch driver data ONLY if request has been accepted and has an assigned driver_id
  const { data: driver, isLoading: loadingDriver } = useQuery<AssignedDriverData | null>({
    queryKey: ["assigned-driver-info", requestId, assignedDriverId],
    queryFn: async (): Promise<AssignedDriverData | null> => {
      if (!assignedDriverId || !requestId) return null;

      // 1. Direct query in drivers table matching either user_id or id
      const { data: directDriver, error: directErr } = await supabase
        .from("drivers")
        .select("id, user_id, full_name, phone, photo_url, driver_code, vehicle_plate, vehicle_type")
        .or(`user_id.eq.${assignedDriverId},id.eq.${assignedDriverId}`)
        .maybeSingle();

      if (!directErr && directDriver?.full_name) {
        return directDriver as AssignedDriverData;
      }

      // 2. Fallback to RPC get_assigned_driver_info
      try {
        const { data: rpcData, error: rpcErr } = await (supabase as unknown as {
          rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }).rpc("get_assigned_driver_info", { p_request_id: requestId });

        if (!rpcErr && rpcData) {
          const item = Array.isArray(rpcData) ? rpcData[0] : rpcData;
          if (item && typeof item === "object" && "full_name" in item) {
            return item as AssignedDriverData;
          }
        }
      } catch (e) {
        console.warn("[AssignedDriverCard] RPC fallback error", e);
      }

      // 3. Fallback to profiles table if driver record was incomplete
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .eq("id", assignedDriverId)
        .maybeSingle();

      if (profile?.full_name) {
        return {
          user_id: profile.id,
          full_name: profile.full_name,
          phone: profile.phone || "",
          photo_url: null,
          driver_code: `MOT-${profile.id.slice(0, 5).toUpperCase()}`,
          vehicle_plate: null,
          vehicle_type: null,
        };
      }

      return null;
    },
    enabled: isAcceptedOrTransit,
    staleTime: 1000 * 30,
    refetchOnWindowFocus: true,
  });

  if (!activeRequest) return null;

  const isPending = activeRequest.status === "pending" || !activeRequest.driver_id;

  // 1. STATE: PENDING (Aguardando motorista aceitar a entrega)
  // Per strict requirement: Only show the waiting state, NO driver details.
  if (isPending) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5 shadow-sm overflow-hidden" id="card-delivery-pending">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              Aguardando motorista aceitar a entrega
            </CardTitle>
            <Badge variant="outline" className="text-xs bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300">
              Chamada #{activeRequest.id.slice(0, 8)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="flex items-center gap-1.5 truncate">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              Buscando entregadores disponíveis nas proximidades...
            </p>
            {activeRequest.delivery_address && (
              <p className="truncate text-foreground/80">
                <span className="font-medium">Destino:</span> {activeRequest.delivery_address}
              </p>
            )}
          </div>

          {onCancelRequest && (
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs gap-1.5"
                onClick={() => onCancelRequest(activeRequest.id)}
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancelar solicitação
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // 2. STATE: ACCEPTED (Motorista aceitou a entrega)
  // Display photo, name, credential, plate, phone/WhatsApp, and call on WhatsApp button.
  if (isAcceptedOrTransit) {
    const waNumber = driver?.phone ? normalizeWhatsAppNumber(driver.phone) : "";
    const waMessage = encodeURIComponent(
      `Olá! Sou da loja referente à entrega #${activeRequest.id.slice(0, 8)}.`
    );
    const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${waMessage}` : "";
    const driverCode =
      driver?.driver_code ||
      (driver?.user_id || driver?.id
        ? `MOT-${(driver.driver_code || driver.id || driver.user_id).slice(0, 5).toUpperCase()}`
        : "MOT-001");
    const vehiclePlate = driver?.vehicle_plate || "Não informada";
    const statusText =
      activeRequest.status === "accepted"
        ? "Motorista aceitou a entrega"
        : activeRequest.status === "picked_up"
        ? "Pedido coletado • A caminho do cliente"
        : "Entrega em trânsito";

    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5 shadow-sm overflow-hidden" id="card-delivery-accepted">
        <CardHeader className="pb-3 pt-4 px-4 bg-emerald-500/10 border-b border-emerald-500/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              {statusText}
            </CardTitle>
            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
              Entrega #{activeRequest.id.slice(0, 8)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {loadingDriver && !driver ? (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span>Carregando dados do motorista...</span>
            </div>
          ) : driver ? (
            <div className="space-y-4">
              {/* Responsive Driver Profile Row */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Driver Photo with fallback */}
                <div className="relative shrink-0 mx-auto sm:mx-0">
                  <DriverPhoto
                    photoUrl={driver.photo_url}
                    driverId={driver.user_id || driver.id}
                    alt={driver.full_name || "Motorista"}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-emerald-500 shadow-md object-cover"
                  />
                  <span className="absolute bottom-0 right-0 p-1 bg-emerald-600 rounded-full text-white shadow">
                    <Truck className="w-3.5 h-3.5" />
                  </span>
                </div>

                {/* Driver Details */}
                <div className="flex-1 min-w-0 space-y-1.5 w-full">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Motorista que aceitou
                    </p>
                    <h3 className="text-lg font-bold text-foreground leading-tight truncate">
                      {driver.full_name || "Motorista"}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm">
                    {/* Credencial */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <IdCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-muted-foreground">Credencial:</span>
                      <span className="font-mono font-semibold text-foreground truncate">
                        {driverCode}
                      </span>
                    </div>

                    {/* Placa */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Car className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-muted-foreground">Placa:</span>
                      <span className="font-mono font-semibold text-foreground uppercase truncate">
                        {vehiclePlate}
                      </span>
                    </div>

                    {/* Telefone / WhatsApp */}
                    <div className="flex items-center gap-1.5 min-w-0 sm:col-span-2">
                      <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-muted-foreground">WhatsApp:</span>
                      <span className="font-medium text-foreground truncate">
                        {driver.phone ? formatPhoneNumber(driver.phone) : "Não informado"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-500/20">
                {/* Chamar no WhatsApp Button */}
                {waUrl ? (
                  <Button
                    asChild
                    size="default"
                    className="flex-1 sm:flex-initial bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold shadow-sm gap-2 h-10 px-4"
                  >
                    <a href={waUrl} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="w-4 h-4 fill-white" />
                      Chamar no WhatsApp
                    </a>
                  </Button>
                ) : (
                  <Button size="default" disabled variant="outline" className="gap-2">
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp indisponível
                  </Button>
                )}

                {/* Direct Telephone Call Button */}
                {driver.phone && (
                  <Button
                    asChild
                    variant="outline"
                    size="default"
                    className="flex-1 sm:flex-initial gap-2 h-10 px-3 border-emerald-500/30 hover:bg-emerald-500/10 text-foreground"
                  >
                    <a href={`tel:${driver.phone.replace(/\D/g, "")}`}>
                      <Phone className="w-4 h-4 text-emerald-600" />
                      Ligar
                    </a>
                  </Button>
                )}

                {/* Cancel option if still in 'accepted' state and needed */}
                {activeRequest.status === "accepted" && onCancelRequest && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto h-9"
                    onClick={() => onCancelRequest(activeRequest.id)}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Cancelar corrida
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-2">
              <p>Motorista vinculado à corrida, carregando detalhes...</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
};

export default AssignedDriverCard;
