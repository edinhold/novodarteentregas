import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DollarSign,
  TrendingUp,
  Wallet,
  Receipt,
  Percent,
  CalendarDays,
  Users,
  Store,
  Filter,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  FileText,
  Building,
  User,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Check,
  X,
  Loader2,
  AlertTriangle
} from "lucide-react";

// Formatação monetária pt-BR estrita e segura
const formatCurrency = (value: number | null | undefined): string => {
  const val = typeof value === "number" && !isNaN(value) && isFinite(value) ? value : 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
};

// Formatação de data pt-BR legível
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

// Tipagens estritas das estruturas do Supabase
export interface CreditCodeRecord {
  id: string;
  code: string;
  value: number;
  is_used: boolean;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
  assigned_to_user_id?: string | null;
}

export interface StoreCreditRecord {
  id: string;
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface DeliveryRequestRecord {
  id: string;
  created_at: string;
  status: string;
  driver_fee?: number | null;
  credit_cost?: number | null;
  store_owner_id?: string | null;
  driver_id?: string | null;
  restaurant_id?: string | null;
  pickup_address?: string | null;
  delivery_address?: string | null;
}

export interface DriverEarningRecord {
  id: string;
  created_at: string;
  driver_id: string;
  delivery_request_id?: string | null;
  amount: number;
}

export interface WithdrawalRequestRecord {
  id: string;
  created_at: string;
  driver_id: string;
  driver_user_id: string;
  amount: number;
  fee_percent: number;
  fee_amount: number;
  net_amount: number;
  pix_key: string | null;
  pix_key_type: string | null;
  status: string;
  processed_at: string | null;
}

export interface DriverProfileRecord {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  is_active?: boolean | null;
  pix_key?: string | null;
  pix_key_type?: string | null;
}

export interface StoreOwnerProfileRecord {
  user_id: string;
  full_name: string;
  phone: string;
  email?: string;
}

export const FinancialTab = () => {
  const queryClient = useQueryClient();

  // Estado local para controle de ações em andamento (trava de duplo clique)
  const [processingWithdrawalId, setProcessingWithdrawalId] = useState<string | null>(null);

  // Estados dos filtros globais
  const [period, setPeriod] = useState<string>("30d");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("todos");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("todos");
  const [selectedStatus, setSelectedStatus] = useState<string>("todos");
  const [selectedType, setSelectedType] = useState<string>("todos");

  // Estado de seleção individual para detalhamento
  const [detailDriverId, setDetailDriverId] = useState<string | null>(null);
  const [detailStoreUserId, setDetailStoreUserId] = useState<string | null>(null);

  // 1. CONSULTAS AO BANCO DE DADOS (SUPABASE REAL)
  const { data: creditCodes = [], isLoading: loadingCodes } = useQuery({
    queryKey: ["financial-credit-codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CreditCodeRecord[];
    },
  });

  const { data: storeCredits = [], isLoading: loadingCredits } = useQuery({
    queryKey: ["financial-store-credits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_credits")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as StoreCreditRecord[];
    },
  });

