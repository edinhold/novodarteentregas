import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Truck, UtensilsCrossed, CreditCard, Store, Map as MapIcon, Star, RefreshCw, Route, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MultiDeliveryOrder from "@/components/MultiDeliveryOrder";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ThemeToggle from "@/components/ThemeToggle";
import CallDriverTab from "@/components/store/CallDriverTab";
import MenuTab from "@/components/store/MenuTab";
import CreditsTab from "@/components/store/CreditsTab";
import StoreInfoTab from "@/components/store/StoreInfoTab";
import FavoritesTab from "@/components/store/FavoritesTab";
import ReassignDriverTab from "@/components/store/ReassignDriverTab";
import RadarTab from "@/components/store/RadarTab";
import AppSidebar from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import AdminSupportPanel from "@/components/AdminSupportPanel";
import AssignedDriverCard, { ActiveDeliveryRequest } from "@/components/store/AssignedDriverCard";
import logoDuarte from "@/assets/logo-duarte.jpeg";

const StoreOwnerPanel = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("store");
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
      const { data, error } = await supabase.from("restaurants").select("*").eq("owner_id", activeUserId).limit(1).single();
      if (error) return null;
      return data;
    },
    enabled: !!activeUserId,
  });

  const { data: credits } = useQuery({
    queryKey: ["my-credits", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return null;
      const { data } = await supabase.from("store_credits").select("*").eq("user_id", activeUserId).limit(1).single();
      return data;
    },
    enabled: !!activeUserId,
  });

  const { data: requests = [] } = useQuery<ActiveDeliveryRequest[]>({
    queryKey: ["my-delivery-requests", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return [];
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*")
        .eq("store_owner_id", activeUserId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as ActiveDeliveryRequest[];
    },
    enabled: !!activeUserId,
  });

  const activeRequest = requests.find((r) =>
    ["pending", "accepted", "picked_up", "in_transit", "delivering"].includes(r.status)
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

  const handleCancelActiveRequest = async (requestId: string) => {
    if (!confirm("Cancelar esta corrida? Os créditos descontados serão devolvidos à sua loja.")) return;
    try {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      }).rpc("cancel_delivery_request", { p_request_id: requestId });
      if (error) throw error;
      if (!data) throw new Error("Não foi possível cancelar a corrida");
      toast.success("Corrida cancelada. Créditos devolvidos!");
      queryClient.invalidateQueries({ queryKey: ["my-delivery-requests", activeUserId] });
      queryClient.invalidateQueries({ queryKey: ["my-credits", activeUserId] });
      queryClient.invalidateQueries({ queryKey: ["assigned-driver-info"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao cancelar corrida";
      toast.error(msg);
    }
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!activeUserId) return;
    const channel = supabase.channel(`store-owner-realtime-${activeUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_requests", filter: `store_owner_id=eq.${activeUserId}` },
        (payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          queryClient.invalidateQueries({ queryKey: ["my-delivery-requests", activeUserId] });
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
                src={logoDuarte} 
                alt="Duarte Delivery" 
                className="h-8 w-8 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                onClick={() => navigate("/")} 
              />
              <h1 className="font-bold text-lg flex-1 truncate">Painel do Lojista</h1>
              <ThemeToggle />
            </header>

            <main className="p-4 max-w-4xl mx-auto w-full space-y-4">
              {activeRequest && (
                <AssignedDriverCard
                  activeRequest={activeRequest}
                  onCancelRequest={handleCancelActiveRequest}
                />
              )}

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                {isMobile && (
                  <TabsList className="grid w-full grid-cols-9 bg-muted/50 p-1 rounded-xl mb-4">
                    <TabsTrigger value="store" className="rounded-lg"><Store className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="menu" className="rounded-lg"><UtensilsCrossed className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="driver" className="rounded-lg"><Truck className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="multi" className="rounded-lg"><Route className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="reassign" className="rounded-lg"><RefreshCw className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="favorites" className="rounded-lg"><Star className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="map" className="rounded-lg"><MapIcon className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="credits" className="rounded-lg"><CreditCard className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="support" className="rounded-lg"><MessageSquare className="w-4 h-4" /></TabsTrigger>
                  </TabsList>
                )}

                <motion.div 
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="mt-0"
                >
                  <TabsContent value="store" className="mt-0 outline-none">
                    <StoreInfoTab restaurant={restaurant} userId={activeUserId!} />
                  </TabsContent>

                  <TabsContent value="menu" className="mt-0 outline-none">
                    <MenuTab restaurant={restaurant} />
                  </TabsContent>

                  <TabsContent value="driver" className="mt-0 outline-none">
                    <CallDriverTab user={user} restaurant={restaurant} requests={requests} activeRequest={activeRequest} chatMessages={chatMessages} />
                  </TabsContent>

                  <TabsContent value="multi" className="mt-0 outline-none">
                    <MultiDeliveryOrder restaurant={restaurant} userId={activeUserId!} />
                  </TabsContent>

                  <TabsContent value="reassign" className="mt-0 outline-none">
                    <ReassignDriverTab restaurant={restaurant} userId={activeUserId!} />
                  </TabsContent>

                  <TabsContent value="favorites" className="mt-0 outline-none">
                    <FavoritesTab restaurant={restaurant} />
                  </TabsContent>

                  <TabsContent value="map" className="mt-0 outline-none">
                    <RadarTab restaurant={restaurant} userId={activeUserId!} />
                  </TabsContent>

                  <TabsContent value="credits" className="mt-0 outline-none">
                    <CreditsTab credits={credits} />
                  </TabsContent>

                  <TabsContent value="support" className="mt-0 outline-none">
                    <AdminSupportPanel currentUserId={activeUserId!} role="store_owner" />
                  </TabsContent>
                </motion.div>
              </Tabs>
            </main>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default StoreOwnerPanel;
