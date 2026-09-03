export type FinancialPeriod =
  | "today"
  | "7days"
  | "15days"
  | "30days"
  | "this_month"
  | "custom"
  | "all";

export type TransactionType =
  | "recarga"
  | "recarga_direta"
  | "corrida"
  | "saque";

export type TransactionStatus =
  | "completed"
  | "pending"
  | "rejected"
  | "cancelled";

export interface UnifiedTransaction {
  id: string;
  rawId: string;
  date: string;
  type: TransactionType;
  typeLabel: string;
  description: string;
  partyName: string;
  partyRole: "store" | "driver" | "admin" | "system";
  partyId?: string;
  storeName?: string;
  rideTime?: string; // Formatted as "HH:mm" or "--:--"
  driverName?: string;
  cashIn: number;
  cashOut: number;
  platformRevenue: number;
  grossAmount?: number;
  driverAmount?: number;
  feeAmount?: number;
  status: TransactionStatus;
  statusLabel: string;
  details: Record<string, any>;
}

export interface DriverEarningItem {
  id: string;
  corridaId: string;
  driverId: string;
  driverName: string;
  driverPhone?: string;
  storeId?: string;
  storeName: string; // Nome real da loja do banco ou "Loja não identificada"
  rideTime: string; // Timestamp real da corrida formatado como "HH:mm" ou "--:--"
  formattedDate: string; // "DD/MM/AAAA"
  rawTimestamp?: string;
  grossValue: number; // Valor Bruto da corrida
  driverValue: number; // Valor líquido gerado para o motorista
  platformCommission: number; // Comissão retida pela plataforma
  status: string; // "delivered", "pending", "cancelled", etc.
  statusLabel: string; // "Concluída", "Em Andamento", "Cancelada"
  pickupAddress?: string;
  deliveryAddress?: string;
}

export interface FinancialSummary {
  // 1. Total de Recargas (via código/voucher pagas e aprovadas)
  totalRecharges: number;
  rechargesCount: number;

  // 2. Recarga Direta (créditos lançados diretamente pelo Admin)
  totalDirectRecharges: number;
  directRechargesCount: number;

  // 3. Total de Entradas (Recargas + Recargas Diretas)
  totalEntries: number;

  // 4. Valor Bruto das Corridas (total cheio das corridas entregues/válidas)
  grossDeliveryTotal: number;
  completedDeliveriesCount: number;

  // 5. Valor Gerado para os Motoristas (líquido destinado aos motoristas)
  driverEarningsTotal: number;

  // 6. Comissão das Corridas (Valor Bruto - Valor do Motorista)
  deliveryCommissionTotal: number;

  // 7. Taxas de Antecipação (taxas retidas em saques antecipados aprovados)
  earlyWithdrawalFeesTotal: number;
  approvedWithdrawalsCount: number;

  // 8. Receita Operacional da Plataforma (Comissão das Corridas + Taxas de Antecipação)
  platformRevenueTotal: number;

  // 9. Valores Efetivamente Pagos aos Motoristas (saques aprovados/pagos)
  paidToDriversTotal: number;

  // 10. Saldo de Caixa (Total de Entradas - Valores Efetivamente Pagos)
  cashBalance: number;

  // Indicadores adicionais de controle
  pendingWithdrawalsTotal: number;
  pendingWithdrawalsCount: number;
  pendingDriverBalanceTotal: number;
  totalPendingToDrivers: number;
  activeStoreCreditsTotal: number;
}
