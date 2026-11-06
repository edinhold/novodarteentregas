import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, createFreshChannel } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Phone, MessageSquare, Send, Check, CheckCircle, Unlock, DollarSign, Key, Wallet, XCircle, Home, History, Settings, Map as MapIcon, Signal, SignalZero, Calendar, Radar, PanelLeft, AlertTriangle, Loader2, Bell, BellRing, BellOff, Clock, RefreshCw, ShieldCheck } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { isToday, isThisWeek, isThisMonth } from "date-fns";
import { playNotificationSound, playUrgentNotification, startDeliveryRingtone, stopDeliveryRingtone, playStandbyAlert, startStandbyMode, stopStandbyMode, resumeAudioContext, setNotificationVolume, setStandbyInterval, setStandbyGate } from "@/lib/notificationSound";
import DriverGPS from "@/components/driver/DriverGPS";
import { useGPSTracking } from "@/hooks/useGPSTracking";
import DriverNotificationSettings from "@/components/driver/DriverNotificationSettings";
import DriverProfileSettings from "@/components/driver/DriverProfileSettings";
import PushStatusCard from "@/components/driver/PushStatusCard";
import { cancelDeliveryNotification } from "@/lib/push";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { safeFormatTime, safeFormatDateTime, isFutureDate } from "@/lib/utils";

import ChatWidget from "@/components/ChatWidget";
import AdminSupportPanel from "@/components/AdminSupportPanel";
import ThemeToggle from "@/components/ThemeToggle";
import GlobalDriverMap from "@/components/GlobalDriverMap";
import AppSidebar from "@/components/AppSidebar";
import DeliveryNotifications from "@/components/driver/DeliveryNotifications";
import DriverMainDarkView from "@/components/driver/DriverMainDarkView";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import logoDuarte from "@/assets/logo-duarte.jpeg";
import {
  DRIVER_NOTIFICATION_SETTINGS_EVENT,
  DriverNotificationSettingsState,
  loadDriverNotificationSettings,
} from "@/lib/driverNotificationSettings";

const CACHED_DRIVER_KEY = "cached_driver_profile";

const getCachedDriverProfile = (userId?: string) => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHED_DRIVER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!userId || parsed.user_id === userId || parsed.id === userId) {
      return parsed;
    }
  } catch {}
  return null;
};

const setCachedDriverProfile = (profile: any) => {
  if (typeof window === "undefined" || !profile) return;
  try {
    localStorage.setItem(CACHED_DRIVER_KEY, JSON.stringify(profile));
  } catch {}
};

