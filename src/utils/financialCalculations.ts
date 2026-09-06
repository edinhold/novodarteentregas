import { FinancialPeriod, FinancialSummary, UnifiedTransaction, DriverEarningItem } from "@/types/financial";

export const formatCurrency = (val: number | null | undefined): string => {
  const num = typeof val === "number" && !isNaN(val) ? val : 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
};

export const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
};

export const formatDateOnly = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return "—";
  }
};

/**
 * Format timestamp strictly as HH:mm with fallback --:--
 */
export const formatTimeHHmm = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "--:--";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "--:--";
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return "--:--";
  }
};

export const isWithinPeriod = (
  dateStr: string | null | undefined,
  period: FinancialPeriod,
  customStart?: string,
  customEnd?: string,
  lastResetTimestamp?: string | number | null
): boolean => {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;

  if (lastResetTimestamp) {
    const rTime = typeof lastResetTimestamp === "number" ? lastResetTimestamp : new Date(lastResetTimestamp).getTime();
    if (!isNaN(rTime) && date.getTime() <= rTime) return false;
  }

  if (period === "all") return true;

  const now = new Date();

  if (period === "today") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return date >= startOfToday && date <= endOfToday;
  }

  if (period === "7days") {
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - 7);
    cutoff.setHours(0, 0, 0, 0);
    return date >= cutoff;
  }

  if (period === "15days") {
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - 15);
    cutoff.setHours(0, 0, 0, 0);
    return date >= cutoff;
  }

  if (period === "30days") {
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);
    return date >= cutoff;
  }

  if (period === "this_month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return date >= startOfMonth;
  }

  if (period === "custom") {
    if (customStart) {
      const start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
      if (date < start) return false;
    }
    if (customEnd) {
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      if (date > end) return false;
    }
    return true;
  }

  return true;
};

interface CalculationInput {
  creditCodes: any[];
  deliveryRequests: any[];
  driverEarnings: any[];
  withdrawalRequests: any[];
  storeCredits: any[];
  drivers: any[];
  restaurants: any[];
  profiles: any[];
  deliveryGroups?: any[];
  deliveryConfig: any;
  period: FinancialPeriod;
  customStart?: string;
  customEnd?: string;
  lastResetTimestamp?: string | number | null;
}

