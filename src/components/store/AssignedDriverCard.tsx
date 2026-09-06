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

interface DeliveryDriverRpcRow {
  driver_code: string;
  full_name: string;
  id: string;
  phone: string;
  photo_url: string;
  user_id: string;
  vehicle_plate: string;
  vehicle_type: string;
}

interface EdgeFunctionDriverResponse {
  success: boolean;
  driver?: {
    id: string;
    user_id: string;
    full_name: string;
    phone: string;
    photo_url: string | null;
    driver_code: string | null;
    vehicle_plate: string | null;
    vehicle_type: string | null;
  } | null;
  message?: string;
}

interface AssignedDriverCardProps {
  activeRequest: ActiveDeliveryRequest | null;
  onCancelRequest?: (requestId: string) => void;
}

export const AssignedDriverCard = ({ activeRequest, onCancelRequest }: AssignedDriverCardProps) => {
  const assignedDriverId = activeRequest?.driver_id || null;
  const requestId = activeRequest?.id || null;
  const requestStatus = activeRequest?.status || "";

  // Motorista vinculado apenas quando corrida aceita ou em andamento
  const isAcceptedOrTransit =
    !!assignedDriverId &&
    ["accepted", "picked_up", "in_transit", "delivering"].includes(requestStatus);

  // Busca dados reais do motorista vinculado exclusivamente se a entrega foi aceita
  const { data: driver, isLoading: loadingDriver } = useQuery<AssignedDriverData | null>({
    queryKey: ["assigned-driver-info", requestId, assignedDriverId],
    queryFn: async (): Promise<AssignedDriverData | null> => {
      if (!assignedDriverId || !requestId) return null;

      // 1. RPC oficial get_delivery_driver_info (SECURITY DEFINER no banco)
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "get_delivery_driver_info",
          { p_request_id: requestId }
        );

        if (!rpcErr && rpcData) {
          const rows = rpcData as unknown as DeliveryDriverRpcRow[];
          const item = Array.isArray(rows) ? rows[0] : (rows as unknown as DeliveryDriverRpcRow);
          if (item && item.full_name) {
            return {
              id: item.id,
              user_id: item.user_id,
              full_name: item.full_name,
              phone: item.phone || "",
              photo_url: item.photo_url || null,
              driver_code: item.driver_code || null,
              vehicle_plate: item.vehicle_plate || null,
              vehicle_type: item.vehicle_type || null,
            };
          }
        }
      } catch (err: unknown) {
        console.warn("[AssignedDriverCard] RPC get_delivery_driver_info fallback:", err);
      }

      // 2. Consulta direta na tabela drivers por user_id ou id
      try {
        const { data: directDriver, error: directErr } = await supabase
          .from("drivers")
          .select("id, user_id, full_name, phone, photo_url, driver_code, vehicle_plate, vehicle_type")
          .or(`user_id.eq.${assignedDriverId},id.eq.${assignedDriverId}`)
          .maybeSingle();

        if (!directErr && directDriver?.full_name) {
          return {
            id: directDriver.id,
            user_id: directDriver.user_id,
            full_name: directDriver.full_name,
            phone: directDriver.phone || "",
            photo_url: directDriver.photo_url || null,
            driver_code: directDriver.driver_code || null,
            vehicle_plate: directDriver.vehicle_plate || null,
            vehicle_type: directDriver.vehicle_type || null,
          };
        }
      } catch (err: unknown) {
        console.warn("[AssignedDriverCard] Direct drivers fallback:", err);
      }

      // 3. Fallback via Edge Function segura (get-assigned-driver)
      try {
        const { data: edgeData, error: edgeErr } = await supabase.functions.invoke<EdgeFunctionDriverResponse>(
          "get-assigned-driver",
          { body: { request_id: requestId, driver_id: assignedDriverId } }
        );

        if (!edgeErr && edgeData?.success && edgeData.driver?.full_name) {
          return edgeData.driver as AssignedDriverData;
        }
      } catch (err: unknown) {
        console.warn("[AssignedDriverCard] Edge function fallback:", err);
      }

      // 4. Fallback na tabela profiles
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, phone, avatar_url")
          .eq("id", assignedDriverId)
          .maybeSingle();

        if (profile?.full_name) {
          return {
            id: profile.id,
            user_id: profile.id,
            full_name: profile.full_name,
            phone: profile.phone || "",
            photo_url: profile.avatar_url || null,
            driver_code: `MOT-${profile.id.slice(0, 5).toUpperCase()}`,
            vehicle_plate: null,
            vehicle_type: "Moto",
          };
        }
      } catch (err: unknown) {
        console.warn("[AssignedDriverCard] Profiles fallback:", err);
      }

      return null;
    },
    enabled: isAcceptedOrTransit,
    staleTime: 1000 * 15,
    refetchOnWindowFocus: true,
  });

  if (!activeRequest) return null;

  const isPending = activeRequest.status === "pending" || !activeRequest.driver_id;

  // 1. ESTADO: AGUARDANDO MOTORISTA (Aguardando motorista aceitar a entrega)
  // Conforme requisito estrito: mostrar apenas o estado atual, NENHUM dado de motorista.
  if (isPending) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5 shadow-sm overflow-hidden" id="card-delivery-pending">
        <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold">
              <span className="relative flex h-3 w-3 shrink-0">
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
        <CardContent className="p-3 sm:p-4 pt-1 sm:pt-2 space-y-3">
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

  // 2. ESTADO: MOTORISTA ACEITOU (Motorista aceitou a entrega)
  // Exibir: Foto, Nome, Credencial, Placa, WhatsApp e Botão Chamar no WhatsApp.
  if (isAcceptedOrTransit) {
    const waNumber = driver?.phone ? normalizeWhatsAppNumber(driver.phone) : "";
    const waMessage = encodeURIComponent(
      `Olá! Sou da loja referente à entrega #${activeRequest.id.slice(0, 8)}.`
    );
    const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${waMessage}` : "";
    const driverCode =
      driver?.driver_code ||
      (driver?.id || driver?.user_id
        ? `MOT-${(driver.id || driver.user_id).slice(0, 5).toUpperCase()}`
        : "MOT-00125");
    const vehiclePlate = driver?.vehicle_plate || "Não informada";
    const statusHeading =
      activeRequest.status === "accepted"
        ? "Motorista aceitou a entrega"
        : activeRequest.status === "picked_up"
        ? "Pedido coletado • A caminho do cliente"
        : "Entrega em andamento";

    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5 shadow-sm overflow-hidden" id="card-delivery-accepted">
        <CardHeader className="pb-2.5 pt-3 px-3 sm:px-4 bg-emerald-500/10 border-b border-emerald-500/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              {statusHeading}
            </CardTitle>
            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
              Entrega #{activeRequest.id.slice(0, 8)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-4 space-y-4">
          {loadingDriver && !driver ? (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span>Carregando dados do motorista...</span>
            </div>
          ) : driver ? (
            <div className="space-y-4">
              {/* Título de Seção conforme especificação */}
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                Motorista que aceitou
              </p>

              {/* Layout Responsivo: PWA / APK / 375px safe */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4">
                {/* Foto com placeholder padrão */}
                <div className="relative shrink-0">
                  <DriverPhoto
                    photoUrl={driver.photo_url}
                    driverId={driver.user_id || driver.id}
                    alt={driver.full_name || "Motorista"}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-emerald-500 shadow object-cover"
                  />
                  <span className="absolute bottom-0 right-0 p-1 bg-emerald-600 rounded-full text-white shadow-sm">
                    <Truck className="w-3.5 h-3.5" />
                  </span>
                </div>

                {/* Dados do Motorista */}
                <div className="flex-1 min-w-0 w-full space-y-1.5 text-center sm:text-left">
                  {/* Nome */}
                  <div className="min-w-0">
                    <span className="text-xs text-muted-foreground">Nome: </span>
                    <span className="text-base font-bold text-foreground break-words">
                      {driver.full_name || "Motorista"}
                    </span>
                  </div>

                  {/* Credencial */}
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs sm:text-sm text-foreground">
                    <IdCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-muted-foreground">Credencial:</span>
                    <span className="font-mono font-semibold truncate">{driverCode}</span>
                  </div>

                  {/* Placa */}
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs sm:text-sm text-foreground">
                    <Car className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-muted-foreground">Placa:</span>
                    <span className="font-mono font-semibold uppercase truncate">{vehiclePlate}</span>
                  </div>

                  {/* WhatsApp / Telefone */}
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs sm:text-sm text-foreground">
                    <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-muted-foreground">WhatsApp:</span>
                    <span className="font-medium truncate">
                      {driver.phone ? formatPhoneNumber(driver.phone) : "Não informado"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-emerald-500/20">
                {/* Botão Chamar no WhatsApp */}
                {waUrl ? (
                  <Button
                    asChild
                    size="default"
                    className="w-full sm:w-auto bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold shadow-sm gap-2 h-10 px-4"
                    id="btn-chamar-whatsapp"
                  >
                    <a href={waUrl} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="w-4 h-4 fill-white shrink-0" />
                      <span>Chamar no WhatsApp</span>
                    </a>
                  </Button>
                ) : (
                  <Button size="default" disabled variant="outline" className="w-full sm:w-auto gap-2">
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>WhatsApp indisponível</span>
                  </Button>
                )}

                {/* Botão Ligar */}
                {driver.phone && (
                  <Button
                    asChild
                    variant="outline"
                    size="default"
                    className="w-full sm:w-auto gap-2 h-10 px-3 border-emerald-500/30 hover:bg-emerald-500/10 text-foreground"
                    id="btn-ligar-motorista"
                  >
                    <a href={`tel:${driver.phone.replace(/\D/g, "")}`}>
                      <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Ligar</span>
                    </a>
                  </Button>
                )}

                {/* Cancelar corrida (se status for accepted) */}
                {activeRequest.status === "accepted" && onCancelRequest && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full sm:w-auto text-xs text-destructive hover:bg-destructive/10 hover:text-destructive sm:ml-auto h-9"
                    onClick={() => onCancelRequest(activeRequest.id)}
                    id="btn-cancelar-corrida"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1 shrink-0" />
                    Cancelar corrida
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-2 text-center sm:text-left">
              <p>Motorista vinculado à corrida, aguardando carregamento dos dados...</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
};

export default AssignedDriverCard;
