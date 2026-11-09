import { describe, it, expect } from "vitest";

interface DeliveryConfig {
  base_fee: number;
  fee_per_km: number;
  dynamic_pricing_enabled: boolean;
  dynamic_fee_per_km: number;
  min_km?: number;
  max_km?: number;
  round_km_up?: boolean;
}

/**
 * Função de cálculo de corrida espelhando a lógica de deduct_credits_for_delivery,
 * StoreModernDashboard.tsx e CallDriverTab.tsx
 */
function calculateDeliveryFare(
  distanceKm: number,
  config: DeliveryConfig
) {
  const baseFee = Number(config.base_fee ?? 5.3);
  const baseKmFee = Number(config.fee_per_km ?? 1.7);
  const dynamicEnabled = Boolean(config.dynamic_pricing_enabled);
  const dynamicFee = (dynamicEnabled && Number(config.dynamic_fee_per_km ?? 0) > 0)
    ? Number(config.dynamic_fee_per_km)
    : 0;

  // REGRA SÊNIOR: A taxa dinâmica SOMA com a taxa regular por km (baseKmFee + dynamicFee)
  const feePerKm = baseKmFee + dynamicFee;

  let effectiveKm = distanceKm;
  if (config.round_km_up && effectiveKm > 0) {
    effectiveKm = Math.ceil(effectiveKm);
  }
  if (config.min_km && config.min_km > 0 && effectiveKm < config.min_km) {
    effectiveKm = config.min_km;
  }
  if (config.max_km && config.max_km > 0 && effectiveKm > config.max_km) {
    effectiveKm = config.max_km;
  }

  const totalCost = Number((baseFee + (effectiveKm * feePerKm)).toFixed(2));

  return {
    baseFee,
    baseKmFee,
    dynamicFee,
    effectiveFeePerKm: feePerKm,
    effectiveKm,
    totalCost,
    isDynamicActive: dynamicEnabled && dynamicFee > 0,
  };
}

describe("Cálculo e Integração da Tarifa Dinâmica", () => {
  it("deve calcular o valor padrão quando a tarifa dinâmica está DESATIVADA", () => {
    const config: DeliveryConfig = {
      base_fee: 5.3,
      fee_per_km: 1.7,
      dynamic_pricing_enabled: false,
      dynamic_fee_per_km: 1.0,
      round_km_up: false,
    };

    const result = calculateDeliveryFare(3.0, config);

    expect(result.isDynamicActive).toBe(false);
    expect(result.effectiveFeePerKm).toBe(1.7);
    // 5.30 + (3.0 * 1.70) = 5.30 + 5.10 = 10.40
    expect(result.totalCost).toBe(10.40);
  });

  it("deve SOMAR o valor dinâmico com o valor de km configurado quando a tarifa dinâmica está ATIVA", () => {
    const config: DeliveryConfig = {
      base_fee: 5.3,
      fee_per_km: 1.7,
      dynamic_pricing_enabled: true,
      dynamic_fee_per_km: 1.0,
      round_km_up: false,
    };

    const result = calculateDeliveryFare(3.0, config);

    expect(result.isDynamicActive).toBe(true);
    // 1.70 (base) + 1.00 (dinâmica) = 2.70 por km
    expect(result.effectiveFeePerKm).toBe(2.70);
    // 5.30 + (3.0 * 2.70) = 5.30 + 8.10 = 13.40
    expect(result.totalCost).toBe(13.40);

    // Garante que NÃO substituiu a taxa normal (não pode ser 5.30 + 3.0*1.0 = 8.30)
    expect(result.totalCost).not.toBe(8.30);
  });

  it("deve manter a taxa base se a tarifa dinâmica estiver ativa mas o valor dinâmico for 0 ou negativo", () => {
    const configWithZero: DeliveryConfig = {
      base_fee: 5.3,
      fee_per_km: 1.7,
      dynamic_pricing_enabled: true,
      dynamic_fee_per_km: 0,
      round_km_up: false,
    };

    const result = calculateDeliveryFare(4.0, configWithZero);

    expect(result.isDynamicActive).toBe(false);
    expect(result.effectiveFeePerKm).toBe(1.7);
    // 5.30 + (4.0 * 1.70) = 5.30 + 6.80 = 12.10
    expect(result.totalCost).toBe(12.10);
  });

  it("deve aplicar arredondamento de km para cima quando configurado em conjunto com a dinâmica", () => {
    const config: DeliveryConfig = {
      base_fee: 5.0,
      fee_per_km: 2.0,
      dynamic_pricing_enabled: true,
      dynamic_fee_per_km: 1.5, // Total km fee = 3.5
      round_km_up: true,
    };

    // 2.2 km vira 3.0 km
    const result = calculateDeliveryFare(2.2, config);

    expect(result.effectiveKm).toBe(3);
    expect(result.effectiveFeePerKm).toBe(3.5);
    // 5.0 + (3 * 3.5) = 5.0 + 10.5 = 15.5
    expect(result.totalCost).toBe(15.5);
  });

  it("deve respeitar limites de km mínimo e máximo com a tarifa dinâmica somada", () => {
    const config: DeliveryConfig = {
      base_fee: 5.0,
      fee_per_km: 2.0,
      dynamic_pricing_enabled: true,
      dynamic_fee_per_km: 0.5, // Total km fee = 2.5
      min_km: 2.0,
      max_km: 8.0,
      round_km_up: false,
    };

    // Distância de 0.8 km é elevada para o mínimo de 2.0 km
    const minResult = calculateDeliveryFare(0.8, config);
    expect(minResult.effectiveKm).toBe(2.0);
    // 5.0 + (2.0 * 2.5) = 10.0
    expect(minResult.totalCost).toBe(10.0);

    // Distância de 12.0 km é limitada para o máximo de 8.0 km
    const maxResult = calculateDeliveryFare(12.0, config);
    expect(maxResult.effectiveKm).toBe(8.0);
    // 5.0 + (8.0 * 2.5) = 25.0
    expect(maxResult.totalCost).toBe(25.0);
  });
});

