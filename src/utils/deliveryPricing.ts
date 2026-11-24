export interface DeliveryPricingConfig {
  base_fee?: number | string | null;
  fee_per_km?: number | string | null;
  dynamic_pricing_enabled?: boolean | string | number | null;
  dynamic_fee_per_km?: number | string | null;
  min_km?: number | string | null;
  max_km?: number | string | null;
  round_km_up?: boolean | null;
  app_fee_per_delivery?: number | string | null;
}

export interface CalculatedDeliveryFare {
  totalCost: number | null;
  kmCost: number;
  isCalculated: boolean;
  effectiveKm: number;
  rawKm: number;
  feePerKm: number;
  baseFee: number;
  baseKmFee: number;
  dynamicFee: number;
  isDynamicActive: boolean;
  isManual: boolean;
}

export function isDynamicPricingActive(config?: DeliveryPricingConfig | null): boolean {
  const raw = config?.dynamic_pricing_enabled;
  return raw === true || raw === "true" || raw === 1 || raw === "1" || raw === "t";
}

export function getEffectiveDeliveryRates(config?: DeliveryPricingConfig | null) {
  const rawBaseFee = config?.base_fee;
  const baseFee =
    rawBaseFee != null && !isNaN(Number(rawBaseFee)) && Number(rawBaseFee) >= 0
      ? Number(rawBaseFee)
      : 5.4;

  const rawKmFee = config?.fee_per_km;
  const baseKmFee =
    rawKmFee != null && !isNaN(Number(rawKmFee)) && Number(rawKmFee) >= 0
      ? Number(rawKmFee)
      : 1.7;

  const dynamicEnabled = isDynamicPricingActive(config);
  const rawDynamicFee = Number(config?.dynamic_fee_per_km ?? 0);
  const dynamicFee =
    dynamicEnabled && !isNaN(rawDynamicFee) && rawDynamicFee > 0 ? rawDynamicFee : 0;

  // Regra oficial: tarifa dinâmica (quando ativa e > 0) soma ao valor regular por KM
  const feePerKm = Number((baseKmFee + dynamicFee).toFixed(4));
  const minKm = Math.max(0, Number(config?.min_km ?? 0) || 0);
  const maxKm = 0; // Sem teto de KM: o sistema calcula rigorosamente toda a quilometragem rodada
  const roundKmUp = Boolean(config?.round_km_up ?? false);

  return {
    baseFee,
    baseKmFee,
    dynamicFee,
    feePerKm,
    minKm,
    maxKm,
    roundKmUp,
    isDynamicActive: dynamicEnabled && dynamicFee > 0,
  };
}

/**
 * Calcula o valor oficial cobrado da loja: Taxa de Saída + (KM Rodado × Taxa por KM),
 * aplicando rigorosamente todas as regras configuradas pelo administrador.
 */
export function calculateDeliveryFare(
  distanceKm: number,
  config?: DeliveryPricingConfig | null,
  manualDistanceKm?: number | null,
  hasDeliveryAddress: boolean = true
): CalculatedDeliveryFare {
  if (!hasDeliveryAddress) {
    return {
      totalCost: null,
      kmCost: 0,
      isCalculated: false,
      effectiveKm: 0,
      rawKm: 0,
      feePerKm: 0,
      baseFee: 0,
      baseKmFee: 0,
      dynamicFee: 0,
      isDynamicActive: false,
      isManual: false,
    };
  }

  const {
    baseFee,
    baseKmFee,
    dynamicFee,
    feePerKm,
    minKm,
    maxKm,
    roundKmUp,
    isDynamicActive,
  } = getEffectiveDeliveryRates(config);

  const isManual = manualDistanceKm != null && manualDistanceKm > 0;
  const rawKmInput = isManual ? Number(manualDistanceKm) : Number(distanceKm || 0);
  const rawKm = rawKmInput > 0 ? Number(rawKmInput.toFixed(1)) : 0;

  let effectiveKm = rawKm;
  if (effectiveKm <= 0) {
    effectiveKm = minKm > 0 ? minKm : 1.0;
  }

  if (roundKmUp && effectiveKm > 0) {
    effectiveKm = Math.ceil(effectiveKm);
  } else if (effectiveKm > 0) {
    effectiveKm = Number(effectiveKm.toFixed(1));
  }

  if (minKm > 0 && effectiveKm < minKm) effectiveKm = minKm;

  const kmCost = Number((effectiveKm * feePerKm).toFixed(2));
  const totalCost = Number((baseFee + kmCost).toFixed(2));

  return {
    totalCost,
    kmCost,
    isCalculated: isManual || distanceKm > 0,
    effectiveKm,
    rawKm,
    feePerKm,
    baseFee,
    baseKmFee,
    dynamicFee,
    isDynamicActive,
    isManual,
  };
}

/**
 * Resolve o valor real cobrado da carteira da loja para exibição no painel do lojista.
 * Prioriza sempre credit_cost (valor debitado da loja), recorrendo à fórmula Saída + KM
 * se credit_cost estiver ausente/zerado, nunca expondo o líquido do motorista por engano.
 */
export function resolveStoreDeliveryCost(
  req: {
    credit_cost?: number | string | null;
    delivery_price?: number | string | null;
    driver_fee?: number | string | null;
    distance_km?: number | string | null;
  } | null | undefined,
  config?: DeliveryPricingConfig | null
): number {
  if (!req) return 0;

  const creditCost = Number(req.credit_cost || 0);
  if (creditCost > 0 && !isNaN(creditCost)) {
    return Number(creditCost.toFixed(2));
  }

  const deliveryPrice = Number(req.delivery_price || 0);
  if (deliveryPrice > 0 && !isNaN(deliveryPrice)) {
    return Number(deliveryPrice.toFixed(2));
  }

  const distanceKm = Number(req.distance_km || 0);
  if (distanceKm > 0 && !isNaN(distanceKm) && config) {
    const calculated = calculateDeliveryFare(distanceKm, config, null, true);
    if (calculated.totalCost != null && calculated.totalCost > 0) {
      return calculated.totalCost;
    }
  }

  const driverFee = Number(req.driver_fee || 0);
  return driverFee > 0 && !isNaN(driverFee) ? Number(driverFee.toFixed(2)) : 0;
}