  const { data: deliveryRequests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ["financial-delivery-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("id, created_at, status, driver_fee, credit_cost, store_owner_id, driver_id, restaurant_id, pickup_address, delivery_address")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DeliveryRequestRecord[];
    },
  });

  const { data: driverEarnings = [], isLoading: loadingEarnings } = useQuery({
    queryKey: ["financial-driver-earnings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_earnings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DriverEarningRecord[];
    },
  });

  const { data: withdrawals = [], isLoading: loadingWithdrawals } = useQuery({
    queryKey: ["financial-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as WithdrawalRequestRecord[];
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["financial-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data || []) as DriverProfileRecord[];
    },
  });

  const { data: storeOwners = [] } = useQuery({
    queryKey: ["financial-store-owners"],
    queryFn: async () => {
      const rpc = await supabase.rpc("admin_list_store_owners");
      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
        return rpc.data as StoreOwnerProfileRecord[];
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "store_owner");
      const ids = (roles || []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", ids);
      const map = new Map((profiles || []).map((p) => [p.user_id, p]));
      return ids.map((id) => {
        const p = map.get(id) || { full_name: "", phone: "" };
        return {
          user_id: id,
          full_name: p.full_name || "",
          phone: p.phone || id.slice(0, 8),
          email: p.phone || id.slice(0, 8),
        };
      }) as StoreOwnerProfileRecord[];
    },
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ["financial-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name, owner_id");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: deliveryConfig } = useQuery({
    queryKey: ["financial-delivery-config"],
    queryFn: async () => {
      const { data } = await supabase.from("delivery_config").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  // Inscrever no Realtime do Supabase para atualizar antecipações automaticamente
  useEffect(() => {
    const channel = supabase
      .channel("financial-tab-realtime-withdrawals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "withdrawal_requests" },
        () => {
          console.log("[Financeiro:realtime]", "Atualização recebida na tabela withdrawal_requests");
          queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] });
          queryClient.invalidateQueries({ queryKey: ["financial-driver-earnings"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Recarregar dados manualmente
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["financial-credit-codes"] });
    queryClient.invalidateQueries({ queryKey: ["financial-store-credits"] });
    queryClient.invalidateQueries({ queryKey: ["financial-delivery-requests"] });
    queryClient.invalidateQueries({ queryKey: ["financial-driver-earnings"] });
    queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] });
    queryClient.invalidateQueries({ queryKey: ["financial-drivers"] });
    queryClient.invalidateQueries({ queryKey: ["financial-store-owners"] });
    toast.success("Dados financeiros atualizados com sucesso!");
  };

  // 2. AÇÕES DE ANTECIPAÇÃO (ACEITAR E NEGAR COM VALIDAÇÃO E IMPEDIMENTO DE DUPLO CLIQUE)
  const handleAcceptWithdrawal = async (withdrawalId: string) => {
    if (processingWithdrawalId) return;
    console.log("[Financeiro:aceitar_antecipacao]", { withdrawalId });
    setProcessingWithdrawalId(withdrawalId);

    try {
      // 1. Validação backend: verifica se a solicitação ainda está pendente no banco
      const { data: currentReq, error: fetchErr } = await supabase
        .from("withdrawal_requests")
        .select("id, status, amount, net_amount, driver_user_id")
        .eq("id", withdrawalId)
        .maybeSingle();

      if (fetchErr || !currentReq) {
        toast.error("Solicitação de antecipação não encontrada no servidor.");
        return;
      }

      if (currentReq.status !== "pending") {
        toast.error(`Esta solicitação já foi processada anteriormente (Status atual: ${currentReq.status}).`);
        queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] });
        return;
      }

      // 2. Atualização segura para o status 'approved' (Pago)
      const { error: updateErr } = await supabase
        .from("withdrawal_requests")
        .update({
          status: "approved",
          processed_at: new Date().toISOString(),
        })
        .eq("id", withdrawalId)
        .eq("status", "pending");

      if (updateErr) throw updateErr;

      toast.success("Solicitação de antecipação aceita! O pagamento foi registrado com sucesso.");

      // 3. Atualização automática dos totais e das telas
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-driver-earnings"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] }),
        queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] }),
      ]);
    } catch (err: any) {
      console.error("[Financeiro:erro_aceitar_antecipacao]", err);
      toast.error(err.message || "Erro ao aprovar a solicitação de antecipação.");
    } finally {
      setProcessingWithdrawalId(null);
    }
  };

  const handleRejectWithdrawal = async (withdrawalId: string) => {
    if (processingWithdrawalId) return;
    console.log("[Financeiro:negar_antecipacao]", { withdrawalId });
    setProcessingWithdrawalId(withdrawalId);

    try {
      // 1. Validação backend: verifica se a solicitação ainda está pendente no banco
      const { data: currentReq, error: fetchErr } = await supabase
        .from("withdrawal_requests")
        .select("id, status")
        .eq("id", withdrawalId)
        .maybeSingle();

      if (fetchErr || !currentReq) {
        toast.error("Solicitação de antecipação não encontrada no servidor.");
        return;
      }

      if (currentReq.status !== "pending") {
        toast.error(`Esta solicitação já foi processada anteriormente.`);
        queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] });
        return;
      }

      // 2. Atualização para o status 'rejected' (Negado)
      const { error: updateErr } = await supabase
        .from("withdrawal_requests")
        .update({
          status: "rejected",
          processed_at: new Date().toISOString(),
        })
        .eq("id", withdrawalId)
        .eq("status", "pending");

      if (updateErr) throw updateErr;

      toast.success("Solicitação de antecipação negada com sucesso.");

      // 3. Atualização das telas
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] }),
        queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] }),
      ]);
    } catch (err: any) {
      console.error("[Financeiro:erro_negar_antecipacao]", err);
      toast.error(err.message || "Erro ao negar a solicitação.");
    } finally {
      setProcessingWithdrawalId(null);
    }
  };

  // Cálculo dos limites de datas conforme filtro de período selecionado
  const dateBounds = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (period === "hoje") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (period === "7d") {
      start = new Date();
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (period === "30d") {
      start = new Date();
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    } else if (period === "mes_atual") {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (period === "mes_anterior") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (period === "custom") {
      if (dateFrom) {
        start = new Date(dateFrom);
        start.setHours(0, 0, 0, 0);
      }
      if (dateTo) {
        end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
      }
    }

    return { start, end };
  }, [period, dateFrom, dateTo]);

  // Função auxiliar de checagem de intervalo de data
  const isWithinPeriod = useCallback(
    (dateStr: string | null | undefined): boolean => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;

      if (dateBounds.start && d < dateBounds.start) return false;
      if (dateBounds.end && d > dateBounds.end) return false;
      return true;
    },
    [dateBounds.start, dateBounds.end]
  );

  // Mapeamentos rápidos por ID
  const storeOwnerMap = useMemo(() => {
    const map = new Map<string, StoreOwnerProfileRecord>();
    storeOwners.forEach((s) => map.set(s.user_id, s));
    return map;
  }, [storeOwners]);

  const driverMap = useMemo(() => {
    const mapByUserId = new Map<string, DriverProfileRecord>();
    const mapById = new Map<string, DriverProfileRecord>();
    drivers.forEach((d) => {
      mapByUserId.set(d.user_id, d);
      mapById.set(d.id, d);
    });
    return { mapByUserId, mapById };
  }, [drivers]);

  // Taxa de comissão do aplicativo configurada
  const appFeePercentConfig = Number((deliveryConfig as any)?.app_fee_per_delivery ?? 2);

  // 3. PROCESSAMENTO E DEDUPLICAÇÃO DE ENTRADAS FINANCEIRAS
  const filteredEntries = useMemo(() => {
    const list: Array<{
      id: string;
      type: "Recarga" | "Recarga Direta";
      store_id?: string;
      owner_name: string;
      store_name: string;
      value: number;
      status: "Aprovada" | "Pendente";
      created_at: string;
      raw_object: any;
    }> = [];

    const seenIds = new Set<string>();

    // A. Recargas pagas via credit_codes
    creditCodes.forEach((code) => {
      if (!code.is_used || seenIds.has(code.id)) return;
      seenIds.add(code.id);

      if (!isWithinPeriod(code.used_at || code.created_at)) return;

      const userId = code.used_by || code.assigned_to_user_id;
      if (selectedStoreId !== "todos" && userId !== selectedStoreId) return;
      if (selectedType !== "todos" && selectedType !== "recargas") return;
      if (selectedStatus !== "todos" && selectedStatus !== "concluido") return;

      const owner = userId ? storeOwnerMap.get(userId) : undefined;
      const rest = userId ? restaurants.find((r) => r.owner_id === userId) : undefined;

      list.push({
        id: code.id,
        type: "Recarga",
        owner_name: owner?.full_name || owner?.email || "Lojista Desconhecido",
        store_name: rest?.name || "Loja Cadastrada",
        value: Number(code.value) || 0,
        status: "Aprovada",
        created_at: code.used_at || code.created_at,
        raw_object: code,
      });
    });

    // B. Recarga Direta via store_credits (contabilizada 1 única vez por registro financeiro de crédito)
    storeCredits.forEach((sc) => {
      const directId = `direct-${sc.id}`;
      if (seenIds.has(directId)) return;
      seenIds.add(directId);

      if (!isWithinPeriod(sc.updated_at || sc.created_at)) return;

      if (selectedStoreId !== "todos" && sc.user_id !== selectedStoreId) return;
      if (selectedType !== "todos" && selectedType !== "recarga_direta") return;
      if (selectedStatus !== "todos" && selectedStatus !== "concluido") return;

      const owner = storeOwnerMap.get(sc.user_id);
      const rest = restaurants.find((r) => r.owner_id === sc.user_id);

      const val = Number(sc.balance) || 0;
      if (val > 0) {
        list.push({
          id: sc.id,
          type: "Recarga Direta",
          owner_name: owner?.full_name || owner?.email || "Lojista Desconhecido",
          store_name: rest?.name || "Loja Cadastrada",
          value: val,
          status: "Aprovada",
          created_at: sc.updated_at || sc.created_at,
          raw_object: sc,
        });
      }
    });

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [creditCodes, storeCredits, isWithinPeriod, selectedStoreId, selectedType, selectedStatus, storeOwnerMap, restaurants]);

  // 4. PROCESSAMENTO DAS CORRIDAS (DELIVERY_REQUESTS)
  const filteredDeliveries = useMemo(() => {
    const seenIds = new Set<string>();
    return deliveryRequests.filter((req) => {
      if (seenIds.has(req.id)) return false;
      seenIds.add(req.id);

      if (!isWithinPeriod(req.created_at)) return false;

      if (selectedStoreId !== "todos" && req.store_owner_id !== selectedStoreId) return false;

      if (selectedDriverId !== "todos") {
        if (req.driver_id !== selectedDriverId) return false;
      }

      if (selectedStatus !== "todos") {
        if (selectedStatus === "concluido" && req.status !== "delivered") return false;
        if (selectedStatus === "pendente" && req.status === "delivered") return false;
      }

      if (selectedType !== "todos" && selectedType !== "corridas") return false;

      return true;
    });
  }, [deliveryRequests, isWithinPeriod, selectedStoreId, selectedDriverId, selectedStatus, selectedType]);

  // 5. PROCESSAMENTO DOS SAQUES E ANTECIPAÇÕES (WITHDRAWAL_REQUESTS)
  const filteredWithdrawals = useMemo(() => {
    const seenIds = new Set<string>();
    return withdrawals.filter((w) => {
      if (seenIds.has(w.id)) return false;
      seenIds.add(w.id);

      const reqDate = w.created_at;
      if (!isWithinPeriod(reqDate)) return false;

      if (selectedDriverId !== "todos") {
        if (w.driver_id !== selectedDriverId && w.driver_user_id !== selectedDriverId) return false;
      }

      if (selectedStatus !== "todos") {
        if (selectedStatus === "concluido" && w.status !== "approved") return false;
        if (selectedStatus === "pendente" && w.status !== "pending") return false;
        if (selectedStatus === "recusado" && (w.status !== "rejected" && w.status !== "denied")) return false;
      }

      if (selectedType !== "todos" && selectedType !== "saques") return false;

      return true;
    });
  }, [withdrawals, isWithinPeriod, selectedDriverId, selectedStatus, selectedType]);

  // Lista de solicitações de antecipação PENDENTES de ação do Admin
  const pendingWithdrawals = useMemo(() => {
    return withdrawals.filter((w) => w.status === "pending");
  }, [withdrawals]);

  // 6. MAPA DE GANHOS LÍQUIDOS DOS MOTORISTAS POR ENTREGA (driver_earnings)
  const earningsByDeliveryMap = useMemo(() => {
    const map = new Map<string, number>();
    driverEarnings.forEach((e) => {
      if (e.delivery_request_id) {
        map.set(e.delivery_request_id, Number(e.amount) || 0);
      }
    });
    return map;
  }, [driverEarnings]);

  // Função utilitária para calcular o saldo real disponível de um motorista
  const getDriverAvailableBalance = useCallback(
    (driverIdOrUserId: string | null | undefined): number => {
      if (!driverIdOrUserId) return 0;
      const driverObj = driverMap.mapById.get(driverIdOrUserId) || driverMap.mapByUserId.get(driverIdOrUserId);
      if (!driverObj) return 0;

      const userOrIdList = [driverObj.id, driverObj.user_id];

      // Total líquido de entregas efetuadas
      const myRides = deliveryRequests.filter(
        (r) => userOrIdList.includes(r.driver_id || "") && r.status === "delivered"
      );

      const netGenerated = myRides.reduce((sum, r) => {
        const earningNet = earningsByDeliveryMap.get(r.id);
        if (earningNet !== undefined) return sum + earningNet;
        return sum + Math.max(0, Number(r.driver_fee || 0) * (1 - appFeePercentConfig / 100));
      }, 0);

      // Saques aprovados/pagos
      const myApprovedWithdrawals = withdrawals.filter(
        (w) => (userOrIdList.includes(w.driver_id) || userOrIdList.includes(w.driver_user_id)) && w.status === "approved"
      );
      const totalPaid = myApprovedWithdrawals.reduce((sum, w) => sum + Number(w.net_amount || 0), 0);

      // Saques pendentes
      const myPendingWithdrawals = withdrawals.filter(
        (w) => (userOrIdList.includes(w.driver_id) || userOrIdList.includes(w.driver_user_id)) && w.status === "pending"
      );
      const totalPending = myPendingWithdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0);

      return Math.max(0, netGenerated - totalPaid - totalPending);
    },
    [driverMap, deliveryRequests, earningsByDeliveryMap, appFeePercentConfig, withdrawals]
  );

  // 7. CÁLCULO DOS 10 INDICADORES FINANCEIROS (Formulas Oficiais)
  const metrics = useMemo(() => {
    // 1. Total de Recargas (Aprovadas/Resgatadas)
    const totalRecargas = filteredEntries
      .filter((e) => e.type === "Recarga" && e.status === "Aprovada")
      .reduce((sum, e) => sum + e.value, 0);

    // 2. Total de Recarga Direta (Efetivadas)
    const totalRecargaDireta = filteredEntries
      .filter((e) => e.type === "Recarga Direta" && e.status === "Aprovada")
      .reduce((sum, e) => sum + e.value, 0);

    // 3. Receita de Entradas = Recargas + Recarga Direta
    const totalEntradas = totalRecargas + totalRecargaDireta;

    // 4. Valor Bruto das Corridas (apenas entregas concluídas)
    const deliveredRides = filteredDeliveries.filter((r) => r.status === "delivered");
    const valorBrutoCorridas = deliveredRides.reduce(
      (sum, r) => sum + Number(r.driver_fee || r.credit_cost || 0),
      0
    );

    // 5. Valor Gerado para os Motoristas (Soma do valor líquido destinado aos motoristas)
    const valorGeradoMotoristas = deliveredRides.reduce((sum, r) => {
      const netFromEarnings = earningsByDeliveryMap.get(r.id);
      if (netFromEarnings !== undefined) {
        return sum + netFromEarnings;
      }
      const gross = Number(r.driver_fee || 0);
      const net = Math.max(0, gross * (1 - appFeePercentConfig / 100));
      return sum + net;
    }, 0);

    // 6. Pago aos Motoristas (Saques e antecipações efetivamente concluídos e aprovados)
    const approvedWithdrawalsList = filteredWithdrawals.filter((w) => w.status === "approved");
    const pagoAosMotoristas = approvedWithdrawalsList.reduce(
      (sum, w) => sum + Number(w.net_amount || 0),
      0
    );

    // 7. Comissão das Corridas = Valor Bruto das Corridas - Valor Líquido dos Motoristas
    const comissaoCorridas = Math.max(0, valorBrutoCorridas - valorGeradoMotoristas);

    // 8. Taxas de Antecipação (Soma das taxas cobradas em saques concluídos/aprovados)
    const taxasAntecipacao = approvedWithdrawalsList.reduce(
      (sum, w) => sum + Number(w.fee_amount || 0),
      0
    );

    // 9. Receita Operacional = Comissão das Corridas + Taxas de Antecipação
    const receitaOperacional = comissaoCorridas + taxasAntecipacao;

    // 10. Saldo de Caixa = Receita de Entradas - Total Pago aos Motoristas
    const saldoCaixa = totalEntradas - pagoAosMotoristas;

    return {
      totalRecargas,
      totalRecargaDireta,
      totalEntradas,
      valorBrutoCorridas,
      valorGeradoMotoristas,
      pagoAosMotoristas,
      comissaoCorridas,
      taxasAntecipacao,
      receitaOperacional,
      saldoCaixa,
      countDeliveries: deliveredRides.length,
      countWithdrawals: approvedWithdrawalsList.length,
    };
  }, [filteredEntries, filteredDeliveries, filteredWithdrawals, earningsByDeliveryMap, appFeePercentConfig]);

  // Motorista Selecionado para Detalhamento
  const selectedDriverData = useMemo(() => {
    if (!detailDriverId) return null;
    const driverObj = driverMap.mapById.get(detailDriverId) || driverMap.mapByUserId.get(detailDriverId);
    if (!driverObj) return null;

    const driverUserOrId = [driverObj.id, driverObj.user_id];

    // Corridas do motorista
    const myRides = deliveryRequests.filter(
      (r) => driverUserOrId.includes(r.driver_id || "") && r.status === "delivered"
    );
    const grossTotal = myRides.reduce((sum, r) => sum + Number(r.driver_fee || 0), 0);

    // Ganhos líquidos
    const netGenerated = myRides.reduce((sum, r) => {
      const earningNet = earningsByDeliveryMap.get(r.id);
      if (earningNet !== undefined) return sum + earningNet;
      return sum + Math.max(0, Number(r.driver_fee || 0) * (1 - appFeePercentConfig / 100));
    }, 0);

    const historicCommission = Math.max(0, grossTotal - netGenerated);

    // Saques do motorista
    const myWithdrawals = withdrawals.filter((w) =>
      driverUserOrId.includes(w.driver_id || "") || driverUserOrId.includes(w.driver_user_id || "")
    );
    const approvedWithdrawals = myWithdrawals.filter((w) => w.status === "approved");

    const totalPaid = approvedWithdrawals.reduce((sum, w) => sum + Number(w.net_amount || 0), 0);
    const totalFeesPaid = approvedWithdrawals.reduce((sum, w) => sum + Number(w.fee_amount || 0), 0);

    // Saldo disponível
    const pendingWithdrawalsSum = myWithdrawals
      .filter((w) => w.status === "pending")
      .reduce((sum, w) => sum + Number(w.amount || 0), 0);

    const availableBalance = Math.max(0, netGenerated - totalPaid - pendingWithdrawalsSum);

    return {
      driver: driverObj,
      ridesCount: myRides.length,
      grossTotal,
      historicCommission,
      netGenerated,
      availableBalance,
      myWithdrawals,
      withdrawalsCount: myWithdrawals.length,
      approvedWithdrawalsCount: approvedWithdrawals.length,
      totalFeesPaid,
      totalPaid,
    };
  }, [detailDriverId, driverMap, deliveryRequests, earningsByDeliveryMap, appFeePercentConfig, withdrawals]);

  // Lojista Selecionado para Detalhamento
  const selectedStoreData = useMemo(() => {
    if (!detailStoreUserId) return null;
    const ownerObj = storeOwnerMap.get(detailStoreUserId);
    const rest = restaurants.find((r) => r.owner_id === detailStoreUserId);
    const creditRecord = storeCredits.find((sc) => sc.user_id === detailStoreUserId);

    // Recargas do lojista
    const myCodes = creditCodes.filter(
      (c) => (c.used_by === detailStoreUserId || c.assigned_to_user_id === detailStoreUserId) && c.is_used
    );
    const totalRecargas = myCodes.reduce((sum, c) => sum + Number(c.value || 0), 0);

    // Corridas realizadas pela loja
    const myDeliveries = deliveryRequests.filter((r) => r.store_owner_id === detailStoreUserId);
    const deliveredCount = myDeliveries.filter((r) => r.status === "delivered").length;
    const usedInDeliveries = myDeliveries
      .filter((r) => r.status === "delivered")
      .reduce((sum, r) => sum + Number(r.driver_fee || r.credit_cost || 0), 0);

    return {
      owner: ownerObj,
      storeName: rest?.name || "Loja Cadastrada",
      totalRecargas,
      totalDirectRecharge: creditRecord?.balance || 0,
      operationsCount: myCodes.length + (creditRecord ? 1 : 0),
      creditsAcquired: totalRecargas + (creditRecord?.balance || 0),
      usedInDeliveries,
      deliveredCount,
      currentBalance: creditRecord?.balance || 0,
    };
  }, [detailStoreUserId, storeOwnerMap, restaurants, creditCodes, storeCredits, deliveryRequests]);

  const loadingAny = loadingCodes || loadingCredits || loadingRequests || loadingEarnings || loadingWithdrawals;

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho do Módulo Financeiro */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-5 rounded-xl border shadow-sm">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2 text-foreground">
            <Wallet className="w-5 h-5 text-primary" /> Módulo Financeiro Admin
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Consolidação em tempo real de recargas, comissões, antecipações, saques e saldo de caixa.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loadingAny}
            className="h-9 text-xs transition-all duration-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingAny ? "animate-spin" : ""}`} />
            Atualizar Dados
          </Button>
        </div>
      </div>

      {/* PAINEL DE SOLICITAÇÕES DE ANTECIPAÇÃO PENDENTES */}
      {pendingWithdrawals.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 text-amber-600 animate-pulse" />
              Solicitações de Antecipação / Saque Pendentes ({pendingWithdrawals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-500/10 hover:bg-amber-500/10">
                  <TableHead className="text-xs font-bold text-foreground">Data / Hora</TableHead>
                  <TableHead className="text-xs font-bold text-foreground">Motorista</TableHead>
                  <TableHead className="text-xs font-bold text-foreground">PIX Key</TableHead>
                  <TableHead className="text-xs font-bold text-foreground">Saldo Disponível</TableHead>
                  <TableHead className="text-xs font-bold text-foreground">Valor Solicitado</TableHead>
                  <TableHead className="text-xs font-bold text-foreground">Taxa Antecipação</TableHead>
                  <TableHead className="text-xs font-bold text-foreground">Valor Líquido</TableHead>
                  <TableHead className="text-xs font-bold text-foreground">Status</TableHead>
                  <TableHead className="text-xs font-bold text-center">Decisão Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingWithdrawals.map((w) => {
                  const drv = driverMap.mapById.get(w.driver_id) || driverMap.mapByUserId.get(w.driver_user_id);
                  const availableBal = getDriverAvailableBalance(w.driver_id || w.driver_user_id);
                  const isProcessingThis = processingWithdrawalId === w.id;

                  return (
                    <TableRow key={`pending-${w.id}`} className="text-xs bg-background/80">
                      <TableCell className="whitespace-nowrap font-medium">{formatDate(w.created_at)}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-foreground">{drv?.full_name || "Motorista —"}</div>
                        <div className="text-[10px] text-muted-foreground">Tel: {drv?.phone || "—"}</div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-[11px]">{w.pix_key || drv?.pix_key || "Não informada"}</span>
                        <span className="text-[10px] text-muted-foreground block">
                          ({w.pix_key_type || drv?.pix_key_type || "PIX"})
                        </span>
                      </TableCell>
                      <TableCell className="font-bold text-primary">{formatCurrency(availableBal)}</TableCell>
                      <TableCell className="font-bold text-foreground">{formatCurrency(w.amount)}</TableCell>
                      <TableCell className="text-orange-600 font-medium">
                        {formatCurrency(w.fee_amount)} ({w.fee_percent}%)
                      </TableCell>
                      <TableCell className="font-bold text-purple-600">{formatCurrency(w.net_amount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300">
                          Pendente
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-8 text-xs transition-all duration-200"
                            disabled={processingWithdrawalId !== null}
                            onClick={() => handleAcceptWithdrawal(w.id)}
                          >
                            {isProcessingThis ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                            ) : (
                              <Check className="w-3.5 h-3.5 mr-1" />
                            )}
                            Aceitar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 text-xs font-bold transition-all duration-200"
                            disabled={processingWithdrawalId !== null}
                            onClick={() => handleRejectWithdrawal(w.id)}
                          >
                            {isProcessingThis ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                            ) : (
                              <X className="w-3.5 h-3.5 mr-1" />
                            )}
                            Negar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* PAINEL DE FILTROS GLOBAIS */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
            <Filter className="w-4 h-4 text-primary" /> Filtros Globais do Módulo Financeiro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Período */}
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="mes_atual">Este mês</SelectItem>
                  <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                  <SelectItem value="custom">Período personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Lojista */}
            <div>
              <Label className="text-xs">Lojista / Loja</Label>
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue placeholder="Todas as lojas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Lojistas</SelectItem>
                  {storeOwners.map((owner) => (
                    <SelectItem key={owner.user_id} value={owner.user_id}>
                      {owner.full_name || owner.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Motorista */}
            <div>
              <Label className="text-xs">Motorista</Label>
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue placeholder="Todos os motoristas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Motoristas</SelectItem>
                  {drivers.map((drv) => (
                    <SelectItem key={drv.id} value={drv.id}>
                      {drv.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div>
              <Label className="text-xs">Status da Operação</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Status</SelectItem>
                  <SelectItem value="concluido">Concluído / Pago / Aprovado</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="recusado">Recusado / Negado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Segunda linha de filtros: tipo e datas customizadas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/40">
            <div>
              <Label className="text-xs">Tipo de Movimentação</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as Movimentações</SelectItem>
                  <SelectItem value="recargas">Recargas de Crédito</SelectItem>
                  <SelectItem value="recarga_direta">Recarga Direta</SelectItem>
                  <SelectItem value="corridas">Corridas / Entregas</SelectItem>
                  <SelectItem value="saques">Saques e Antecipações</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {period === "custom" && (
              <>
                <div>
                  <Label className="text-xs">Data Inicial</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Data Final</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 text-xs mt-1"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* DASHBOARD DOS 10 INDICADORES OFICIAIS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {/* 1. Total de Recargas */}
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              1. Recargas (Código)
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-foreground mt-1">
              {formatCurrency(metrics.totalRecargas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Lançadas via PIX/código</p>
          </CardContent>
        </Card>

        {/* 2. Total de Recarga Direta */}
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              2. Recarga Direta
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
              {formatCurrency(metrics.totalRecargaDireta)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Saldo efetivado na loja</p>
          </CardContent>
        </Card>

        {/* 3. Total de Entradas */}
        <Card className="shadow-sm bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-green-700 dark:text-green-300 font-bold uppercase tracking-wider">
              3. Total Entradas
            </p>
            <p className="text-lg sm:text-xl font-black text-green-700 dark:text-green-300 mt-1">
              {formatCurrency(metrics.totalEntradas)}
            </p>
            <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">Recargas + Recarga Direta</p>
          </CardContent>
        </Card>

        {/* 4. Valor Bruto das Corridas */}
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              4. Valor Bruto Corridas
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-foreground mt-1">
              {formatCurrency(metrics.valorBrutoCorridas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{metrics.countDeliveries} entregas válidas</p>
          </CardContent>
        </Card>

        {/* 5. Valor Gerado para Motoristas */}
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              5. Gerado Motoristas
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-green-600 dark:text-green-400 mt-1">
              {formatCurrency(metrics.valorGeradoMotoristas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Valor líquido gerado</p>
          </CardContent>
        </Card>

        {/* 6. Pago aos Motoristas */}
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              6. Pago Motoristas
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">
              {formatCurrency(metrics.pagoAosMotoristas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{metrics.countWithdrawals} saques efetuados</p>
          </CardContent>
        </Card>

        {/* 7. Comissão das Corridas */}
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              7. Comissão Corridas
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
              {formatCurrency(metrics.comissaoCorridas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Bruto - Líquido motoristas</p>
          </CardContent>
        </Card>

        {/* 8. Taxas de Antecipação */}
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              8. Taxas Antecipação
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-orange-600 dark:text-orange-400 mt-1">
              {formatCurrency(metrics.taxasAntecipacao)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Cobradas em saques pagos</p>
          </CardContent>
        </Card>

        {/* 9. Receita Operacional */}
        <Card className="shadow-sm bg-primary/5 border-primary/30">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-primary font-bold uppercase tracking-wider">
              9. Receita Operacional
            </p>
            <p className="text-lg sm:text-xl font-black text-primary mt-1">
              {formatCurrency(metrics.receitaOperacional)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Comissão + Taxas antecipação</p>
          </CardContent>
        </Card>

        {/* 10. Saldo de Caixa */}
        <Card className="shadow-sm bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider">
              10. Saldo de Caixa
            </p>
            <p className="text-lg sm:text-xl font-black text-blue-700 dark:text-blue-300 mt-1">
              {formatCurrency(metrics.saldoCaixa)}
            </p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">Entradas - Pago motoristas</p>
          </CardContent>
        </Card>
      </div>

      {/* ABAS DETALHADAS DE HISTÓRICO E ANÁLISES */}
      <Tabs defaultValue="entradas" className="w-full space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto p-1 bg-muted/60">
          <TabsTrigger value="entradas" className="text-xs py-2">
            <ArrowUpRight className="w-3.5 h-3.5 mr-1.5 text-green-600" /> Histórico de Entradas ({filteredEntries.length})
          </TabsTrigger>
          <TabsTrigger value="saidas" className="text-xs py-2">
            <ArrowDownRight className="w-3.5 h-3.5 mr-1.5 text-purple-600" /> Corridas & Saídas ({filteredDeliveries.length + filteredWithdrawals.length})
          </TabsTrigger>
          <TabsTrigger value="motoristas" className="text-xs py-2">
            <User className="w-3.5 h-3.5 mr-1.5 text-primary" /> Por Motorista
          </TabsTrigger>
          <TabsTrigger value="lojistas" className="text-xs py-2">
            <Store className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Por Lojista / Loja
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: HISTÓRICO DE ENTRADAS */}
        <TabsContent value="entradas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Histórico Detalhado de Entradas Financeiras</span>
                <Badge variant="secondary" className="text-xs">
                  Soma: {formatCurrency(metrics.totalEntradas)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data / Hora</TableHead>
                    <TableHead className="text-xs">Tipo de Entrada</TableHead>
                    <TableHead className="text-xs">Lojista / Loja</TableHead>
                    <TableHead className="text-xs">Valor</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">ID da Operação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((item) => (
                    <TableRow key={item.id} className="text-xs">
                      <TableCell className="font-medium whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={item.type === "Recarga Direta" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {item.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-foreground">{item.store_name}</div>
                        <div className="text-[10px] text-muted-foreground">{item.owner_name}</div>
                      </TableCell>
                      <TableCell className="font-bold text-green-600">{formatCurrency(item.value)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={item.status === "Aprovada" ? "default" : "outline"}
                          className={`text-[10px] ${
                            item.status === "Aprovada" ? "bg-green-600 hover:bg-green-700" : ""
                          }`}
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                        {item.id.slice(0, 13)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhuma entrada registrada para o período ou filtros selecionados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: CORRIDAS & SAÍDAS DE MOTORISTAS */}
        <TabsContent value="saidas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Movimentações dos Motoristas (Corridas, Saques e Antecipações)</span>
                <Badge variant="outline" className="text-xs">
                  {filteredDeliveries.length} corridas · {filteredWithdrawals.length} saques
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data / Hora</TableHead>
                    <TableHead className="text-xs">Motorista</TableHead>
                    <TableHead className="text-xs">Tipo Movimentação</TableHead>
                    <TableHead className="text-xs">Valor Bruto</TableHead>
                    <TableHead className="text-xs">Comissão App</TableHead>
                    <TableHead className="text-xs">Taxa Antecipação</TableHead>
                    <TableHead className="text-xs">Valor Líquido</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Ação Admin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Corridas */}
                  {filteredDeliveries.map((req) => {
                    const drv = driverMap.mapByUserId.get(req.driver_id || "") || driverMap.mapById.get(req.driver_id || "");
                    const gross = Number(req.driver_fee || req.credit_cost || 0);
                    const earningNet = earningsByDeliveryMap.get(req.id);
                    const net = earningNet !== undefined ? earningNet : Math.max(0, gross * (1 - appFeePercentConfig / 100));
                    const comm = Math.max(0, gross - net);

                    return (
                      <TableRow key={`del-${req.id}`} className="text-xs">
                        <TableCell className="whitespace-nowrap">{formatDate(req.created_at)}</TableCell>
                        <TableCell className="font-semibold">{drv?.full_name || "Motorista —"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                            Corrida
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(gross)}</TableCell>
                        <TableCell className="text-amber-600 font-medium">{formatCurrency(comm)}</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="font-bold text-green-600">{formatCurrency(net)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={req.status === "delivered" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {req.status === "delivered" ? "Concluída" : req.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-[10px]">—</TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Saques e Antecipações */}
                  {filteredWithdrawals.map((w) => {
                    const drv = driverMap.mapById.get(w.driver_id) || driverMap.mapByUserId.get(w.driver_user_id);
                    const isProcessingThis = processingWithdrawalId === w.id;
                    const isPending = w.status === "pending";

                    return (
                      <TableRow key={`with-${w.id}`} className="text-xs bg-muted/20">
                        <TableCell className="whitespace-nowrap">{formatDate(w.created_at)}</TableCell>
                        <TableCell className="font-semibold">{drv?.full_name || "Motorista —"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                            {w.fee_amount > 0 ? "Antecipação" : "Saque"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(w.amount)}</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="text-orange-600 font-medium">
                          {formatCurrency(w.fee_amount)} ({w.fee_percent}%)
                        </TableCell>
                        <TableCell className="font-bold text-purple-600">{formatCurrency(w.net_amount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              w.status === "approved"
                                ? "default"
                                : w.status === "rejected" || w.status === "denied"
                                ? "destructive"
                                : "outline"
                            }
                            className={`text-[10px] ${
                              w.status === "approved"
                                ? "bg-green-600 hover:bg-green-700"
                                : w.status === "pending"
                                ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300"
                                : ""
                            }`}
                          >
                            {w.status === "approved"
                              ? "Pago"
                              : w.status === "rejected" || w.status === "denied"
                              ? "Negado"
                              : "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-7 px-2.5 text-[11px] transition-all duration-200"
                                disabled={processingWithdrawalId !== null}
                                onClick={() => handleAcceptWithdrawal(w.id)}
                              >
                                {isProcessingThis ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Check className="w-3 h-3 mr-1" />
                                )}
                                Aceitar
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2.5 text-[11px] font-bold transition-all duration-200"
                                disabled={processingWithdrawalId !== null}
                                onClick={() => handleRejectWithdrawal(w.id)}
                              >
                                {isProcessingThis ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <X className="w-3 h-3 mr-1" />
                                )}
                                Negar
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Concluído</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredDeliveries.length === 0 && filteredWithdrawals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        Nenhuma movimentação de motorista registrada para os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: DETALHAMENTO POR MOTORISTA */}
        <TabsContent value="motoristas" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Selecione um Motorista para Visão Consolidada</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs">
                <Label className="text-xs">Entregador / Motorista</Label>
                <Select
                  value={detailDriverId || ""}
                  onValueChange={(val) => setDetailDriverId(val || null)}
                >
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue placeholder="Selecione um entregador" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name} ({d.phone})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedDriverData ? (
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-muted/40 p-4 rounded-lg gap-2">
                    <div>
                      <h3 className="text-base font-extrabold flex items-center gap-2 text-foreground">
                        <User className="w-4 h-4 text-primary" /> {selectedDriverData.driver.full_name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        PIX: {selectedDriverData.driver.pix_key_type || "—"}: {selectedDriverData.driver.pix_key || "Não cadastrada"} · Tel: {selectedDriverData.driver.phone}
                      </p>
                    </div>
                    <Badge variant={selectedDriverData.driver.is_active ? "default" : "secondary"}>
                      {selectedDriverData.driver.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Corridas Concluídas</span>
                      <p className="text-lg font-bold text-foreground mt-0.5">{selectedDriverData.ridesCount}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Valor Bruto Histórico</span>
                      <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(selectedDriverData.grossTotal)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Comissão Histórica App</span>
                      <p className="text-lg font-bold text-amber-600 mt-0.5">{formatCurrency(selectedDriverData.historicCommission)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Líquido Gerado</span>
                      <p className="text-lg font-bold text-green-600 mt-0.5">{formatCurrency(selectedDriverData.netGenerated)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Saques Solicitados</span>
                      <p className="text-lg font-bold text-foreground mt-0.5">{selectedDriverData.withdrawalsCount}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Taxas Antecipação Pagas</span>
                      <p className="text-lg font-bold text-orange-600 mt-0.5">{formatCurrency(selectedDriverData.totalFeesPaid)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Total Efetivamente Pago</span>
                      <p className="text-lg font-bold text-purple-600 mt-0.5">{formatCurrency(selectedDriverData.totalPaid)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-primary/10 border-primary/30 text-center">
                      <span className="text-[11px] text-primary font-bold">Saldo Disponível Atual</span>
                      <p className="text-lg font-black text-primary mt-0.5">{formatCurrency(selectedDriverData.availableBalance)}</p>
                    </div>
                  </div>

                  {/* TABELA DE SOLICITAÇÕES DE ANTECIPAÇÃO DO MOTORISTA */}
                  <div className="pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      Histórico de Saques e Antecipações do Motorista
                    </h4>
                    <div className="border rounded-lg overflow-x-auto bg-background">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Data / Hora</TableHead>
                            <TableHead className="text-xs">ID Operação</TableHead>
                            <TableHead className="text-xs">Valor Solicitado</TableHead>
                            <TableHead className="text-xs">Taxa Antecipação</TableHead>
                            <TableHead className="text-xs">Valor Líquido</TableHead>
                            <TableHead className="text-xs">Status Real</TableHead>
                            <TableHead className="text-xs text-right">Ação Admin</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedDriverData.myWithdrawals.map((w) => {
                            const isPending = w.status === "pending";
                            const isProcessingThis = processingWithdrawalId === w.id;

                            return (
                              <TableRow key={`drv-w-${w.id}`} className="text-xs">
                                <TableCell className="whitespace-nowrap">{formatDate(w.created_at)}</TableCell>
                                <TableCell className="font-mono text-[10px] text-muted-foreground">
                                  {w.id.slice(0, 13)}
                                </TableCell>
                                <TableCell className="font-semibold">{formatCurrency(w.amount)}</TableCell>
                                <TableCell className="text-orange-600 font-medium">
                                  {formatCurrency(w.fee_amount)} ({w.fee_percent}%)
                                </TableCell>
                                <TableCell className="font-bold text-purple-600">
                                  {formatCurrency(w.net_amount)}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      w.status === "approved"
                                        ? "default"
                                        : w.status === "rejected" || w.status === "denied"
                                        ? "destructive"
                                        : "outline"
                                    }
                                    className={`text-[10px] ${
                                      w.status === "approved"
                                        ? "bg-green-600 hover:bg-green-700"
                                        : w.status === "pending"
                                        ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300"
                                        : ""
                                    }`}
                                  >
                                    {w.status === "approved"
                                      ? "Pago"
                                      : w.status === "rejected" || w.status === "denied"
                                      ? "Negado"
                                      : "Pendente"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {isPending ? (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        size="sm"
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-7 px-2 text-[10px] transition-all duration-200"
                                        disabled={processingWithdrawalId !== null}
                                        onClick={() => handleAcceptWithdrawal(w.id)}
                                      >
                                        {isProcessingThis ? (
                                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                        ) : (
                                          <Check className="w-3 h-3 mr-1" />
                                        )}
                                        Aceitar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        className="h-7 px-2 text-[10px] font-bold transition-all duration-200"
                                        disabled={processingWithdrawalId !== null}
                                        onClick={() => handleRejectWithdrawal(w.id)}
                                      >
                                        {isProcessingThis ? (
                                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                        ) : (
                                          <X className="w-3 h-3 mr-1" />
                                        )}
                                        Negar
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}

                          {selectedDriverData.myWithdrawals.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground py-4">
                                Nenhum saque ou antecipação registrado para este motorista.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  Selecione um motorista no menu acima para consultar o histórico individual detalhado.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: DETALHAMENTO POR LOJISTA / LOJA */}
        <TabsContent value="lojistas" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Selecione um Lojista para Visão Consolidada de Créditos</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs">
                <Label className="text-xs">Lojista Destinatário</Label>
                <Select
                  value={detailStoreUserId || ""}
                  onValueChange={(val) => setDetailStoreUserId(val || null)}
                >
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue placeholder="Selecione um lojista" />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOwners.map((o) => (
                      <SelectItem key={o.user_id} value={o.user_id}>
                        {o.full_name || o.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedStoreData ? (
                <div className="space-y-4 pt-4 border-t">
                  <div className="bg-muted/40 p-4 rounded-lg">
                    <h3 className="text-base font-extrabold flex items-center gap-2 text-foreground">
                      <Store className="w-4 h-4 text-blue-600" /> {selectedStoreData.storeName}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Lojista: {selectedStoreData.owner?.full_name || selectedStoreData.owner?.email || detailStoreUserId} · Tel: {selectedStoreData.owner?.phone}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Total Recargas Código</span>
                      <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(selectedStoreData.totalRecargas)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Total Recarga Direta</span>
                      <p className="text-lg font-bold text-blue-600 mt-0.5">{formatCurrency(selectedStoreData.totalDirectRecharge)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Valor Utilizado em Entregas</span>
                      <p className="text-lg font-bold text-amber-600 mt-0.5">{formatCurrency(selectedStoreData.usedInDeliveries)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-center">
                      <span className="text-[11px] text-blue-700 dark:text-blue-300 font-bold">Saldo Atual em Carteira</span>
                      <p className="text-lg font-black text-blue-700 dark:text-blue-300 mt-0.5">{formatCurrency(selectedStoreData.currentBalance)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  Selecione um lojista no menu acima para consultar o histórico individual de créditos e recargas.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialTab;