export const calculateFinancials = ({
  creditCodes = [],
  deliveryRequests = [],
  driverEarnings = [],
  withdrawalRequests = [],
  storeCredits = [],
  drivers = [],
  restaurants = [],
  profiles = [],
  deliveryGroups = [],
  deliveryConfig,
  period,
  customStart,
  customEnd,
  lastResetTimestamp,
}: CalculationInput): {
  summary: FinancialSummary;
  transactions: UnifiedTransaction[];
  driverEarningsList: DriverEarningItem[];
} => {
  // Build lookup maps for fast resolution
  const profileMap = new Map<string, { full_name?: string; phone?: string }>();
  profiles.forEach((p) => {
    if (p.user_id) profileMap.set(p.user_id, p);
  });

  const restaurantMap = new Map<string, any>();
  const restaurantByOwnerMap = new Map<string, any>();
  restaurants.forEach((r) => {
    if (r.id) restaurantMap.set(r.id, r);
    if (r.owner_id) restaurantByOwnerMap.set(r.owner_id, r);
    if (r.owner_id && !profileMap.has(r.owner_id)) {
      profileMap.set(r.owner_id, { full_name: r.name });
    }
  });

  const deliveryGroupMap = new Map<string, any>();
  deliveryGroups.forEach((g) => {
    if (g.id) deliveryGroupMap.set(g.id, g);
  });

  const driverMap = new Map<string, any>();
  const driverByUserMap = new Map<string, any>();
  drivers.forEach((d) => {
    if (d.id) driverMap.set(d.id, d);
    if (d.user_id) driverByUserMap.set(d.user_id, d);
  });

  const earningsByDeliveryId = new Map<string, any>();
  driverEarnings.forEach((e) => {
    if (e.delivery_request_id) {
      earningsByDeliveryId.set(e.delivery_request_id, e);
    }
  });

  const appFeePercent = Number(deliveryConfig?.app_fee_per_delivery || 10);

  // Totals accumulators
  let totalRecharges = 0;
  let rechargesCount = 0;

  let totalDirectRecharges = 0;
  let directRechargesCount = 0;

  let grossDeliveryTotal = 0;
  let driverEarningsTotal = 0;
  let completedDeliveriesCount = 0;

  let earlyWithdrawalFeesTotal = 0;
  let approvedWithdrawalsCount = 0;

  let paidToDriversTotal = 0;

  let pendingWithdrawalsTotal = 0;
  let pendingWithdrawalsCount = 0;

  const transactions: UnifiedTransaction[] = [];
  const driverEarningsList: DriverEarningItem[] = [];

  // 1. Process Credit Codes (Entradas: Recargas e Recargas Diretas)
  creditCodes.forEach((c) => {
    const dateStr = c.used_at || c.created_at;
    const isDirect = typeof c.code === "string" && c.code.toUpperCase().startsWith("DIRETA");
    
    // An operation is a valid entrada when it has been used/redeemed or was a direct admin recharge
    const isValidEntry = c.is_used === true;
    const inPeriod = isWithinPeriod(dateStr, period, customStart, customEnd, lastResetTimestamp);

    const val = Number(c.value || 0);

    // Resolve party name
    const storeUserId = c.assigned_to_user_id || c.used_by;
    let partyName = "Lojista";
    if (storeUserId) {
      const prof = profileMap.get(storeUserId);
      if (prof?.full_name) {
        partyName = prof.full_name;
      } else {
        const rest = restaurants.find((r) => r.owner_id === storeUserId);
        if (rest?.name) partyName = rest.name;
        else partyName = `Lojista (${storeUserId.slice(0, 8)})`;
      }
    }

    if (inPeriod && isValidEntry) {
      if (isDirect) {
        totalDirectRecharges += val;
        directRechargesCount += 1;
      } else {
        totalRecharges += val;
        rechargesCount += 1;
      }
    }

    // Add to transactions list if in period or if all
    if (inPeriod) {
      transactions.push({
        id: `rec-${c.id}`,
        rawId: c.id,
        date: dateStr,
        type: isDirect ? "recarga_direta" : "recarga",
        typeLabel: isDirect ? "Recarga Direta (Admin)" : "Recarga (Código)",
        description: isDirect
          ? `Crédito direto lançado pelo Admin (${c.code || "DIRETA"})`
          : `Recarga de crédito pré-pago código ${c.code || "—"}`,
        partyName,
        partyRole: "store",
        partyId: storeUserId,
        cashIn: isValidEntry ? val : 0,
        cashOut: 0,
        platformRevenue: 0, // Ingress of funds is cash in, not instant platform revenue
        grossAmount: val,
        status: isValidEntry ? "completed" : "pending",
        statusLabel: isValidEntry ? "Efetivada" : "Pendente (Não utilizada)",
        details: {
          codigo: c.code,
          valor: val,
          status: isValidEntry ? "Utilizado" : "Disponível",
          lojista: partyName,
          lojista_id: storeUserId,
          criado_em: c.created_at,
          utilizado_em: c.used_at,
        },
      });
    }
  });

  // 2. Process Delivery Requests (Consumo de créditos, comissão e ganhos de motoristas)
  deliveryRequests.forEach((req) => {
    const dateStr = req.updated_at || req.created_at;
    const inPeriod = isWithinPeriod(dateStr, period, customStart, customEnd, lastResetTimestamp);
    const isDelivered = req.status === "delivered";

    const grossVal = Number(req.credit_cost || 0);

    // Calculate driver share
    let driverVal = 0;
    const linkedEarning = earningsByDeliveryId.get(req.id);
    if (linkedEarning && linkedEarning.amount !== undefined) {
      driverVal = Number(linkedEarning.amount || 0);
    } else {
      // Historical fallback: driver_fee minus platform fee
      const baseFee = Number(req.driver_fee || req.credit_cost || 0);
      driverVal = Math.max(baseFee - (baseFee * appFeePercent) / 100, 0);
    }

    const platformCommission = Math.max(grossVal - driverVal, 0);

    if (inPeriod && isDelivered) {
      grossDeliveryTotal += grossVal;
      driverEarningsTotal += driverVal;
      completedDeliveriesCount += 1;
    }

    // Resolve store name strictly from restaurants table & relationships:
    // Fallback if not identified: "Loja não identificada"
    let storeName = "Loja não identificada";
    let resolvedRestId = req.restaurant_id;
    if (!resolvedRestId && req.group_id && deliveryGroupMap.has(req.group_id)) {
      resolvedRestId = deliveryGroupMap.get(req.group_id)?.restaurant_id;
    }

    if (resolvedRestId && restaurantMap.has(resolvedRestId)) {
      const rest = restaurantMap.get(resolvedRestId);
      if (rest?.name && typeof rest.name === "string" && rest.name.trim()) {
        storeName = rest.name.trim();
      }
    } else if (req.store_owner_id && restaurantByOwnerMap.has(req.store_owner_id)) {
      const rest = restaurantByOwnerMap.get(req.store_owner_id);
      if (rest?.name && typeof rest.name === "string" && rest.name.trim()) {
        storeName = rest.name.trim();
      }
    } else if (req.store_owner_id && profileMap.has(req.store_owner_id)) {
      const prof = profileMap.get(req.store_owner_id);
      if (prof?.full_name && typeof prof.full_name === "string" && prof.full_name.trim()) {
        storeName = prof.full_name.trim();
      }
    }

    // Resolve ride timestamp & format strictly as HH:mm (fallback: "--:--")
    const raceTimestamp = req.created_at || linkedEarning?.created_at || req.updated_at;
    const rideTime = formatTimeHHmm(raceTimestamp);
    const rideDate = formatDateOnly(raceTimestamp);

    let driverName = "Não atribuído";
    let driverPhone = "";
    if (req.driver_id) {
      const drv = driverByUserMap.get(req.driver_id) || driverMap.get(req.driver_id);
      if (drv?.full_name) {
        driverName = drv.full_name;
        driverPhone = drv.phone || "";
      } else {
        const p = profileMap.get(req.driver_id);
        if (p?.full_name) {
          driverName = p.full_name;
          driverPhone = p.phone || "";
        }
      }
    }

    if (inPeriod) {
      driverEarningsList.push({
        id: `earn-${req.id}`,
        corridaId: req.id,
        driverId: req.driver_id || "",
        driverName,
        driverPhone,
        storeId: req.restaurant_id || "",
        storeName,
        rideTime,
        formattedDate: rideDate,
        rawTimestamp: raceTimestamp,
        grossValue: grossVal,
        driverValue: driverVal,
        platformCommission,
        status: req.status || "pending",
        statusLabel:
          req.status === "delivered"
            ? "Concluída"
            : req.status === "cancelled"
            ? "Cancelada"
            : "Em Andamento",
        pickupAddress: req.pickup_address,
        deliveryAddress: req.delivery_address,
      });

      transactions.push({
        id: `del-${req.id}`,
        rawId: req.id,
        date: dateStr,
        type: "corrida",
        typeLabel: "Corrida Concluída",
        description: `Entrega #${req.id.slice(0, 8)} (${req.pickup_address || "Origem"} → ${req.delivery_address || "Destino"})`,
        partyName: `${storeName} → ${driverName}`,
        partyRole: "system",
        storeName,
        rideTime,
        driverName,
        cashIn: 0, // Do NOT count race cost as new cash entry! (Credits were already paid)
        cashOut: 0, // Cash only leaves platform when driver withdraws
        platformRevenue: isDelivered ? platformCommission : 0,
        grossAmount: grossVal,
        driverAmount: isDelivered ? driverVal : 0,
        feeAmount: isDelivered ? platformCommission : 0,
        status: isDelivered
          ? "completed"
          : req.status === "cancelled"
          ? "cancelled"
          : "pending",
        statusLabel:
          req.status === "delivered"
            ? "Concluída"
            : req.status === "cancelled"
            ? "Cancelada"
            : "Em Andamento",
        details: {
          corrida_id: req.id,
          status: req.status,
          loja: storeName,
          horario: rideTime,
          motorista: driverName,
          origem: req.pickup_address,
          destino: req.delivery_address,
          valor_bruto_lojista: grossVal,
          valor_motorista: driverVal,
          comissao_plataforma: platformCommission,
          criado_em: req.created_at,
          atualizado_em: req.updated_at,
        },
      });
    }
  });

  // 3. Process Withdrawal Requests (Saídas de Caixa e Taxas de Antecipação)
  withdrawalRequests.forEach((w) => {
    const dateStr = w.created_at;
    const inPeriod = isWithinPeriod(dateStr, period, customStart, customEnd, lastResetTimestamp);
    const isApproved = w.status === "approved";
    const isPending = w.status === "pending";

    const requestedAmount = Number(w.amount || 0);
    const feeAmount = Number(w.fee_amount || 0);
    const netAmount = Number(w.net_amount || (requestedAmount - feeAmount));

    if (inPeriod) {
      if (isApproved) {
        paidToDriversTotal += netAmount;
        earlyWithdrawalFeesTotal += feeAmount;
        approvedWithdrawalsCount += 1;
      } else if (isPending) {
        pendingWithdrawalsTotal += netAmount;
        pendingWithdrawalsCount += 1;
      }
    }

    // Resolve driver name
    let driverName = "Motorista";
    if (w.driver_user_id) {
      const drv = driverByUserMap.get(w.driver_user_id);
      if (drv?.full_name) driverName = drv.full_name;
      else {
        const p = profileMap.get(w.driver_user_id);
        driverName = p?.full_name || `Motorista (${w.driver_user_id.slice(0, 8)})`;
      }
    } else if (w.driver_id && driverMap.has(w.driver_id)) {
      driverName = driverMap.get(w.driver_id).full_name;
    }

    if (inPeriod) {
      transactions.push({
        id: `wth-${w.id}`,
        rawId: w.id,
        date: dateStr,
        type: "saque",
        typeLabel: "Repasse / Saque PIX",
        description: `Saque ${driverName} (Chave ${w.pix_key_type || "PIX"}: ${w.pix_key || "—"})`,
        partyName: driverName,
        partyRole: "driver",
        partyId: w.driver_user_id || w.driver_id,
        cashIn: 0,
        cashOut: isApproved ? netAmount : 0,
        platformRevenue: isApproved ? feeAmount : 0,
        grossAmount: requestedAmount,
        driverAmount: netAmount,
        feeAmount: feeAmount,
        status: isApproved ? "completed" : isPending ? "pending" : "rejected",
        statusLabel: isApproved ? "Aprovado / Pago" : isPending ? "Em Análise" : "Recusado",
        details: {
          saque_id: w.id,
          motorista: driverName,
          status: w.status,
          valor_solicitado: requestedAmount,
          taxa_antecipacao_valor: feeAmount,
          taxa_antecipacao_percent: w.fee_percent || 0,
          valor_liquido_pago: netAmount,
          chave_pix: w.pix_key,
          tipo_chave_pix: w.pix_key_type,
          criado_em: w.created_at,
          processado_em: w.processed_at,
        },
      });
    }
  });

  // Sort transactions in descending chronological order
  transactions.sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    return timeB - timeA;
  });

  // Consolidated Calculations according to strict business formulas:
  const totalEntries = totalRecharges + totalDirectRecharges;
  const deliveryCommissionTotal = Math.max(grossDeliveryTotal - driverEarningsTotal, 0);
  const platformRevenueTotal = deliveryCommissionTotal + earlyWithdrawalFeesTotal;
  const cashBalance = totalEntries - paidToDriversTotal;

  // Active store credits in wallets
  const activeStoreCreditsTotal = storeCredits.reduce(
    (sum, sc) => sum + Number(sc.balance || 0),
    0
  );

  // Driver unwithdrawn balance calculation
  // Total earnings pending or available in driver_earnings minus what has been requested
  const totalDriverEarningsRecorded = driverEarnings.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );
  const totalAllApprovedWithdrawals = withdrawalRequests
    .filter((w) => w.status === "approved")
    .reduce((sum, w) => sum + Number(w.amount || 0),
    0
  );
  const pendingDriverBalanceTotal = Math.max(
    totalDriverEarningsRecorded - totalAllApprovedWithdrawals,
    0
  );

  const totalPendingToDrivers = pendingWithdrawalsTotal + pendingDriverBalanceTotal;

  const summary: FinancialSummary = {
    totalRecharges,
    rechargesCount,
    totalDirectRecharges,
    directRechargesCount,
    totalEntries,
    grossDeliveryTotal,
    completedDeliveriesCount,
    driverEarningsTotal,
    deliveryCommissionTotal,
    earlyWithdrawalFeesTotal,
    approvedWithdrawalsCount,
    platformRevenueTotal,
    paidToDriversTotal,
    cashBalance,
    pendingWithdrawalsTotal,
    pendingWithdrawalsCount,
    pendingDriverBalanceTotal,
    totalPendingToDrivers,
    activeStoreCreditsTotal,
  };

  return { summary, transactions, driverEarningsList };
};
