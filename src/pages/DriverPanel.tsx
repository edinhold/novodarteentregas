import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Phone, MessageSquare, Send, Check, DollarSign, Key, Wallet, XCircle, Home, History, Settings, Map as MapIcon, Signal, SignalZero, Calendar, Radar, PanelLeft } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { isToday, isThisWeek, isThisMonth } from "date-fns";
import { playNotificationSound, playUrgentNotification, playStandbyAlert, startStandbyMode, stopStandbyMode, resumeAudioContext, setNotificationVolume, setStandbyInterval, setStandbyGate } from "@/lib/notificationSound";
import DriverGPS from "@/components/driver/DriverGPS";
import { useGPSTracking } from "@/hooks/useGPSTracking";
import DriverNotificationSettings from "@/components/driver/DriverNotificationSettings";
import PushStatusCard from "@/components/driver/PushStatusCard";
import { cancelDeliveryNotification } from "@/lib/push";

import ChatWidget from "@/components/ChatWidget";
import AdminSupportPanel from "@/components/AdminSupportPanel";
import ThemeToggle from "@/components/ThemeToggle";
import GlobalDriverMap from "@/components/GlobalDriverMap";
import AppSidebar from "@/components/AppSidebar";
import DeliveryNotifications from "@/components/driver/DeliveryNotifications";
import DriverGroupedDeliveries from "@/components/driver/DriverGroupedDeliveries";

import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DRIVER_NOTIFICATION_SETTINGS_EVENT,
  DriverNotificationSettingsState,
  loadDriverNotificationSettings,
} from "@/lib/driverNotificationSettings";

