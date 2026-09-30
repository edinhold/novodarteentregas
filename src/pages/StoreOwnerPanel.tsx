import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, createFreshChannel } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Truck, UtensilsCrossed, CreditCard, Store, Map as MapIcon, Star, RefreshCw, Route, MessageSquare, Settings, XCircle, Loader2, Phone, MessageCircle, Car } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DriverPhoto } from "@/components/DriverPhoto";
import { normalizeWhatsAppNumber, formatPhoneNumber } from "@/lib/phoneUtils";
import ThemeToggle from "@/components/ThemeToggle";
import CallDriverTab from "@/components/store/CallDriverTab";
import MenuTab from "@/components/store/MenuTab";
import CreditsTab from "@/components/store/CreditsTab";
import StoreInfoTab from "@/components/store/StoreInfoTab";
import FavoritesTab from "@/components/store/FavoritesTab";
import RadarTab from "@/components/store/RadarTab";
import AppSidebar from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import AdminSupportPanel from "@/components/AdminSupportPanel";
import AssignedDriverCard, { ActiveDeliveryRequest } from "@/components/store/AssignedDriverCard";
import logoDuarte from "@/assets/logo-duarte.jpeg";
import { executeStoreDeliveryCancellation } from "@/lib/cancelStoreDelivery";