const DriverPanel = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pedidoParam = searchParams.get("pedido") || searchParams.get("pedido_id");
  const queryClient = useQueryClient();
  const [chatMessage, setChatMessage] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [selectedNotificationOrder, setSelectedNotificationOrder] = useState<any | null>(null);
  const [orderUnavailableMsg, setOrderUnavailableMsg] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [savingPix, setSavingPix] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const isMobile = useIsMobile();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<DriverNotificationSettingsState>(loadDriverNotificationSettings);
  const [verifyTimeoutReached, setVerifyTimeoutReached] = useState(false);
  const hadPendingStandbyRef = useRef(false);

  // Watchdog de segurança: garante que a tela nunca fique bloqueada em caso de lentidão de rede
  useEffect(() => {
    const timer = setTimeout(() => {
      setVerifyTimeoutReached(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Sincronização e validação automática do dispositivo Push ao abrir o painel
  const { state: pushState, activate: activatePush, loading: pushLoading } = usePushNotifications(user?.id, "driver");
  const isPushActive = pushState?.permission === "granted" && !!pushState?.subscriptionId;

  // Checagem de token existente em localStorage para evitar redirecionamento indevido no PWA
  const hasLocalAuthToken = typeof window !== "undefined" && Object.keys(localStorage).some(
    (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
  );

  useEffect(() => {
    if (loading) return;
    // No PWA ou standalone, só redireciona se realmente NÃO houver sessão nem token salvo e já houver estourado o tempo
    if (!user && !hasLocalAuthToken && verifyTimeoutReached) {
      navigate("/auth", { replace: true });
    }
  }, [loading, user, hasLocalAuthToken, verifyTimeoutReached, navigate]);

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

  // Get driver profile com cache local instantâneo e resolução multi-critério
  const { data: driverProfile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["my-driver-profile", user?.id],
    initialData: () => getCachedDriverProfile(user?.id),
    queryFn: async () => {
      if (!user?.id) return null;

      try {
        // Promessa protegida por timeout de 3.5 segundos para NUNCA travar a tela
        const fetchDriver = async () => {
          // 1. Busca abrangente por user_id ou id na tabela drivers
          const { data: byUserOrId } = await supabase
            .from("drivers")
            .select("*")
            .or(`user_id.eq.${user.id},id.eq.${user.id}`)
            .limit(1)
            .maybeSingle();

          if (byUserOrId) return byUserOrId;

          // 2. Fallback por telefone (para vincular se houver telefone cadastrado)
          const phone = user.phone || user.user_metadata?.phone;
          if (phone) {
            const digits = phone.replace(/\D/g, "");
            if (digits.length >= 8) {
              const { data: byPhone } = await supabase
                .from("drivers")
                .select("*")
                .ilike("phone", `%${digits.slice(-8)}%`)
                .limit(1)
                .maybeSingle();

              if (byPhone) {
                await supabase.from("drivers").update({ user_id: user.id } as any).eq("id", byPhone.id);
                return { ...byPhone, user_id: user.id };
              }
            }
          }

          // 3. Auto-repair/criação resiliente com UPSERT (garante que nunca dá erro de duplicate key)
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, phone")
            .eq("user_id", user.id)
            .maybeSingle();

          const newDriver = {
            user_id: user.id,
            full_name: profile?.full_name || user.user_metadata?.full_name || "Motorista Parceiro",
            phone: profile?.phone || user.phone || "",
            vehicle_type: "moto",
            approval_status: "approved",
            is_active: true,
            is_online: false,
          };

          const { data: created } = await supabase
            .from("drivers")
            .upsert(newDriver as any, { onConflict: "user_id" })
            .select("*")
            .maybeSingle();

          return created || newDriver;
        };

        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3500));
        const result = (await Promise.race([fetchDriver(), timeoutPromise])) as any;

        if (result) {
          if (result.id && result.user_id) {
            setCachedDriverProfile(result);
          }
          supabase.from("user_roles").upsert({ user_id: user.id, role: "driver" as any }, { onConflict: "user_id,role" }).then(() => {}, () => {});
          return result;
        }

        const cached = getCachedDriverProfile(user.id);
        if (cached) return cached;

        return {
          id: user.id,
          user_id: user.id,
          full_name: user.user_metadata?.full_name || "Motorista Parceiro",
          phone: user.phone || "",
          vehicle_type: "moto",
          approval_status: "approved",
          is_active: true,
          is_online: false,
        };
      } catch (err) {
        console.warn("[DriverPanel] Falha na verificação de motorista:", err);
        const cached = getCachedDriverProfile(user.id);
        if (cached) return cached;
        return {
          id: user.id,
          user_id: user.id,
          full_name: user.user_metadata?.full_name || "Motorista Parceiro",
          phone: user.phone || "",
          vehicle_type: "moto",
          approval_status: "approved",
          is_active: true,
          is_online: false,
        };
      }
    },
    enabled: !!user?.id,
    staleTime: 30000,
    retry: 1,
  });

  // Perfil efetivo com fallback instantâneo que impede o travamento da tela
  const effectiveDriverProfile = driverProfile || getCachedDriverProfile(user?.id) || (user ? {
    id: user.id,
    user_id: user.id,
    full_name: user.user_metadata?.full_name || "Motorista Parceiro",
    phone: user.phone || "",
    vehicle_type: "moto",
    approval_status: "approved",
    is_active: true,
    is_online: false,
  } : null);

  // Single instance of GPS tracking for the whole panel
  const trackingData = useGPSTracking({ 
    userId: user?.id,
    driverId: effectiveDriverProfile?.id
  });

  // Load PIX info from profile
  useEffect(() => {
    if (effectiveDriverProfile) {
      setPixKey((effectiveDriverProfile as any).pix_key || "");
      setPixKeyType((effectiveDriverProfile as any).pix_key_type || "cpf");
    }
  }, [effectiveDriverProfile]);

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

  const displayPendingRequests = selectedNotificationOrder
    ? [
        selectedNotificationOrder,
        ...pendingRequests.filter((r: any) => r.id !== selectedNotificationOrder.id && !rejectedIds.includes(r.id)),
      ]
    : pendingRequests.filter((r: any) => !rejectedIds.includes(r.id));

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
      const { data } = await supabase.from("profiles").select("phone, full_name").eq("user_id", activeRequest!.store_owner_id).maybeSingle();
      return data;
    },
    enabled: !!activeRequest,
  });

  // Get earnings (com suporte robusto ao id do motorista na tabela drivers e user_id)
  const { data: earnings = [] } = useQuery({
    queryKey: ["my-earnings", effectiveDriverProfile?.id, user?.id],
    queryFn: async () => {
      const driverId = effectiveDriverProfile?.id;
      const userId = user?.id;
      if (!driverId && !userId) return [];

      let query = supabase.from("driver_earnings").select("*");
      if (driverId && userId && driverId !== userId) {
        query = query.or(`driver_id.eq.${driverId},driver_id.eq.${userId}`);
      } else {
        query = query.eq("driver_id", (driverId || userId)!);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveDriverProfile?.id || !!user?.id,
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
      const { data: rpcData, error: rpcError } = await (supabase as any).rpc("get_public_delivery_config");
      if (!rpcError && rpcData) {
        const item = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (item) return item;
      }
      const { data } = await supabase
        .from("delivery_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const appFeePercent = Number((deliveryConfig as any)?.app_fee_per_delivery ?? 2);
  const getNetFee = (grossFee: number): number => {
    if (!grossFee || grossFee <= 0) return 0;
    return Math.max(0, grossFee * (1 - appFeePercent / 100));
  };

  // Realtime subscription for driver earnings & wallet adjustments
  useEffect(() => {
    const driverId = effectiveDriverProfile?.id;
    const userId = user?.id;
    if (!driverId && !userId) return;

    const channelName = `driver-wallet-realtime-${driverId || userId}`;
    const channel = createFreshChannel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "driver_earnings",
        },
        (payload: any) => {
          const recDriverId = payload.new?.driver_id || payload.old?.driver_id;
          if (!recDriverId || recDriverId === driverId || recDriverId === userId) {
            queryClient.invalidateQueries({ queryKey: ["my-earnings"] });
            queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] });
            if (payload.eventType === "INSERT") {
              toast.info("🎉 Seu saldo de carteira foi atualizado!");
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveDriverProfile?.id, user?.id, queryClient]);

  // Request local notification permission (no push provider configured).
  useEffect(() => {
    if (!user?.id) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [user?.id]);

  const activeRequestRef = useRef(activeRequest);
  useEffect(() => { activeRequestRef.current = activeRequest; }, [activeRequest]);

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
  }, []);

  // Standby gate: alerta contínuo enquanto houver corridas disponíveis para o motorista
  const hasAvailableStandbyRequest = pendingRequests.some((request: any) => !rejectedIds.includes(request.id));
  const shouldStandbyAlert = isOnline && !activeRequest && hasAvailableStandbyRequest;

  useEffect(() => {
    setStandbyGate(() => shouldStandbyAlert);
    return () => { setStandbyGate(null); };
  }, [shouldStandbyAlert]);

  // Alerta sonoro constante com o toque exclusivo criado até que algum motorista aceite ou a entrega suma
  useEffect(() => {
    if (shouldStandbyAlert) {
      resumeAudioContext();
      const firstPending = pendingRequests.find((r: any) => !rejectedIds.includes(r.id));
      startDeliveryRingtone(firstPending?.id);
    } else {
      stopDeliveryRingtone();
    }
    return () => {
      stopDeliveryRingtone();
    };
  }, [shouldStandbyAlert, pendingRequests, rejectedIds]);


  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    
    // Unlock audio context on first user interaction in the panel
    const handleFirstInteraction = () => {
      resumeAudioContext();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    // Silent sync push ("entrega_indisponivel") — parar toque e atualizar lista
    const handleUnavailable = () => {
      stopStandbyMode();
      stopDeliveryRingtone();
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
    };
    window.addEventListener("delivery-unavailable", handleUnavailable);

    const channel = createFreshChannel("driver-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_requests" }, (payload) => {
        console.log("New delivery request received:", payload);
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        queryClient.invalidateQueries({ queryKey: ["driver-pending-groups"] });
        
        // Disparar toque constante imediatamente ao chegar corrida
        resumeAudioContext();
        startDeliveryRingtone(payload.new?.id);

        toast("🚀 Nova entrega disponível!", { 
          duration: 10000,
          action: {
            label: "Ver",
            onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' })
          }
        });

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Nova Entrega!", { 
            body: "Uma nova solicitação de entrega está disponível. Toque para aceitar.", 
            icon: "/favicon.ico"
          });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_requests" }, (payload: any) => {
        console.log("Delivery request updated:", payload);
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        queryClient.invalidateQueries({ queryKey: ["driver-pending-groups"] });
        queryClient.invalidateQueries({ queryKey: ["driver-my-requests", user.id] });
        queryClient.invalidateQueries({ queryKey: ["driver-active-group"] });
        queryClient.invalidateQueries({ queryKey: ["driver-completed-requests", user.id] });
        queryClient.invalidateQueries({ queryKey: ["my-earnings", effectiveDriverProfile?.id] });
        
        // Se a entrega foi aceita por qualquer motorista ou cancelada, parar o toque imediatamente
        if (payload.new?.status !== "pending" || (payload.new?.driver_id && payload.new.driver_id !== user.id)) {
          stopDeliveryRingtone(payload.new?.id);
        }

        if (payload.new?.status === "accepted") {
          if (payload.new?.driver_id === user.id) {
            stopDeliveryRingtone();
            playNotificationSound();
            toast.success("✅ Pedido confirmado para você!");
          } else {
            // Notificar que a corrida foi aceita por outro entregador e parar o som
            stopDeliveryRingtone(payload.new?.id);
            window.dispatchEvent(new CustomEvent("delivery-unavailable", { detail: { pedidoId: payload.new?.id } }));
          }
        }
        if (payload.new?.status === "cancelled") {
          stopDeliveryRingtone(payload.new?.id);
          if (payload.new?.driver_id === user.id || payload.old?.driver_id === user.id) {
            toast.error("⚠️ A loja cancelou este chamado de entrega.", { duration: 7000 });
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_earnings" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-earnings", effectiveDriverProfile?.id] });
        playNotificationSound();
        toast.success("💰 Novo ganho registrado!");
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload: any) => {
        const curActive = activeRequestRef.current;
        if (curActive) {
          queryClient.invalidateQueries({ queryKey: ["driver-chat", curActive.id] });
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
        }
      });

    return () => { 
      supabase.removeChannel(channel); 
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener("delivery-unavailable", handleUnavailable);

    };
  }, [user?.id, driverProfile?.id, queryClient]);
  
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
        .or(`user_id.eq.${user.id},id.eq.${user.id}`);
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

  // Verificar se o app foi aberto a partir de uma notificação com chamado específico (?pedido=ID)
  useEffect(() => {
    if (!pedidoParam || !user?.id) return;
    let isCancelled = false;

    const checkOrder = async () => {
      try {
        const { data, error } = await supabase
          .from("delivery_requests")
          .select("*, restaurants(name, address)")
          .eq("id", pedidoParam)
          .maybeSingle();

        if (isCancelled) return;

        if (!data || data.status !== "pending" || (data.driver_id && data.driver_id !== user?.id)) {
          setOrderUnavailableMsg("Este chamado não está mais disponível (já foi aceito por outro motorista).");
          setSelectedNotificationOrder(null);
          toast.error("Este chamado não está mais disponível (já foi aceito por outro motorista).");
          queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        } else {
          setOrderUnavailableMsg(null);
          setSelectedNotificationOrder(data);
        }
      } catch (err) {
        console.warn("[DriverPanel] Erro ao consultar pedido da notificação:", err);
      }
    };

    checkOrder();

    return () => {
      isCancelled = true;
    };
  }, [pedidoParam, user?.id, queryClient]);

  const acceptRequest = async (requestId: string) => {
    if (acceptingId) return;
    setAcceptingId(requestId);
    try {
      console.log("[Delivery] Motorista tentando aceitar", requestId);
      // Chamada prioritária ao backend com controle de concorrência e auditoria
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke("accept-delivery", {
        body: { pedido_id: requestId, motorista_id: user?.id },
      });

      if (edgeError || (edgeData && !edgeData.success)) {
        const isConflict =
          edgeData?.code === "JA_ACEITO" ||
          /já foi assumida|já foi aceita|direcionada|ALREADY_ACCEPTED/i.test(
            edgeData?.message || edgeError?.message || ""
          );

        if (isConflict) {
          toast.error("Este chamado não está mais disponível (já foi aceito por outro motorista).");
          setOrderUnavailableMsg("Este chamado não está mais disponível (já foi aceito por outro motorista).");
          setSelectedNotificationOrder(null);
          queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
          return;
        }

        // Fallback para chamada RPC direta caso a Edge Function não retorne sucesso
        const { data: rpcData, error: rpcError } = await (supabase as any).rpc("accept_delivery_request", {
          p_request_id: requestId,
        });

        if (rpcError) {
          const raw = rpcError?.message || "";
          const conflict = /já foi assumida|já foi aceita|direcionada/i.test(raw);
          toast.error(conflict ? "Este chamado não está mais disponível (já foi aceito por outro motorista)." : raw);
          setOrderUnavailableMsg("Este chamado não está mais disponível (já foi aceito por outro motorista).");
          setSelectedNotificationOrder(null);
          queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
          return;
        }

        const fee = Number((rpcData as any)?.driver_fee || 0);
        const netFee = getNetFee(fee);
        toast.success(netFee > 0 ? `Entrega aceita com sucesso! Ganho líquido: R$ ${netFee.toFixed(2)}` : "Entrega aceita com sucesso!");
      } else {
        const fee = Number(edgeData?.driver_fee || 0);
        const netFee = getNetFee(fee);
        toast.success(netFee > 0 ? `Entrega aceita com sucesso! Ganho líquido: R$ ${netFee.toFixed(2)}` : "Entrega aceita com sucesso!");
      }

      stopDeliveryRingtone(requestId);
      stopDeliveryRingtone();
      void cancelDeliveryNotification(requestId);
      setSelectedNotificationOrder(null);
      setOrderUnavailableMsg(null);
      if (pedidoParam === requestId) {
        setSearchParams({}, { replace: true });
      }
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-pending-groups"] });
      queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-active-group"] });
    } catch (err: any) {
      const raw = err?.message || "Erro ao aceitar";
      const conflict = /já foi assumida|já foi aceita|direcionada|JA_ACEITO/i.test(raw);
      toast.error(conflict ? "Este chamado não está mais disponível (já foi aceito por outro motorista)." : raw);
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-pending-groups"] });
    } finally {
      setAcceptingId(null);
    }
  };


  const [syncingWallet, setSyncingWallet] = useState(false);

  const syncDriverWallet = async () => {
    try {
      setSyncingWallet(true);
      const { data, error } = await (supabase as any).rpc("sync_driver_wallet_integrity");
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["my-earnings"] });
      queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] });

      if (data?.restored_missing_earnings > 0 || data?.reverted_requested_earnings > 0) {
        const parts = [];
        if (data.restored_missing_earnings > 0) {
          parts.push(`${data.restored_missing_earnings} corrida(s) restaurada(s)`);
        }
        if (data.reverted_requested_earnings > 0) {
          parts.push(`saldo estornado para disponível`);
        }
        toast.success(`Carteira sincronizada: ${parts.join(", ")}!`);
      } else {
        toast.success("Carteira 100% verificada e sincronizada!");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao sincronizar carteira");
    } finally {
      setSyncingWallet(false);
    }
  };

  const updateStatus = async (requestId: string, status: string) => {
    try {
      if (status === "delivered") {
        // 1. Tentar RPC segura que valida e gera o lançamento financeiro atomicamente
        const { error: rpcErr } = await (supabase as any).rpc("complete_delivery", {
          p_request_id: requestId,
        });

        if (rpcErr) {
          console.warn("[DriverPanel] complete_delivery fallback acionado:", rpcErr);
          const { error: updateErr } = await supabase
            .from("delivery_requests")
            .update({ status: "delivered", updated_at: new Date().toISOString() })
            .eq("id", requestId);
          if (updateErr) throw updateErr;

          // Invoca auto-reparo e sincronização de carteira como garantia extra
          try {
            await (supabase as any).rpc("sync_driver_wallet_integrity");
          } catch (syncEx) {
            console.warn("[DriverPanel] auto sync wallet warning:", syncEx);
          }
        }

        queryClient.invalidateQueries({ queryKey: ["my-earnings"] });
        queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] });
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
    if (!effectiveDriverProfile || !pixKey.trim()) return;
    setSavingPix(true);
    try {
      const { error } = await supabase.from("drivers").update({
        pix_key: pixKey.trim(),
        pix_key_type: pixKeyType,
      } as any).eq("id", effectiveDriverProfile.id);
      if (error) throw error;
      toast.success("Chave PIX salva!");
      setCachedDriverProfile({
        ...effectiveDriverProfile,
        pix_key: pixKey.trim(),
        pix_key_type: pixKeyType,
      });
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
      toast.success(
        isPaymentDay
          ? `Solicitação de saque enviada! (Taxa de manutenção: R$ ${fixedFee.toFixed(2)})`
          : `Solicitação de antecipação enviada com sucesso! (Taxa de adiantamento: ${earlyFeePercent}%)`
      );
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
      const { error } = await (supabase as any).rpc("driver_drop_delivery", {
        p_request_id: requestId,
      });

      if (error) {
        // Fallback to direct update
        const { error: directErr } = await supabase.from("delivery_requests").update({
          driver_id: null,
          status: "pending",
        } as any).eq("id", requestId);
        if (directErr) throw directErr;
      }

      toast.success("Entrega cancelada e devolvida para a lista de disponíveis.");

      queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-profile"] });
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar corrida");
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

  const weekdayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const pendingBalance = earnings
    .filter((e: any) => e.status === "pending")
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const requestedBalance = earnings
    .filter((e: any) => e.status === "requested")
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const paymentDay = Number((deliveryConfig as any)?.payment_day ?? 3);
  const isPaymentDay = new Date().getDay() === paymentDay;
  const fixedFee = Number((deliveryConfig as any)?.withdrawal_fixed_fee ?? 1.00);
  const earlyFeePercent = (deliveryConfig as any)?.early_withdrawal_fee_percent !== undefined && (deliveryConfig as any)?.early_withdrawal_fee_percent !== null
    ? Number((deliveryConfig as any).early_withdrawal_fee_percent)
    : 10;
  const feeAmountPreview = isPaymentDay ? fixedFee : (pendingBalance * earlyFeePercent) / 100;
  const netPreview = Math.max(pendingBalance - feeAmountPreview, 0);



  // Anti-loop definitivo: Se ainda estiver verificando o usuário ou o perfil,
  // só bloqueia a tela se NÃO houver nenhum perfil disponível (nem em cache nem local)
  // E o tempo limite do watchdog (2.0s) não tiver estourado.
  const isVerifying = (loading || (isProfileLoading && !effectiveDriverProfile)) && !effectiveDriverProfile && !verifyTimeoutReached;

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Loader2 className="w-9 h-9 animate-spin text-primary mx-auto" />
        <div className="space-y-1">
          <p className="text-foreground text-base font-semibold">Verificando dados do entregador...</p>
          <p className="text-xs text-muted-foreground">Sincronizando painel e rotas disponíveis...</p>
        </div>
      </div>
    );
  }

  // Se o usuário não estiver autenticado após a inicialização e o watchdog
  if (!user && !loading && (!hasLocalAuthToken || verifyTimeoutReached)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center">Sessão Expirada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-muted-foreground text-sm">
              Faça login com a sua conta de entregador para acessar o cockpit.
            </p>
            <Button className="w-full" onClick={() => navigate("/auth", { replace: true })}>
              Fazer Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!effectiveDriverProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center">Perfil de Entregador Não Encontrado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-muted-foreground text-sm">
              Sua conta ainda não possui um cadastro completo como entregador. Conclua o seu cadastro para ter acesso às corridas.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => navigate("/cadastro/entregador")}>
                Completar Cadastro de Entregador
              </Button>
              <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate("/auth", { replace: true }); }}>
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (effectiveDriverProfile && (effectiveDriverProfile as any).approval_status && (effectiveDriverProfile as any).approval_status !== "approved") {
    const status = (effectiveDriverProfile as any).approval_status;
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

      {/* Drawer Móvel para Navegação no Tema Escuro */}
      <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <SheetContent side="left" className="bg-[#18181b] text-white border-zinc-800 p-6 flex flex-col justify-between w-72 z-[9999]">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu do Motorista</SheetTitle>
            <SheetDescription>Navegação rápida do painel do motorista</SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <img src={logoDuarte} alt="Logo" className="w-10 h-10 rounded-xl object-cover" />
              <div>
                <h3 className="font-bold text-white text-base leading-tight">Duarte Entregas</h3>
                <p className="text-xs text-zinc-400">{effectiveDriverProfile?.full_name || "Motorista Parceiro"}</p>
              </div>
            </div>

            <nav className="space-y-1">
              {[
                { id: "home", label: "Cockpit / Mapa", icon: Home },
                { id: "finance", label: "Ganhos & PIX", icon: Wallet },
                { id: "radar", label: "Radar de Entregas", icon: Radar },
                { id: "history", label: "Histórico", icon: History },
                { id: "support", label: "Suporte", icon: MessageSquare },
                { id: "settings", label: "Configurações", icon: Settings },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition ${
                      isActive
                        ? "bg-white text-black font-semibold shadow-md"
                        : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="pt-4 border-t border-zinc-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Status</span>
              <span className="text-emerald-400 font-semibold">● Disponível</span>
            </div>

            {/* Alternador de Modo Claro / Escuro */}
            <div className="flex items-center justify-between pt-1 pb-1">
              <span className="text-xs text-zinc-300">Modo de Exibição</span>
              <ThemeToggle />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/auth", { replace: true });
              }}
              className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs h-9"
            >
              Sair da Conta
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Visualização Mobile Fullscreen no Tema Dark Exato da Referência */}
      {isMobile && activeTab === "home" && (
        <div className="fixed inset-0 z-40 w-full h-[100dvh] overflow-hidden bg-[#121214]">
          <DriverMainDarkView
            companyName="Duarte Entregas"
            isOnline={isOnline}
            statusText="Disponível"
            driverPosition={trackingData.position}
            heading={trackingData.heading}
            activeRequest={activeRequest}
            pendingRequests={displayPendingRequests}
            onAcceptRequest={acceptRequest}
            onUpdateStatus={updateStatus}
            onCancelRequest={(id) => setCancelRequestId(id)}
            onOpenMenu={() => setMobileDrawerOpen(true)}
            onTestSound={() => {
              playUrgentNotification();
              toast.info("Sirene de chamada testada");
            }}
            currentUserId={user?.id}
          />
        </div>
      )}

      <div className="flex min-h-screen w-full bg-background overflow-hidden">
        <AppSidebar role="driver" currentTab={activeTab} onTabChange={setActiveTab} />
        
        
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
            <Card className="mb-4 border-green-500/30 bg-green-500/10 dark:bg-green-950/20 shadow-sm">
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <h4 className="font-bold text-green-700 dark:text-green-400 text-xs flex items-center gap-1.5">
                      Status do Entregador: Liberado e Ativo
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Sua conta está liberada para receber e aceitar entregas normalmente.
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-green-600 text-white border-green-600 text-[10px] shrink-0 font-medium">
                  ✓ Liberado
                </Badge>
              </CardContent>
            </Card>

            {!isPushActive && (
              <Card className="mb-4 border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/20 shadow-sm">
                <CardContent className="p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <BellRing className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 animate-bounce" />
                    <div>
                      <h4 className="font-bold text-amber-800 dark:text-amber-300 text-xs flex items-center gap-1.5">
                        Notificações de Novas Entregas Desativadas
                      </h4>
                      <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                        Ative agora para receber chamados com sirene e vibração mesmo com a tela desligada.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs shrink-0 w-full sm:w-auto font-medium"
                    disabled={pushLoading}
                    onClick={async () => {
                      resumeAudioContext();
                      const res = await activatePush();
                      if (res?.permission === "granted") {
                        playNotificationSound();
                        toast.success("Notificações e alertas sonoros ativados com sucesso!");
                      } else {
                        toast.error("Permissão de notificação negada no navegador.");
                      }
                    }}
                  >
                    {pushLoading ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Bell className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Ativar Notificações Agora
                  </Button>
                </CardContent>
              </Card>
            )}

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

              {isMobile && activeTab !== "home" && (
                <Button
                  size="sm"
                  onClick={() => setActiveTab("home")}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 w-full flex items-center justify-center gap-2 h-10 rounded-xl shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar ao Cockpit / Mapa</span>
                </Button>
              )}

              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="space-y-4 outline-none"
              >
                <TabsContent value="home" className="space-y-4 outline-none m-0">
                  {/* Visualização Cockpit Dark Mode Oficial */}
                  <div className="h-[calc(100vh-220px)] min-h-[580px] w-full rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl relative">
                    <DriverMainDarkView
                      companyName="Duarte Entregas"
                      isOnline={isOnline}
                      statusText="Disponível"
                      driverPosition={trackingData.position}
                      heading={trackingData.heading}
                      activeRequest={activeRequest}
                      pendingRequests={displayPendingRequests}
                      onAcceptRequest={acceptRequest}
                      onUpdateStatus={updateStatus}
                      onCancelRequest={(id) => setCancelRequestId(id)}
                      onOpenMenu={() => setMobileDrawerOpen(true)}
                      onTestSound={() => {
                        playUrgentNotification();
                        toast.info("Sirene de chamada testada");
                      }}
                      currentUserId={user?.id}
                    />
                  </div>

                  {/* Active delivery */}
                  {activeRequest && (
                    <Card className="border-primary shadow-md">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary" /> Entrega Ativa
                          <Badge className="ml-auto bg-green-600 hover:bg-green-700">R$ {getNetFee(Number((activeRequest as any).driver_fee || deliveryConfig?.base_fee || 5)).toFixed(2)} (líquido)</Badge>
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
                                <div className="text-right">
                                  <p className="text-sm font-bold text-green-600 whitespace-nowrap">
                                    R$ {getNetFee(Number(r.driver_fee || deliveryConfig?.base_fee || 5)).toFixed(2)}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground font-medium">ganho líquido</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Button variant="outline" size="sm" onClick={() => {
                                  setRejectedIds((prev) => [...prev, r.id]);
                                  stopDeliveryRingtone(r.id);
                                  toast.info("Entrega recusada. Continuará disponível para outros motoristas.");
                                }}>
                                  Recusar
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => acceptRequest(r.id)}
                                  disabled={!!activeRequest || !!acceptingId}
                                >
                                  {acceptingId === r.id ? (
                                    "Aceitando..."
                                  ) : (
                                    <>
                                      <Check className="w-4 h-4 mr-1" /> Aceitar
                                    </>
                                  )}
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
                        <p className="text-xs text-muted-foreground">Saldo Disponível</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Saque em análise pelo administrador */}
                  {requestedBalance > 0 && (
                    <Card className="bg-amber-500/10 border-amber-500/30">
                      <CardContent className="p-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Clock className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                              Saque em Processamento
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Aguardando conferência do PIX pelo administrador
                            </p>
                          </div>
                        </div>
                        <span className="text-base font-extrabold text-amber-600 dark:text-amber-400 font-mono">
                          R$ {requestedBalance.toFixed(2)}
                        </span>
                      </CardContent>
                    </Card>
                  )}

                  {/* Earnings Report */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary" /> Relatório de Ganhos
                        </CardTitle>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={syncDriverWallet}
                          disabled={syncingWallet}
                          className="h-7 text-[11px] gap-1 px-2.5 text-muted-foreground hover:text-foreground"
                          title="Sincronizar e verificar integridade da carteira"
                        >
                          <RefreshCw className={`w-3 h-3 ${syncingWallet ? "animate-spin" : ""}`} />
                          {syncingWallet ? "Verificando..." : "Sincronizar Carteira"}
                        </Button>
                      </div>
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
                        {isPaymentDay ? (
                          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center space-y-1">
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">🎉 Hoje é {weekdayNames[paymentDay]} (Dia Oficial de Saque)!</p>
                            <p className="text-xs text-muted-foreground">
                              Solicitação isenta da taxa de adiantamento! Cobrada apenas a taxa de manutenção de <strong>R$ {fixedFee.toFixed(2)}</strong>.
                            </p>
                          </div>
                        ) : (
                          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-center space-y-1">
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                              ⚡ Solicitação de Adiantamento
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Fora de <strong>{weekdayNames[paymentDay]}</strong> (dia oficial de saque), é cobrada a taxa de adiantamento de <strong>{earlyFeePercent}%</strong>.
                            </p>
                            <p className="text-[11px] text-muted-foreground italic pt-0.5">
                              No dia oficial ({weekdayNames[paymentDay]}), a taxa é de apenas R$ {fixedFee.toFixed(2)} (manutenção).
                            </p>
                          </div>
                        )}
                        <div className="bg-background rounded-lg p-3 space-y-1 border">
                          <div className="flex justify-between text-sm">
                            <span>Saldo disponível</span>
                            <span className="font-bold">R$ {pendingBalance.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>
                              {isPaymentDay
                                ? `Taxa de manutenção (${weekdayNames[paymentDay]})`
                                : `Taxa de adiantamento (${earlyFeePercent}%)`}
                            </span>
                            <span className="font-mono text-destructive">- R$ {feeAmountPreview.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold border-t pt-1.5 mt-1">
                            <span>Valor a receber</span>
                            <span className="text-primary text-lg font-mono">R$ {netPreview.toFixed(2)}</span>
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
                        <CardTitle className="text-base flex items-center justify-between">
                          <span>Histórico de Saques e Antecipações</span>
                          <Badge variant="outline" className="text-xs">{withdrawals.length}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2.5">
                          {withdrawals.map((w: any) => {
                            const reqAmt = Number(w.amount || 0);
                            const feeAmt = Number(w.fee_amount || 0);
                            const netAmt = Number(w.net_amount || (reqAmt - feeAmt));
                            const feePercentStr = Number(w.fee_percent || 0) > 0 ? `${w.fee_percent}%` : "R$ 1,00 (dia oficial)";

                            return (
                              <div key={w.id} className="p-3 rounded-lg border bg-muted/20 space-y-2">
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <p className="text-[11px] text-muted-foreground font-medium">
                                      Data: {new Date(w.created_at).toLocaleDateString("pt-BR")} às {new Date(w.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                    <p className="text-xs font-semibold text-foreground mt-0.5">
                                      Valor Solicitado: <span className="font-mono">R$ {reqAmt.toFixed(2)}</span>
                                    </p>
                                  </div>
                                  <Badge 
                                    variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : "secondary"} 
                                    className="text-[10px] shrink-0"
                                  >
                                    {w.status === "approved" ? "✅ Aprovado" : w.status === "rejected" ? "❌ Rejeitado" : "⏳ Pendente"}
                                  </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2 mt-1">
                                  <div>
                                    <span className="text-muted-foreground block text-[10px]">Taxa / Desconto ({feePercentStr}):</span>
                                    <span className="font-semibold text-destructive font-mono">- R$ {feeAmt.toFixed(2)}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-muted-foreground block text-[10px]">Valor Líquido a Receber:</span>
                                    <span className="font-bold text-primary font-mono text-sm">R$ {netAmt.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
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
                  <DriverProfileSettings driverProfile={effectiveDriverProfile} />
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

      {/* Modal quando o chamado da notificação já foi assumido por outro motorista */}
      <AlertDialog
        open={!!orderUnavailableMsg}
        onOpenChange={(open) => {
          if (!open) {
            setOrderUnavailableMsg(null);
            if (pedidoParam) setSearchParams({}, { replace: true });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" /> Chamado Indisponível
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium text-foreground pt-2">
              {orderUnavailableMsg}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setOrderUnavailableMsg(null);
                if (pedidoParam) setSearchParams({}, { replace: true });
              }}
            >
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal com detalhes do chamado aberto via Notificação Push */}
      <AlertDialog
        open={!!selectedNotificationOrder}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedNotificationOrder(null);
            if (pedidoParam) setSearchParams({}, { replace: true });
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center justify-between text-base">
              <span>🚚 Nova Entrega Disponível</span>
              {selectedNotificationOrder && (
                <Badge className="bg-green-600 text-white font-bold">
                  R$ {getNetFee(Number(selectedNotificationOrder.driver_fee || deliveryConfig?.base_fee || 5)).toFixed(2)}
                </Badge>
              )}
            </AlertDialogTitle>
            {selectedNotificationOrder && (
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-3 text-left text-sm text-foreground">
                  <div className="bg-muted/50 p-3 rounded-lg space-y-2 border">
                    <div>
                      <span className="text-xs text-muted-foreground block">Estabelecimento:</span>
                      <strong className="text-base">{selectedNotificationOrder.restaurants?.name || "Loja"}</strong>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">📍 Retirada:</span>
                      <span className="text-xs">{selectedNotificationOrder.pickup_address}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">🏠 Entrega:</span>
                      <span className="text-xs">{selectedNotificationOrder.delivery_address}</span>
                    </div>
                    {selectedNotificationOrder.notes && (
                      <div className="text-xs bg-background/80 p-2 rounded border">
                        📝 {selectedNotificationOrder.notes}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O primeiro motorista a clicar em Aceitar assume a corrida com exclusividade.
                  </p>
                </div>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel
              disabled={!!acceptingId}
              onClick={() => {
                setSelectedNotificationOrder(null);
                if (pedidoParam) setSearchParams({}, { replace: true });
              }}
            >
              Fechar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!!activeRequest || !!acceptingId}
              onClick={() => {
                if (selectedNotificationOrder) {
                  acceptRequest(selectedNotificationOrder.id);
                }
              }}
              className="bg-primary text-primary-foreground font-semibold"
            >
              {acceptingId === selectedNotificationOrder?.id ? "Aceitando..." : "Aceitar Chamado Agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default DriverPanel;
