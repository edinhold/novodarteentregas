import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FinancialPeriod } from "@/types/financial";
import { calculateFinancials } from "@/utils/financialCalculations";
import { FinancialMetricCards } from "./FinancialMetricCards";
import { PendingWithdrawalsSection } from "./PendingWithdrawalsSection";
import { UnifiedTransactionsTable } from "./UnifiedTransactionsTable";
import { DriverEarningsTable } from "./DriverEarningsTable";
import { DirectRechargeModal } from "./DirectRechargeModal";
import { FinancialReportModal } from "./FinancialReportModal";
import { FinancialMaintenanceSection } from "./FinancialMaintenanceSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  RefreshCw,
  PlusCircle,
  FileText,
  Wallet,
  ShieldCheck,
  TrendingUp,
  Truck,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

interface FinancialModuleProps {
  standalone?: boolean;
}

export const FinancialModule: React.FC<FinancialModuleProps> = ({ standalone = false }) => {
  const [period, setPeriod] = useState<FinancialPeriod>("30days");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [activeSection, setActiveSection] = useState<"todos" | "ganhos" | "extrato" | "config">("todos");

  // Modals state
  const [directRechargeOpen, setDirectRechargeOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // Query: delivery config
  const { data: config, refetch: refetchConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_config").select("*").limit(1).single();
      if (error) return null;
      return data;
    },
  });

  // Query: stores with their current credit balances for direct recharges
  const { data: stores = [] } = useQuery({
    queryKey: ["admin-stores-recharge-list"],
    queryFn: async () => {
      const [{ data: restaurants }, { data: credits }] = await Promise.all([
        supabase.from("restaurants").select("id, name, owner_id, phone").order("name"),
        supabase.from("store_credits").select("user_id, balance"),
      ]);

      const creditsMap = new Map((credits || []).map((c) => [c.user_id, Number(c.balance || 0)]));
      return (restaurants || []).map((r) => ({
        id: r.id,
        name: r.name,
        owner_id: r.owner_id,
        phone: r.phone,
        balance: r.owner_id ? (creditsMap.get(r.owner_id) ?? 0) : 0,
      }));
    },
  });

  // Query: Main Financial Raw Datasets
  const {
    data: financialRaw,
    isLoading,
    isRefetching,
    refetch: refetchFinancialData,
  } = useQuery({
    queryKey: ["admin-financial-data"],
    queryFn: async () => {
      // 1. Credit codes
      const { data: creditCodes, error: ccErr } = await supabase
        .from("credit_codes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (ccErr) console.warn("credit_codes query warning:", ccErr);

      // 2. Delivery requests
      const { data: deliveryRequests, error: delErr } = await supabase
        .from("delivery_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (delErr) console.warn("delivery_requests query warning:", delErr);

      // 3. Driver earnings
      const { data: driverEarnings, error: deErr } = await supabase
        .from("driver_earnings")
        .select("*")
        .limit(1000);
      if (deErr) console.warn("driver_earnings query warning:", deErr);

      // 4. Withdrawal requests
      const { data: withdrawalRequests, error: wthErr } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (wthErr) console.warn("withdrawal_requests query warning:", wthErr);

      // 5. Store credits balances
      const { data: storeCredits, error: scErr } = await supabase
        .from("store_credits")
        .select("*");
      if (scErr) console.warn("store_credits query warning:", scErr);

      // 6. Drivers
      const { data: drivers, error: drvErr } = await supabase
        .from("drivers")
        .select("id, user_id, full_name, phone, pix_key, pix_key_type");
      if (drvErr) console.warn("drivers query warning:", drvErr);

      // 7. Restaurants
      const { data: restaurants, error: restErr } = await supabase
        .from("restaurants")
        .select("id, name, owner_id");
      if (restErr) console.warn("restaurants query warning:", restErr);

      // 8. Profiles
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone");
      if (profErr) console.warn("profiles query warning:", profErr);

      // 9. Delivery Groups
      const { data: deliveryGroups, error: dgErr } = await supabase
        .from("delivery_groups")
        .select("id, restaurant_id");
      if (dgErr) console.warn("delivery_groups query warning:", dgErr);

      return {
        creditCodes: creditCodes || [],
        deliveryRequests: deliveryRequests || [],
        driverEarnings: driverEarnings || [],
        withdrawalRequests: withdrawalRequests || [],
        storeCredits: storeCredits || [],
        drivers: drivers || [],
        restaurants: restaurants || [],
        profiles: profiles || [],
        deliveryGroups: deliveryGroups || [],
      };
    },
    staleTime: 1000 * 30, // 30 seconds
  });

  // Calculate Financials based on active period & filters
  const { summary, transactions, driverEarningsList } = useMemo(() => {
    if (!financialRaw) {
      return {
        summary: {
          totalRecharges: 0,
          rechargesCount: 0,
          totalDirectRecharges: 0,
          directRechargesCount: 0,
          totalEntries: 0,
          grossDeliveryTotal: 0,
          completedDeliveriesCount: 0,
          driverEarningsTotal: 0,
          deliveryCommissionTotal: 0,
          earlyWithdrawalFeesTotal: 0,
          approvedWithdrawalsCount: 0,
          platformRevenueTotal: 0,
          paidToDriversTotal: 0,
          cashBalance: 0,
          pendingWithdrawalsTotal: 0,
          pendingWithdrawalsCount: 0,
          pendingDriverBalanceTotal: 0,
          totalPendingToDrivers: 0,
          activeStoreCreditsTotal: 0,
        },
        transactions: [],
        driverEarningsList: [],
      };
    }

    return calculateFinancials({
      creditCodes: financialRaw.creditCodes,
      deliveryRequests: financialRaw.deliveryRequests,
      driverEarnings: financialRaw.driverEarnings,
      withdrawalRequests: financialRaw.withdrawalRequests,
      storeCredits: financialRaw.storeCredits,
      drivers: financialRaw.drivers,
      restaurants: financialRaw.restaurants,
      profiles: financialRaw.profiles,
      deliveryGroups: financialRaw.deliveryGroups,
      deliveryConfig: config,
      period,
      customStart,
      customEnd,
    });
  }, [financialRaw, config, period, customStart, customEnd]);

  const handleRefresh = async () => {
    await Promise.all([refetchFinancialData(), refetchConfig()]);
    toast.success("Dados financeiros atualizados!");
  };

  const periodOptions: { id: FinancialPeriod; label: string }[] = [
    { id: "today", label: "Hoje" },
    { id: "7days", label: "7 dias" },
    { id: "15days", label: "15 dias" },
    { id: "30days", label: "30 dias" },
    { id: "this_month", label: "Mês Atual" },
    { id: "all", label: "Todo o Período" },
    { id: "custom", label: "Personalizado" },
  ];

  const getPeriodLabel = () => {
    if (period === "custom") {
      return `Personalizado (${customStart || "Início"} até ${customEnd || "Fim"})`;
    }
    const found = periodOptions.find((p) => p.id === period);
    return found ? found.label : "Período Selecionado";
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full pb-10">
      {/* Header & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              Módulo Financeiro do Painel Admin
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Controle de caixa, faturamento operacional e liquidação de repasses para motoristas.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => setDirectRechargeOpen(true)}
            className="h-9 gap-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Wallet className="w-3.5 h-3.5" />
            Recarga Direta
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setReportModalOpen(true)}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <FileText className="w-3.5 h-3.5" />
            Relatório de Fechamento
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading || isRefetching}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Period Selection Bar */}
      <Card className="border-border/60 bg-card/60 shadow-sm">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Calendar className="w-4 h-4 text-primary" />
              <span>Filtrar por Período:</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {periodOptions.map((opt) => {
                const isActive = period === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setPeriod(opt.id);
                      if (opt.id === "custom") {
                        setShowCustomDates(true);
                      } else {
                        setShowCustomDates(false);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom date range picker if selected */}
          {(period === "custom" || showCustomDates) && (
            <div className="pt-2 border-t flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted-foreground font-medium">De:</span>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 w-36 text-xs"
              />
              <span className="text-muted-foreground font-medium">Até:</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 w-36 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs px-2.5"
                onClick={() => setPeriod("custom")}
              >
                Aplicar Intervalo
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending driver withdrawals alert section */}
      {financialRaw && (
        <PendingWithdrawalsSection
          withdrawals={financialRaw.withdrawalRequests}
          drivers={financialRaw.drivers}
          onRefresh={handleRefresh}
        />
      )}

      {/* Loading state skeleton */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Main 10+ Financial Metric Cards */}
          <FinancialMetricCards summary={summary} />

          {/* Sub-navigation tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3 pt-2">
            <button
              onClick={() => setActiveSection("todos")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeSection === "todos"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Visão Completa
            </button>

            <button
              onClick={() => setActiveSection("ganhos")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeSection === "ganhos"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              Ganhos do Motorista
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeSection === "ganhos"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {driverEarningsList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSection("extrato")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeSection === "extrato"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              Extrato Unificado
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeSection === "extrato"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {transactions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSection("config")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeSection === "config"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Configurações
            </button>
          </div>

          {/* Section: Driver Earnings Table */}
          {(activeSection === "ganhos" || activeSection === "todos") && (
            <DriverEarningsTable
              earnings={driverEarningsList}
              driversList={financialRaw?.drivers || []}
              onRefresh={handleRefresh}
            />
          )}

          {/* Section: Unified Transactions Extract & Audit */}
          {(activeSection === "extrato" || activeSection === "todos") && (
            <UnifiedTransactionsTable transactions={transactions} />
          )}

          {/* Section: Configuration & Safe Period Maintenance */}
          {(activeSection === "config" || activeSection === "todos") && (
            <FinancialMaintenanceSection deliveryConfig={config} />
          )}
        </>
      )}

      {/* Direct Recharge Modal */}
      <DirectRechargeModal
        open={directRechargeOpen}
        onOpenChange={setDirectRechargeOpen}
        stores={stores}
        promoPercent={Number(config?.promo_credit_percent || 0)}
      />

      {/* Financial Closing Report Modal */}
      <FinancialReportModal
        open={reportModalOpen}
        onOpenChange={setReportModalOpen}
        summary={summary}
        periodLabel={getPeriodLabel()}
      />
    </div>
  );
};
