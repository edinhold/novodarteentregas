import { describe, it, expect } from "vitest";

interface DeliveryConfig {
  base_fee: number;
  fee_per_km: number;
  dynamic_pricing_enabled?: boolean;
  dynamic_fee_per_km?: number;
  min_km?: number;
  max_km?: number;
  round_km_up?: boolean;
}

/**
 * Função de cálculo de corrida espelhando a lógica corrigida de
 * StoreModernDashboard.tsx, CallDriverTab.tsx e deduct_credits_for_delivery
 */
function calculateDeliveryFare(
  distanceKm: number,
  config: DeliveryConfig,
  manualDistanceKm?: number | null
) {
  const baseFee = Number(config.base_fee ?? 5.3);
  const baseKmFee = Number(config.fee_per_km ?? 1.7);
  const dynamicEnabled = Boolean(config.dynamic_pricing_enabled);
  const dynamicFee = (dynamicEnabled && Number(config.dynamic_fee_per_km ?? 0) > 0)
    ? Number(config.dynamic_fee_per_km)
    : 0;

  // REGRA SÊNIOR: A taxa dinâmica SOMA com a taxa regular por km (baseKmFee + dynamicFee)
  const feePerKm = baseKmFee + dynamicFee;

  // Distância efetiva considera prioridade manual > automática
  const rawKm = manualDistanceKm != null && manualDistanceKm > 0 ? manualDistanceKm : distanceKm;

  let effectiveKm = rawKm;
  if (config.round_km_up && effectiveKm > 0) {
    effectiveKm = Math.ceil(effectiveKm);
  }
  if (config.min_km && config.min_km > 0 && effectiveKm < config.min_km) {
    effectiveKm = config.min_km;
  }
  if (config.max_km && config.max_km > 0 && effectiveKm > config.max_km) {
    effectiveKm = config.max_km;
  }

  const kmCost = Number((effectiveKm * feePerKm).toFixed(2));
  const totalCost = Number((baseFee + kmCost).toFixed(2));

  return {
    baseFee,
    baseKmFee,
    dynamicFee,
    effectiveFeePerKm: feePerKm,
    rawKm,
    effectiveKm,
    kmCost,
    totalCost,
    formulaBreakdown: `Taxa de saída R$ ${baseFee.toFixed(2)} + KM rodado (${effectiveKm.toFixed(1)} km × R$ ${feePerKm.toFixed(2)}/km = R$ ${kmCost.toFixed(2)}) = Total R$ ${totalCost.toFixed(2)}`,
  };
}

describe("Cálculo de KM e Taxas da Corrida (Lojista chamando Motorista)", () => {
  it("deve calcular o valor exato da corrida de 3km com taxa de saída + km rodado", () => {
    // Configuração oficial do admin: taxa de saída R$ 5,30 + R$ 1,70 por km
    const config: DeliveryConfig = {
      base_fee: 5.3,
      fee_per_km: 1.7,
      dynamic_pricing_enabled: false,
      dynamic_fee_per_km: 0,
      round_km_up: false,
    };

    const result = calculateDeliveryFare(3.0, config);

    expect(result.baseFee).toBe(5.3);
    expect(result.effectiveKm).toBe(3.0);
    // KM rodado: 3.0 * 1.70 = 5.10
    expect(result.kmCost).toBe(5.10);
    // Total correto: 5.30 + 5.10 = 10.40 (NÃO pode ser apenas 5.10)
    expect(result.totalCost).toBe(10.40);
    expect(result.totalCost).not.toBe(5.10);
    expect(result.totalCost).not.toBe(8.36);
  });

  it("deve somar a taxa de saída com o km rodado e a tarifa dinâmica para uma corrida de 3km", () => {
    const config: DeliveryConfig = {
      base_fee: 5.3,
      fee_per_km: 1.7,
      dynamic_pricing_enabled: true,
      dynamic_fee_per_km: 1.0, // Adicional de R$ 1,00/km
      round_km_up: false,
    };

    const result = calculateDeliveryFare(3.0, config);

    expect(result.effectiveFeePerKm).toBe(2.70); // 1.70 + 1.00
    // KM rodado: 3.0 * 2.70 = 8.10
    expect(result.kmCost).toBe(8.10);
    // Total: 5.30 + 8.10 = 13.40
    expect(result.totalCost).toBe(13.40);
  });

  it("deve respeitar a quilometragem manual se o lojista informar 3km manualmente", () => {
    const config: DeliveryConfig = {
      base_fee: 5.3,
      fee_per_km: 1.7,
      round_km_up: false,
    };

    // Simulando que o GPS/geocodificação retornou 1.8km em linha reta, mas o lojista definiu 3.0km
    const detectedDistanceKm = 1.8;
    const manualDistanceKm = 3.0;

    const result = calculateDeliveryFare(detectedDistanceKm, config, manualDistanceKm);

    expect(result.effectiveKm).toBe(3.0);
    expect(result.kmCost).toBe(5.10);
    expect(result.totalCost).toBe(10.40);
  });

  it("deve aplicar arredondamento de km para cima quando configurado pelo admin", () => {
    const config: DeliveryConfig = {
      base_fee: 5.3,
      fee_per_km: 1.7,
      round_km_up: true,
    };

    // Corrida de 2.2 km vira 3.0 km
    const result = calculateDeliveryFare(2.2, config);

    expect(result.effectiveKm).toBe(3.0);
    expect(result.kmCost).toBe(5.10);
    expect(result.totalCost).toBe(10.40);
  });

  it("deve respeitar km mínimo configurado pelo admin", () => {
    const config: DeliveryConfig = {
      base_fee: 5.3,
      fee_per_km: 1.7,
      min_km: 3.0,
      round_km_up: false,
    };

    // Corrida de 1.2 km é elevada para 3.0 km pelo mínimo
    const result = calculateDeliveryFare(1.2, config);

    expect(result.effectiveKm).toBe(3.0);
    expect(result.kmCost).toBe(5.10);
    expect(result.totalCost).toBe(10.40);
  });

  it("deve gerar o texto de detalhamento (formulaBreakdown) somando taxa de saída e km rodado sem omitir a saída", () => {
    const config: DeliveryConfig = {
      base_fee: 5.3,
      fee_per_km: 1.7,
    };

    const result = calculateDeliveryFare(3.0, config);

    expect(result.formulaBreakdown).toContain("Taxa de saída R$ 5.30");
    expect(result.formulaBreakdown).toContain("KM rodado (3.0 km × R$ 1.70/km = R$ 5.10)");
    expect(result.formulaBreakdown).toContain("Total R$ 10.40");
  });
});