const DriverPanel = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [chatMessage, setChatMessage] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [savingPix, setSavingPix] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const isMobile = useIsMobile();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [notificationSettings, setNotificationSettings] = useState<DriverNotificationSettingsState>(loadDriverNotificationSettings);
  const hadPendingStandbyRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); toast.success("Internet restabelecida"); };
    const handleOffline = () => { setIsOnline(false); toast.error("Você está offline"); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Get driver profile
  const { data: driverProfile } = useQuery({
    queryKey: ["my-driver-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").eq("user_id", user!.id).limit(1).single();
      if (error) return null;
      return data;
    },
    enabled: !!user,
  });

  // Single instance of GPS tracking for the whole panel
  const trackingData = useGPSTracking({ 
    userId: user?.id,
    driverId: driverProfile?.id
  });

  // Load PIX info from profile
  useEffect(() => {
    if (driverProfile) {
      setPixKey((driverProfile as any).pix_key || "");
      setPixKeyType((driverProfile as any).pix_key_type || "cpf");
    }
  }, [driverProfile]);

  // Get pending delivery requests
  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["driver-pending-requests", user?.id],
    queryFn: async () => {
      // Fetch requests that are pending AND (not directed to anyone OR directed to me)
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name, address, logo, latitude, longitude)")
        .eq("status", "pending")
        .is("group_id", null)
        .or(`driver_id.is.null,driver_id.eq.${user!.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Track locally-rejected request ids (so this driver stops seeing them)
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);

  // Periodically release stale directed requests (>30s without acceptance)
  // so they become visible to all eligible drivers.
  useEffect(() => {
    if (!user) return;
    const tick = async () => {
      try {
        await (supabase as any).rpc("release_stale_directed_requests");
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
      } catch {}
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [user, queryClient]);

  // Get my accepted requests
  const { data: myRequests = [] } = useQuery({
    queryKey: ["driver-my-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name, address, logo, latitude, longitude)")
        .eq("driver_id", user!.id)
        .is("group_id", null)
        .in("status", ["accepted", "picked_up"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Get my completed (delivered) requests
  const { data: completedRequests = [] } = useQuery({
    queryKey: ["driver-completed-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name, address, logo, latitude, longitude)")
        .eq("driver_id", user!.id)
        .eq("status", "delivered")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const activeRequest = myRequests[0];

  // Chat messages
  const { data: chatMessages = [] } = useQuery({
    queryKey: ["driver-chat", activeRequest?.id],
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

  // Store owner profile for phone
  const { data: storeOwnerProfile } = useQuery({
    queryKey: ["store-owner-profile", activeRequest?.store_owner_id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("phone, full_name").eq("user_id", activeRequest!.store_owner_id).single();
      return data;
    },
    enabled: !!activeRequest,
  });

  // Get earnings
  const { data: earnings = [] } = useQuery({
    queryKey: ["my-earnings", driverProfile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_earnings")
        .select("*")
        .eq("driver_id", driverProfile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!driverProfile,
  });

  // Get withdrawal requests
  const { data: withdrawals = [] } = useQuery({
    queryKey: ["my-withdrawals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("driver_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Get delivery config
  const { data: deliveryConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_public_delivery_config");
      return Array.isArray(data) ? data[0] : data;
    },
  });

  // Request local notification permission (no push provider configured).
  useEffect(() => {
    if (!user?.id) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [user?.id]);

  // Keep standby settings active for the whole driver panel (including mobile),
  // even when the settings tab is not mounted/open.
  useEffect(() => {
    const applySettings = (settings: DriverNotificationSettingsState) => {
      setNotificationVolume(settings.volume);
      setStandbyInterval(settings.standbyIntervalMs);
      if (settings.standbyEnabled) {
        startStandbyMode(settings.standbyIntervalMs);
      } else {
        stopStandbyMode();
      }
    };

    applySettings(notificationSettings);

    const handleSettingsUpdate = (event: Event) => {
      const next = (event as CustomEvent<DriverNotificationSettingsState>).detail ?? loadDriverNotificationSettings();
      setNotificationSettings(next);
      applySettings(next);
    };

    const handleStorage = () => handleSettingsUpdate(new CustomEvent(DRIVER_NOTIFICATION_SETTINGS_EVENT, {
      detail: loadDriverNotificationSettings(),
    }));

    window.addEventListener(DRIVER_NOTIFICATION_SETTINGS_EVENT, handleSettingsUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(DRIVER_NOTIFICATION_SETTINGS_EVENT, handleSettingsUpdate);
      window.removeEventListener("storage", handleStorage);
      stopStandbyMode();
    };
  }, [notificationSettings]);

  // Standby gate: beep only when there are deliveries available and the driver
  // is not already doing one.
  const hasAvailableStandbyRequest = pendingRequests.some((request: any) => !rejectedIds.includes(request.id));
  const shouldStandbyAlert = isOnline && !activeRequest && hasAvailableStandbyRequest;

  useEffect(() => {
    setStandbyGate(() => shouldStandbyAlert);
    return () => { setStandbyGate(null); };
  }, [shouldStandbyAlert]);

  // On phones the app may not keep waiting timers reliable in the background,
  // so also play the standby alert immediately when pending deliveries appear.
  useEffect(() => {
    if (notificationSettings.standbyEnabled && shouldStandbyAlert && !hadPendingStandbyRef.current) {
      resumeAudioContext();
      playStandbyAlert();
    }
    hadPendingStandbyRef.current = shouldStandbyAlert;
  }, [notificationSettings.standbyEnabled, shouldStandbyAlert]);


  // Realtime
  useEffect(() => {
    if (!user) return;
    
    // Unlock audio context on first user interaction in the panel
    const handleFirstInteraction = () => {
      resumeAudioContext();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    // Silent sync push ("entrega_indisponivel") — refresh the available list.
    const handleUnavailable = () => {
      stopStandbyMode();
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
    };
    window.addEventListener("delivery-unavailable", handleUnavailable);


    const channel = supabase.channel("driver-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_requests" }, (payload) => {
        console.log("New delivery request received:", payload);
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        
        // Use a timeout to ensure audio is ready and played clearly
        setTimeout(() => {
          playUrgentNotification();
          toast("🚀 Nova entrega disponível!", { 
            duration: 10000,
            action: {
              label: "Ver",
              onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' })
            }
          });
        }, 500);

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Nova Entrega!", { 
            body: "Uma nova solicitação de entrega está disponível.", 
            icon: "/favicon.ico"
          });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_requests" }, (payload: any) => {
        console.log("Delivery request updated:", payload);
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        queryClient.invalidateQueries({ queryKey: ["driver-my-requests", user.id] });
        queryClient.invalidateQueries({ queryKey: ["driver-completed-requests", user.id] });
        queryClient.invalidateQueries({ queryKey: ["my-earnings", driverProfile?.id] });
        
        // If status changed to accepted and I am the driver, or if it was accepted by someone else
        if (payload.new?.status === "accepted") {
          if (payload.new?.driver_id === user.id) {
            playNotificationSound();
            toast.success("✅ Pedido confirmado para você!");
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_earnings" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-earnings", driverProfile?.id] });
        playNotificationSound();
        toast.success("💰 Novo ganho registrado!");
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload: any) => {
        if (activeRequest) {
          queryClient.invalidateQueries({ queryKey: ["driver-chat", activeRequest.id] });
          if (payload.new?.sender_id !== user.id) {
            playNotificationSound();
            toast("💬 Nova mensagem do lojista");
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("Nova mensagem", { body: payload.new?.message || "Mensagem recebida", icon: "/favicon.ico" });
            }
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log("Realtime subscribed successfully");
        }
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.error("Realtime connection issues:", status);
          // Don't reload, Supabase will try to reconnect automatically
          // Just show a subtle warning if it stays closed for too long
        }
      });

    return () => { 
      supabase.removeChannel(channel); 
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener("delivery-unavailable", handleUnavailable);

    };
  }, [user, activeRequest?.id, driverProfile?.id]);
  
  // Keep driver active+online status synced while panel is open
  useEffect(() => {
    if (!user?.id) return;

    const setOnline = async (online: boolean) => {
      await supabase
        .from("drivers")
        .update({
          is_active: true,
          is_online: online,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    };

    setOnline(true);
    const interval = setInterval(() => setOnline(true), 30000); // Heartbeat 30s

    const handleVisibility = () => setOnline(true);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      // Do not mark offline on background/route unload: mobile browsers and
      // WebViews pause/unmount pages aggressively, but the driver must remain
      // eligible for push while recently active. The backend already filters by
      // last_seen_at, so stale sessions naturally expire.
    };
  }, [user?.id]);

  const acceptRequest = async (requestId: string) => {
    try {
      console.log("[Delivery] Motorista tentando aceitar", requestId);
      const { data, error } = await (supabase as any).rpc("accept_delivery_request", {
        p_request_id: requestId,
      });
      if (error) throw error;
      const fee = Number((data as any)?.driver_fee || 0);
      console.log("[Delivery] Motorista aceitou", requestId, data);
      toast.success(fee > 0 ? `Entrega aceita com sucesso! Você ganhará R$ ${fee.toFixed(2)}` : "Entrega aceita com sucesso!");
      void cancelDeliveryNotification(requestId);
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] });
    } catch (err: any) {
      const raw = err?.message || "Erro ao aceitar";
      const conflict = /já foi assumida|já foi aceita|direcionada/i.test(raw);
      toast.error(conflict ? "Esta entrega já foi aceita por outro motorista." : raw);
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
    }
  };


  const updateStatus = async (requestId: string, status: string) => {
    try {
      if (status === "delivered") {
        // Use secure RPC that validates ownership and inserts earnings atomically
        const { error } = await (supabase as any).rpc("complete_delivery", {
          p_request_id: requestId,
        });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["my-earnings", driverProfile?.id] });
      } else {
        const { error } = await supabase.from("delivery_requests").update({ status }).eq("id", requestId);
        if (error) throw error;
      }

      toast.success("Status atualizado!");
      queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Erro");
    }
  };

  const savePixKey = async () => {
    if (!driverProfile || !pixKey.trim()) return;
    setSavingPix(true);
    try {
      const { error } = await supabase.from("drivers").update({
        pix_key: pixKey.trim(),
        pix_key_type: pixKeyType,
      } as any).eq("id", driverProfile.id);
      if (error) throw error;
      toast.success("Chave PIX salva!");
      queryClient.invalidateQueries({ queryKey: ["my-driver-profile"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSavingPix(false);
    }
  };

  const requestWithdrawal = async () => {
    const totalPending = earnings
      .filter((e: any) => e.status === "pending")
      .reduce((sum: number, e: any) => sum + Number(e.amount), 0);

    if (totalPending <= 0) {
      toast.error("Sem saldo disponível para saque");
      return;
    }

    if (!pixKey.trim()) {
      toast.error("Cadastre sua chave PIX primeiro");
      return;
    }

    setWithdrawing(true);
    try {
      const { error } = await (supabase as any).rpc("request_withdrawal");
      if (error) throw error;
      toast.success(`Saque solicitado com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["my-earnings"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao solicitar saque");
    } finally {
      setWithdrawing(false);
    }
  };


  const sendMessage = async () => {
    if (!chatMessage.trim() || !activeRequest) return;
    try {
      const { error } = await supabase.from("chat_messages").insert({
        delivery_request_id: activeRequest.id,
        sender_id: user!.id,
        message: chatMessage.trim(),
      });
      if (error) throw error;
      setChatMessage("");
      queryClient.invalidateQueries({ queryKey: ["driver-chat", activeRequest.id] });
    } catch {
      toast.error("Erro ao enviar");
    }
  };

  const cancelRequest = async (requestId: string) => {
    setCancelling(true);
    try {
      const { error } = await supabase.from("delivery_requests").update({
        driver_id: null,
        status: "pending",
      } as any).eq("id", requestId);
      if (error) throw error;
      toast.success("Entrega cancelada e devolvida para disponíveis");
      queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar");
    } finally {
      setCancelling(false);
      setCancelRequestId(null);
    }
  };

  const mapMarkers = pendingRequests
    .filter((r: any) => r.restaurants?.latitude && r.restaurants?.longitude)
    .map((r: any) => ({
      id: r.id,
      lat: r.restaurants.latitude,
      lng: r.restaurants.longitude,
      name: r.restaurants.name,
      address: r.restaurants.address,
      request: r,
    }));

  const totalEarnings = earnings.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const dailyEarnings = earnings
    .filter((e: any) => isToday(new Date(e.created_at)))
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const weeklyEarnings = earnings
    .filter((e: any) => isThisWeek(new Date(e.created_at), { weekStartsOn: 0 }))
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const monthlyEarnings = earnings
    .filter((e: any) => isThisMonth(new Date(e.created_at)))
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);

  const pendingBalance = earnings
    .filter((e: any) => e.status === "pending")
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const paymentDay = Number((deliveryConfig as any)?.payment_day ?? 5);
  const isPaymentDay = new Date().getDay() === paymentDay;
  const fixedFee = Number((deliveryConfig as any)?.withdrawal_fixed_fee ?? 1.00);
  const earlyFeePercent = Number((deliveryConfig as any)?.early_withdrawal_fee_percent ?? 10);
  const feeAmountPreview = isPaymentDay ? fixedFee : (pendingBalance * earlyFeePercent) / 100;
  const netPreview = Math.max(pendingBalance - feeAmountPreview, 0);



  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Verificando login...</p>
      </div>
    );
  }

  if (driverProfile && (driverProfile as any).approval_status && (driverProfile as any).approval_status !== "approved") {
    const status = (driverProfile as any).approval_status;
    const rejected = status === "rejected";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center">
              {rejected ? "Cadastro rejeitado" : "Cadastro em análise"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-muted-foreground text-sm">
              {rejected
                ? "Seu cadastro de entregador foi rejeitado pela administração. Entre em contato com o suporte para mais informações."
                : "Seu cadastro está aguardando aprovação da administração. Assim que aprovado, você poderá começar a receber corridas."}
            </p>
            <Badge variant={rejected ? "destructive" : "secondary"} className="text-sm">
              Status: {rejected ? "Rejeitado" : "Pendente"}
            </Badge>
            <div className="pt-2">
              <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate("/auth", { replace: true }); }}>
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <SidebarProvider>
      <DeliveryNotifications
        standby={isOnline && !activeRequest}
        timeoutMs={30000}
        onAccepted={() => setActiveTab("home")}
      />
      <div className="flex min-h-screen w-full bg-background overflow-hidden">
        <AppSidebar role="driver" currentTab={activeTab} onTabChange={setActiveTab} />
        
        
        <SidebarInset className="flex-1 overflow-y-auto">
          <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
            <SidebarTrigger />
            <button onClick={() => navigate("/")} className="hover:bg-muted p-1 rounded-full transition-colors ml-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-bold text-lg flex-1 truncate">Painel do Entregador</h1>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-muted-foreground" 
                onClick={() => { playUrgentNotification(); toast.info("Testando som de alerta..."); }}
                title="Testar som de alerta"
              >
                <Signal className="w-4 h-4" />
              </Button>
              {trackingData.watching ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 gap-1 px-2 py-0 h-6 hidden sm:flex">
                  <Signal className="w-3 h-3" /> <span className="text-[10px]">GPS OK</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 gap-1 px-2 py-0 h-6 animate-pulse hidden sm:flex">
                  <SignalZero className="w-3 h-3" /> <span className="text-[10px]">GPS OFF</span>
                </Badge>
              )}
              {!isOnline && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 gap-1 px-2 py-0 h-6 animate-bounce">
                  <SignalZero className="w-3 h-3" /> <span className="text-[10px]">OFFLINE</span>
                </Badge>
              )}
              <ThemeToggle />
            </div>
          </header>

          <main className="p-4 max-w-4xl mx-auto w-full">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
              {isMobile && (
                <TabsList className="grid w-full grid-cols-7 bg-muted/50 p-1 rounded-xl">
                  <TabsTrigger value="home" className="rounded-lg"><Home className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="map" className="rounded-lg"><MapIcon className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="radar" className="rounded-lg"><Radar className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="finance" className="rounded-lg"><Wallet className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="history" className="rounded-lg"><History className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="support" className="rounded-lg"><MessageSquare className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="settings" className="rounded-lg"><Settings className="w-4 h-4" /></TabsTrigger>
                </TabsList>
              )}

              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="space-y-4 outline-none"
              >
                <TabsContent value="home" className="space-y-4 outline-none m-0">
                  {/* GPS Tracking & Map */}
                  <DriverGPS
                    activeRequest={activeRequest}
                    pendingRequests={pendingRequests}
                    onAcceptRequest={acceptRequest}
                    trackingData={trackingData}
                  />

                  {/* Multi-stop grouped routes */}
                  <DriverGroupedDeliveries userId={user.id} hasActiveSingleRequest={!!activeRequest} />

                  {/* Active delivery */}
                  {activeRequest && (
                    <Card className="border-primary shadow-md">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary" /> Entrega Ativa
                          <Badge className="ml-auto">R$ {Number((activeRequest as any).driver_fee || deliveryConfig?.base_fee || 5).toFixed(2)}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                          <p className="font-bold">{activeRequest.restaurants?.name || "Loja"}</p>
                          {storeOwnerProfile && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="w-3 h-3" />
                              <a href={`tel:${storeOwnerProfile.phone}`} className="text-primary underline">{storeOwnerProfile.phone || "Sem telefone"}</a>
                              <span className="text-muted-foreground">({storeOwnerProfile.full_name})</span>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">📍 Coleta: {activeRequest.pickup_address}</p>
                          <p className="text-xs text-muted-foreground">🏠 Entrega: {activeRequest.delivery_address}</p>
                          {activeRequest.notes && <p className="text-xs">📝 {activeRequest.notes}</p>}
                        </div>

                        <div className="flex gap-2">
                          {activeRequest.status === "accepted" && (
                            <>
                              <Button onClick={() => updateStatus(activeRequest.id, "picked_up")} className="flex-1" size="sm">
                                📦 Coletei
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setCancelRequestId(activeRequest.id)}
                              >
                                <XCircle className="w-4 h-4 mr-1" /> Cancelar
                              </Button>
                            </>
                          )}
                          {activeRequest.status === "picked_up" && (
                            <Button onClick={() => updateStatus(activeRequest.id, "delivered")} className="flex-1" size="sm">
                              ✅ Entreguei
                            </Button>
                          )}
                        </div>

                        {/* Chat */}
                        <div className="border-t pt-3">
                          <ChatWidget
                            deliveryRequestId={activeRequest.id}
                            currentUserId={user.id}
                            title="Chat com Lojista"
                            maxHeight="max-h-48"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Pending requests list */}
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>Entregas Disponíveis</span>
                        <Badge variant="secondary">{pendingRequests.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {pendingRequests.length === 0 ? (
                        <div className="text-center py-8 space-y-2">
                          <p className="text-muted-foreground">Nenhuma entrega disponível no momento</p>
                          <p className="text-xs text-muted-foreground italic">Mantenha a tela aberta para receber notificações</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {pendingRequests.filter((r: any) => !rejectedIds.includes(r.id)).map((r: any) => (
                            <div key={r.id} className="p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors space-y-3">
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                  <p className="font-bold text-sm truncate">{r.restaurants?.name || "Loja"}</p>
                                  <p className="text-xs text-muted-foreground line-clamp-1">📍 {r.pickup_address}</p>
                                  <p className="text-xs text-muted-foreground line-clamp-1">🏠 {r.delivery_address}</p>
                                  {r.driver_id === user?.id && (
                                    <p className="text-[10px] text-primary font-semibold mt-1">⭐ Direcionada a você (favorito)</p>
                                  )}
                                </div>
                                <p className="text-sm font-bold text-primary whitespace-nowrap">
                                  R$ {Number(r.driver_fee || deliveryConfig?.base_fee || 5).toFixed(2)}
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Button variant="outline" size="sm" onClick={() => {
                                  setRejectedIds((prev) => [...prev, r.id]);
                                  toast.info("Entrega recusada. Continuará disponível para outros motoristas.");
                                }}>
                                  Recusar
                                </Button>
                                <Button size="sm" onClick={() => acceptRequest(r.id)} disabled={!!activeRequest}>
                                  <Check className="w-4 h-4 mr-1" /> Aceitar
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="map" className="space-y-4 outline-none m-0 -mx-4">
                  <div className="h-[calc(100vh-160px)] w-full">
                    <DriverGPS
                      activeRequest={activeRequest}
                      pendingRequests={pendingRequests}
                      onAcceptRequest={acceptRequest}
                      trackingData={trackingData}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="radar" className="space-y-4 outline-none m-0">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Radar className="w-4 h-4 text-primary" /> Radar de Entregadores
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 sm:p-6">
                      <GlobalDriverMap />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="finance" className="space-y-4 outline-none m-0">
                  {/* Earnings Summary */}
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-extrabold text-primary">R$ {totalEarnings.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Total Ganho</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-accent/5 border-accent/20">
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-extrabold text-accent">R$ {pendingBalance.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Saldo Atual</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Earnings Report */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" /> Relatório de Ganhos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-2 rounded-lg bg-muted/50 border">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold text-[8px] sm:text-[10px]">Hoje</p>
                          <p className="text-sm font-bold text-primary">R$ {dailyEarnings.toFixed(2)}</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/50 border">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold text-[8px] sm:text-[10px]">Semana</p>
                          <p className="text-sm font-bold text-primary">R$ {weeklyEarnings.toFixed(2)}</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/50 border">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold text-[8px] sm:text-[10px]">Mês</p>
                          <p className="text-sm font-bold text-primary">R$ {monthlyEarnings.toFixed(2)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>




                  {/* PIX Key */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4" /> Chave PIX para Recebimento</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <Select value={pixKeyType} onValueChange={setPixKeyType}>
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cpf">CPF</SelectItem>
                              <SelectItem value="phone">Telefone</SelectItem>
                              <SelectItem value="email">E-mail</SelectItem>
                              <SelectItem value="random">Aleatória</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Sua chave PIX" />
                        </div>
                      </div>
                      <Button onClick={savePixKey} disabled={savingPix} size="sm" className="w-full">
                        {savingPix ? "Salvando..." : "Salvar Configurações PIX"}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Withdrawal */}
                  {pendingBalance > 0 && (
                    <Card className="border-accent/30 bg-accent/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2"><Wallet className="w-4 h-4" /> Solicitar Saque</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {(() => {
                          const weekdayNames = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
                          return isPaymentDay ? (
                            <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 text-center">
                              <p className="text-sm font-bold text-accent">🎉 Hoje é dia de pagamento!</p>
                              <p className="text-xs text-muted-foreground">Você pode solicitar seu saque agora (taxa fixa de R$ {fixedFee.toFixed(2)})</p>
                            </div>
                          ) : (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-center">
                              <p className="text-xs text-foreground">
                                Saque sem taxa de antecipação apenas às <strong>{weekdayNames[paymentDay]}</strong>.
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Sacando hoje será aplicada taxa de antecipação de <strong>{earlyFeePercent}%</strong>.
                              </p>
                            </div>
                          );
                        })()}
                        <div className="bg-background rounded-lg p-3 space-y-1 border">
                          <div className="flex justify-between text-sm">
                            <span>Saldo disponível</span>
                            <span className="font-bold">R$ {pendingBalance.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>
                              {isPaymentDay
                                ? "Taxa fixa por saque"
                                : `Taxa de antecipação (${earlyFeePercent}%)`}
                            </span>
                            <span>- R$ {feeAmountPreview.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold border-t pt-1 mt-1">
                            <span>Valor a receber</span>
                            <span className="text-primary text-lg">R$ {netPreview.toFixed(2)}</span>
                          </div>
                        </div>


                        <Button onClick={requestWithdrawal} disabled={withdrawing} className="w-full mt-2" variant="default">
                          {withdrawing ? "Processando..." : "Confirmar Solicitação de Saque"}
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Withdrawal History */}
                  {withdrawals.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Histórico de Saques</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {withdrawals.map((w: any) => (
                            <div key={w.id} className="p-3 rounded-lg border bg-muted/20 flex justify-between items-center">
                              <div>
                                <p className="text-sm font-bold">R$ {Number(w.net_amount).toFixed(2)}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(w.created_at).toLocaleDateString("pt-BR")} • Taxa: {w.fee_percent}%
                                </p>
                              </div>
                              <Badge variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : "secondary"} className="text-[10px]">
                                {w.status === "approved" ? "Aprovado" : w.status === "rejected" ? "Rejeitado" : "Pendente"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="history" className="space-y-4 outline-none m-0">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <History className="w-4 h-4 text-green-500" /> Histórico de Entregas
                        <Badge variant="outline" className="ml-auto">{completedRequests.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {completedRequests.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">Nenhuma entrega finalizada ainda</p>
                      ) : (
                        <div className="space-y-3">
                          {completedRequests.map((r: any) => (
                            <div key={r.id} className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-bold text-sm truncate">{r.restaurants?.name || "Loja"}</p>
                                <p className="text-xs text-muted-foreground truncate">🏠 {r.delivery_address}</p>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {new Date(r.updated_at).toLocaleDateString("pt-BR")} • {new Date(r.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                              <Badge className="bg-green-500/10 text-green-600 border-green-500/30 shrink-0">
                                ✅ Entregue
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>


                <TabsContent value="support" className="space-y-4 outline-none m-0">
                  {user && <AdminSupportPanel currentUserId={user.id} role="driver" />}
                </TabsContent>

                <TabsContent value="settings" className="space-y-4 outline-none m-0">
                  <PushStatusCard userId={user?.id} />
                  {/* Notification Settings */}
                  <DriverNotificationSettings />
                </TabsContent>


              </motion.div>
            </Tabs>
          </main>
        </SidebarInset>
      </div>

      <AlertDialog open={!!cancelRequestId} onOpenChange={(open) => !open && setCancelRequestId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar entrega?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido voltará para a lista de entregas disponíveis e outro motorista poderá aceitá-lo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelRequestId && cancelRequest(cancelRequestId)}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? "Cancelando..." : "Sim, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default DriverPanel;
