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

const StoreOwnerPanel = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("store");
  const isMobile = useIsMobile();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").eq("owner_id", user!.id).limit(1).single();
      if (error) return null;
      return data;
    },
    enabled: !!user,
  });

  const { data: credits } = useQuery({
    queryKey: ["my-credits", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("store_credits").select("*").eq("user_id", user!.id).limit(1).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["my-delivery-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_requests").select("*").eq("store_owner_id", user!.id).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const activeRequest = requests.find((r: any) => ["accepted", "picked_up"].includes(r.status));

  const { data: chatMessages = [] } = useQuery({
    queryKey: ["chat-messages", activeRequest?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_messages").select("*").eq("delivery_request_id", activeRequest!.id).order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!activeRequest,
  });

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("store-owner-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_requests", filter: `store_owner_id=eq.${user.id}` }, (payload: any) => {
        queryClient.invalidateQueries({ queryKey: ["my-delivery-requests", user.id] });
        if (payload.new?.status === "accepted" && payload.old?.status === "pending") {
          toast.success("🎉 Um entregador aceitou sua entrega!", { duration: 8000 });
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Entrega Aceita!", { body: "Um entregador aceitou seu pedido de entrega.", icon: "/favicon.ico" });
          }
        }
        if (payload.new?.status === "picked_up") toast.info("📦 Entregador coletou o pedido!");
        if (payload.new?.status === "delivered") toast.success("✅ Entrega concluída!");
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload: any) => {
        if (activeRequest) {
          queryClient.invalidateQueries({ queryKey: ["chat-messages", activeRequest.id] });
          if (payload.new?.sender_id !== user.id) {
            toast("💬 Nova mensagem do entregador");
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("Nova mensagem", { body: payload.new?.message || "Mensagem recebida", icon: "/favicon.ico" });
            }
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeRequest?.id]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Verificando login...</p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden">
        <AppSidebar role="store" currentTab={activeTab} onTabChange={setActiveTab} />
        
        <SidebarInset className="flex-1 overflow-y-auto">
          <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
            <SidebarTrigger />
            <button onClick={() => navigate("/")} className="hover:bg-muted p-1 rounded-full transition-colors ml-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-bold text-lg flex-1 truncate">Painel do Lojista</h1>
            <ThemeToggle />
          </header>

          <main className="p-4 max-w-4xl mx-auto w-full">
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
                  <StoreInfoTab restaurant={restaurant} userId={user.id} />
                </TabsContent>

                <TabsContent value="menu" className="mt-0 outline-none">
                  <MenuTab restaurant={restaurant} />
                </TabsContent>

                <TabsContent value="driver" className="mt-0 outline-none">
                  <CallDriverTab user={user} restaurant={restaurant} requests={requests} activeRequest={activeRequest} chatMessages={chatMessages} />
                </TabsContent>

                <TabsContent value="multi" className="mt-0 outline-none">
                  <MultiDeliveryOrder restaurant={restaurant} userId={user.id} />
                </TabsContent>

                <TabsContent value="reassign" className="mt-0 outline-none">
                  <ReassignDriverTab restaurant={restaurant} userId={user.id} />
                </TabsContent>

                <TabsContent value="favorites" className="mt-0 outline-none">
                  <FavoritesTab restaurant={restaurant} />
                </TabsContent>

                <TabsContent value="map" className="mt-0 outline-none">
                  <RadarTab restaurant={restaurant} userId={user.id} />
                </TabsContent>

                <TabsContent value="credits" className="mt-0 outline-none">
                  <CreditsTab credits={credits} />
                </TabsContent>

                <TabsContent value="support" className="mt-0 outline-none">
                  <AdminSupportPanel currentUserId={user.id} role="store_owner" />
                </TabsContent>
              </motion.div>
            </Tabs>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default StoreOwnerPanel;