const StoreOwnerPanel = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("map");
  const isMobile = useIsMobile();

  const impersonatedUserId = typeof window !== "undefined" ? sessionStorage.getItem("admin_impersonated_user_id") : null;
  const impersonatedStoreName = typeof window !== "undefined" ? sessionStorage.getItem("admin_impersonated_store_name") : null;
  const activeUserId = impersonatedUserId || user?.id;

  useEffect(() => {
    if (loading) return;
    if (!user && !impersonatedUserId) navigate("/auth", { replace: true });
  }, [loading, user, impersonatedUserId, navigate]);

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return null;
      const { data, error } = await supabase.from("restaurants").select("*").eq("owner_id", activeUserId).limit(1).maybeSingle();
      if (error) return null;
      if (data && activeUserId && !impersonatedUserId) {
        supabase.from("user_roles").upsert({ user_id: activeUserId, role: "store_owner" as any }, { onConflict: "user_id,role" }).then(() => {}, () => {});
      }
      return data;
    },
    enabled: !!activeUserId,
  });

  const { data: credits } = useQuery({
    queryKey: ["my-credits", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return null;
      const { data, error } = await supabase.from("store_credits").select("*").eq("user_id", activeUserId).limit(1).maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!activeUserId,
  });

  const { data: requests = [] } = useQuery<ActiveDeliveryRequest[]>({
    queryKey: ["my-delivery-requests", activeUserId, restaurant?.id],
    queryFn: async () => {
      if (!activeUserId) return [];
      let query = supabase
        .from("delivery_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (restaurant?.id) {
        query = query.or(`store_owner_id.eq.${activeUserId},restaurant_id.eq.${restaurant.id}`);
      } else {
        query = query.eq("store_owner_id", activeUserId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return ((data || []) as ActiveDeliveryRequest[]).filter((r) => !(r as any).hidden_by_store);
    },
    enabled: !!activeUserId,
  });

  const activeRequest = requests.find((r) =>
    !["delivered", "cancelled"].includes(r.status)
  ) || null;

  const { data: chatMessages = [] } = useQuery({
    queryKey: ["chat-messages", activeRequest?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("delivery_request_id", activeRequest!.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!activeRequest,
  });

  // Modal de Justificativa de Cancelamento no Painel Principal da Loja
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingReqId, setCancellingReqId] = useState<string | null>(null);
  const [cancellingDriverName, setCancellingDriverName] = useState<string | null>(null);
  const [cancellingDriverDetails, setCancellingDriverDetails] = useState<any | null>(null);
  const [selectedReasonOption, setSelectedReasonOption] = useState<string>("Cancelado pelo cliente final");
  const [customReasonText, setCustomReasonText] = useState("");
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const CANCEL_REASON_OPTIONS = [
    "Cancelado pelo cliente final",
    "Atraso no preparo da cozinha",
    "Endereço de entrega incorreto informado",
    "Pedido saiu por entregador próprio da loja",
    "Outro motivo",
  ];

  const handleOpenCancelModal = async (
    requestId: string,
    driverName?: string | null,
    isAccepted = false,
    driverDetails?: any | null
  ) => {
    setCancellingReqId(requestId);
    setCancellingDriverName(driverName || null);
    setSelectedReasonOption("Cancelado pelo cliente final");
    setCustomReasonText("");

    if (driverDetails) {
      setCancellingDriverDetails(driverDetails);
    } else {
      try {
        const { data: rpcData } = await supabase.rpc("get_delivery_driver_info", { p_request_id: requestId });
        const rows = rpcData as any;
        if (rows && rows[0]) {
          setCancellingDriverDetails(rows[0]);
          if (!driverName && rows[0].full_name) setCancellingDriverName(rows[0].full_name);
        } else {
          setCancellingDriverDetails(null);
        }
      } catch (err) {
        console.warn("[StoreOwnerPanel] Error fetching driver details for modal:", err);
        setCancellingDriverDetails(null);
      }
    }

    setCancelModalOpen(true);
  };

  const handleConfirmCancellationWithReason = async () => {
    if (!cancellingReqId) return;

    let finalReason = selectedReasonOption;
    if (selectedReasonOption === "Outro motivo") {
      if (!customReasonText.trim()) {
        toast.error("Por favor, digite a justificativa do cancelamento.");
        return;
      }
      finalReason = customReasonText.trim();
    }

    try {
      setSubmittingCancel(true);
      await executeStoreDeliveryCancellation(cancellingReqId, queryClient, activeUserId, finalReason);
      setCancelModalOpen(false);
      setCancellingReqId(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar corrida");
    } finally {
      setSubmittingCancel(false);
    }
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!activeUserId) return;
    const channel = createFreshChannel(`store-owner-realtime-${activeUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_requests" },
        (payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          queryClient.invalidateQueries({ queryKey: ["my-delivery-requests"] });
          queryClient.invalidateQueries({ queryKey: ["my-delivery-groups"] });
          queryClient.invalidateQueries({ queryKey: ["assigned-driver-info"] });

          if (payload.eventType === "UPDATE") {
            const newStatus = payload.new?.status as string | undefined;
            const oldStatus = payload.old?.status as string | undefined;

            if (newStatus === "accepted" && oldStatus === "pending") {
              toast.success("🎉 Um entregador aceitou sua entrega!", { duration: 8000 });
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("Entrega Aceita!", { body: "Um entregador aceitou seu pedido de entrega.", icon: "/favicon.ico" });
              }
            }
            if (newStatus === "picked_up") toast.info("📦 Entregador coletou o pedido!");
            if (newStatus === "delivered") toast.success("✅ Entrega concluída!");
          }
        }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload: { new?: { sender_id?: string; message?: string } }) => {
        if (activeRequest) {
          queryClient.invalidateQueries({ queryKey: ["chat-messages", activeRequest.id] });
          if (payload.new?.sender_id !== activeUserId) {
            toast("💬 Nova mensagem do entregador");
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("Nova mensagem", { body: payload.new?.message || "Mensagem recebida", icon: "/favicon.ico" });
            }
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeUserId, activeRequest, queryClient]);

  if (loading || (!user && !impersonatedUserId)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Verificando login...</p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden flex-col">
        {impersonatedUserId && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-amber-700 dark:text-amber-300 flex items-center justify-between text-xs sm:text-sm font-medium z-50">
            <div className="flex items-center gap-2">
              <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Admin</span>
              <span>Acessando painel de: <strong>{impersonatedStoreName || "Lojista"}</strong></span>
            </div>
            <button
              className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-800 dark:text-amber-200 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              onClick={() => {
                sessionStorage.removeItem("admin_impersonated_user_id");
                sessionStorage.removeItem("admin_impersonated_store_name");
                navigate("/admin");
              }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao Painel Admin
            </button>
          </div>
        )}
        <div className="flex flex-1 w-full overflow-hidden">
          <AppSidebar role="store" currentTab={activeTab} onTabChange={setActiveTab} />
          
          <SidebarInset className="flex-1 overflow-y-auto">
            <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
              <SidebarTrigger />
              <button onClick={() => navigate("/")} className="hover:bg-muted p-1 rounded-full transition-colors ml-1">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <img 
                src={restaurant?.logo || logoDuarte} 
                alt={restaurant?.name || "Duarte Delivery"} 
                className="h-8 w-8 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                onClick={() => navigate("/")} 
              />
              <h1 className="font-bold text-lg flex-1 truncate">
                {restaurant?.name ? `Painel - ${restaurant.name}` : "Painel do Lojista"}
              </h1>
              <ThemeToggle />
            </header>

            <main className="p-4 max-w-4xl mx-auto w-full space-y-4">
              {activeRequest && (
                <AssignedDriverCard
                  activeRequest={activeRequest}
                  onCancelRequest={(reqId, dName, isAcc, dDetails) => handleOpenCancelModal(reqId, dName, isAcc, dDetails)}
                />
              )}

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                {isMobile && (
                  <TabsList className="flex w-full overflow-x-auto p-1 rounded-xl mb-4 scrollbar-none gap-1 justify-start bg-muted/50">
                    <TabsTrigger value="map" className="rounded-lg shrink-0 gap-1 px-3"><MapIcon className="w-4 h-4" /><span className="text-xs">Mapa</span></TabsTrigger>
                    <TabsTrigger value="driver" className="rounded-lg shrink-0 gap-1 px-3"><Truck className="w-4 h-4" /><span className="text-xs">Entregador</span></TabsTrigger>
                    <TabsTrigger value="menu" className="rounded-lg shrink-0 gap-1 px-3"><UtensilsCrossed className="w-4 h-4" /><span className="text-xs">Cardápio</span></TabsTrigger>
                    <TabsTrigger value="favorites" className="rounded-lg shrink-0 gap-1 px-3"><Star className="w-4 h-4" /><span className="text-xs">Favoritos</span></TabsTrigger>
                    <TabsTrigger value="credits" className="rounded-lg shrink-0 gap-1 px-3"><CreditCard className="w-4 h-4" /><span className="text-xs">Recarga</span></TabsTrigger>
                    <TabsTrigger value="support" className="rounded-lg shrink-0 gap-1 px-3"><MessageSquare className="w-4 h-4" /><span className="text-xs">Suporte</span></TabsTrigger>
                    <TabsTrigger value="settings" className="rounded-lg shrink-0 gap-1 px-3"><Settings className="w-4 h-4" /><span className="text-xs">Ajustes</span></TabsTrigger>
                  </TabsList>
                )}

                <motion.div 
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="mt-0"
                >
                  <TabsContent value="map" className="mt-0 outline-none">
                    <RadarTab restaurant={restaurant} userId={activeUserId!} />
                  </TabsContent>

                  <TabsContent value="driver" className="mt-0 outline-none">
                    <CallDriverTab
                      user={user}
                      restaurant={restaurant}
                      requests={requests}
                      activeRequest={activeRequest}
                      chatMessages={chatMessages}
                      credits={credits}
                      onNavigateTab={setActiveTab}
                    />
                  </TabsContent>

                  <TabsContent value="menu" className="mt-0 outline-none">
                    <MenuTab restaurant={restaurant} />
                  </TabsContent>

                  <TabsContent value="favorites" className="mt-0 outline-none">
                    <FavoritesTab restaurant={restaurant} userId={activeUserId!} />
                  </TabsContent>

                  <TabsContent value="credits" className="mt-0 outline-none">
                    <CreditsTab credits={credits} />
                  </TabsContent>

                  <TabsContent value="support" className="mt-0 outline-none">
                    <AdminSupportPanel currentUserId={activeUserId!} role="store_owner" />
                  </TabsContent>

                  <TabsContent value="settings" className="mt-0 outline-none">
                    <StoreInfoTab restaurant={restaurant} userId={activeUserId!} />
                  </TabsContent>
                </motion.div>
              </Tabs>
            </main>
          </SidebarInset>
        </div>
      </div>

      {/* Modal de Confirmação e Justificativa de Cancelamento no Painel da Loja */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive font-bold text-base sm:text-lg">
              <XCircle className="w-5 h-5 shrink-0" />
              Cancelar Corrida / Entrega
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {cancellingDriverName ? (
                <span>Motorista aceito: <strong>{cancellingDriverName}</strong>. Selecione o motivo do cancelamento.</span>
              ) : (
                <span>Informe o motivo para cancelar esta entrega e estornar o valor descontado.</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Card de Credenciais do Motorista no Modal de Cancelamento */}
            {(cancellingDriverDetails || cancellingDriverName) && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-emerald-500/20">
                  <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-emerald-600" />
                    Motorista Vinculado à Corrida
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 font-bold">
                    {cancellingDriverDetails?.vehicle_type || "Motorista"}
                  </Badge>
                </div>

                <div className="flex items-center gap-3">
                  <DriverPhoto
                    photoUrl={cancellingDriverDetails?.photo_url}
                    driverId={cancellingDriverDetails?.user_id || cancellingDriverDetails?.id}
                    alt={cancellingDriverName || "Motorista"}
                    className="w-14 h-14 rounded-full border-2 border-emerald-500 shadow-sm object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="font-black text-sm text-foreground truncate">
                      {cancellingDriverName || cancellingDriverDetails?.full_name || "Motorista"}
                    </h4>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-mono font-bold text-[11px] bg-amber-500/15 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                        <Car className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Placa: {cancellingDriverDetails?.vehicle_plate || "Não informada"}</span>
                      </span>

                      {cancellingDriverDetails?.phone && (
                        <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{formatPhoneNumber(cancellingDriverDetails.phone)}</span>
                        </span>
                      )}
                    </div>

                    {cancellingDriverDetails?.driver_code && (
                      <p className="text-[10px] text-muted-foreground font-medium">
                        Credencial: <span className="font-mono font-bold text-foreground">{cancellingDriverDetails.driver_code}</span>
                      </p>
                    )}
                  </div>
                </div>

                {cancellingDriverDetails?.phone && (
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href={`https://wa.me/${normalizeWhatsAppNumber(cancellingDriverDetails.phone)}?text=${encodeURIComponent(`Olá ${cancellingDriverName || ""}, sou da loja referente à corrida #${cancellingReqId?.slice(0, 8)}.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-lg shadow-xs transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5 fill-white" />
                      <span>WhatsApp</span>
                    </a>
                    <a
                      href={`tel:${cancellingDriverDetails.phone.replace(/\D/g, "")}`}
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold bg-background hover:bg-muted border border-border rounded-lg transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ligar</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Motivo do Cancelamento *</Label>
              <div className="space-y-1.5">
                {CANCEL_REASON_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg border transition-all flex items-center justify-between font-medium ${
                      selectedReasonOption === opt
                        ? "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300 font-bold shadow-xs"
                        : "border-border/60 hover:bg-muted/60 text-foreground"
                    }`}
                    onClick={() => setSelectedReasonOption(opt)}
                  >
                    <span>{opt}</span>
                    {selectedReasonOption === opt && <span className="text-red-600 font-bold">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {selectedReasonOption === "Outro motivo" && (
              <div className="space-y-1.5 animate-in fade-in duration-200">
                <Label className="text-xs font-semibold">Descreva o motivo *</Label>
                <Textarea
                  value={customReasonText}
                  onChange={(e) => setCustomReasonText(e.target.value)}
                  placeholder="Escreva a justificativa aqui..."
                  rows={3}
                  className="text-xs bg-background"
                />
              </div>
            )}

            <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-lg text-[11px] text-amber-800 dark:text-amber-300">
              💡 <strong>Estorno na Carteira:</strong> O saldo descontado nesta entrega será reembolsado à carteira da sua loja.
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCancelModalOpen(false)}
              disabled={submittingCancel}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              className="bg-red-600 hover:bg-red-700 font-bold gap-1.5"
              onClick={handleConfirmCancellationWithReason}
              disabled={submittingCancel}
            >
              {submittingCancel ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cancelando...</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  <span>Confirmar Cancelamento</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default StoreOwnerPanel;
