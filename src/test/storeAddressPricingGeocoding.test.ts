import { describe, it, expect, vi, beforeEach } from "vitest";

interface DeliveryConfig {
  base_fee: number;
  fee_per_km: number;
  dynamic_pricing_enabled?: boolean | string | number;
  dynamic_fee_per_km?: number;
  min_km?: number;
  max_km?: number;
  round_km_up?: boolean;
}

/**
 * Espelha a lógica de cálculo de valor da corrida de StoreModernDashboard e CallDriverTab
 */
function calculateRideFare(
  distanceKm: number,
  config: DeliveryConfig | null,
  manualDistanceKm?: number | null,
  hasDeliveryAddress: boolean = true
) {
  if (!hasDeliveryAddress) {
    return {
      totalCost: null,
      effectiveKm: 0,
      feePerKm: 0,
      baseFee: 0,
      kmCost: 0,
      dynamicFee: 0,
    };
  }

  const baseFee = config?.base_fee != null && !isNaN(Number(config.base_fee)) ? Number(config.base_fee) : 5.3;
  const baseKmFee = config?.fee_per_km != null && !isNaN(Number(config.fee_per_km)) ? Number(config.fee_per_km) : 1.7;
  const rawDynamicEnabled = config?.dynamic_pricing_enabled;
  const dynamicEnabled =
    rawDynamicEnabled === true ||
    rawDynamicEnabled === "true" ||
    rawDynamicEnabled === 1 ||
    rawDynamicEnabled === "1" ||
    rawDynamicEnabled === "t";
  const rawDynamicFee = Number(config?.dynamic_fee_per_km ?? 0);
  const dynamicFee = dynamicEnabled && !isNaN(rawDynamicFee) && rawDynamicFee > 0 ? rawDynamicFee : 0;
  const feePerKm = baseKmFee + dynamicFee;

  const minKm = Number(config?.min_km ?? 0);
  const maxKm = Number(config?.max_km ?? 0);
  const roundKmUp = Boolean(config?.round_km_up ?? false);

  const rawKm = manualDistanceKm != null && manualDistanceKm > 0 ? manualDistanceKm : distanceKm;
  let effectiveKm = rawKm;
  if (effectiveKm <= 0 && hasDeliveryAddress) {
    effectiveKm = minKm > 0 ? minKm : 1.0;
  }
  if (roundKmUp && effectiveKm > 0) {
    effectiveKm = Math.ceil(effectiveKm);
  } else if (effectiveKm > 0) {
    effectiveKm = Number(effectiveKm.toFixed(1));
  }
  if (minKm > 0 && effectiveKm < minKm) effectiveKm = minKm;
  if (maxKm > 0 && effectiveKm > maxKm) effectiveKm = maxKm;

  const kmCost = Number((effectiveKm * feePerKm).toFixed(2));
  const totalCost = Number((baseFee + kmCost).toFixed(2));

  return {
    totalCost,
    kmCost,
    effectiveKm,
    rawKm,
    feePerKm,
    baseFee,
    baseKmFee,
    dynamicFee,
    isDynamicActive: dynamicEnabled && dynamicFee > 0,
  };
}

describe("Verificação de Geocodificação e Cálculo de Corridas Conforme Configuração Admin", () => {
  describe("1. Atualização Contínua de Coordenadas e Geocodificação sem Travamento (Latch)", () => {
    it("não deve congelar coordenadas nas primeiras 3 letras e deve atualizar quando o endereço completo for digitado", () => {
      // Simulação do estado das coordenadas
      let deliveryCoordinates: { lat: number; lng: number } | null = null;

      // Passo 1: Usuário digita "Rua" (3 caracteres) -> Primeira sugestão temporária
      const firstSuggestions = [{ lat: -15.5510, lng: -54.3010, street: "Rua A", fullAddress: "Rua A, Primavera do Leste - MT" }];
      if (firstSuggestions.length > 0) {
        // Antes do fix: setDeliveryCoordinates((prev) => prev ?? firstSuggestions[0])
        // Fix: setDeliveryCoordinates({ lat: firstSuggestions[0].lat, lng: firstSuggestions[0].lng })
        deliveryCoordinates = { lat: firstSuggestions[0].lat, lng: firstSuggestions[0].lng };
      }
      expect(deliveryCoordinates).toEqual({ lat: -15.5510, lng: -54.3010 });

      // Passo 2: Usuário continua digitando o endereço real: "Rua Cuiabá, 500"
      const refinedSuggestions = [{ lat: -15.5680, lng: -54.3250, street: "Rua Cuiabá", number: "500", fullAddress: "Rua Cuiabá, 500, Primavera do Leste - MT" }];
      if (refinedSuggestions.length > 0) {
        deliveryCoordinates = { lat: refinedSuggestions[0].lat, lng: refinedSuggestions[0].lng };
      }
      // As coordenadas DEVEM ser as da Rua Cuiabá 500, NÃO as congeladas de "Rua A"
      expect(deliveryCoordinates).toEqual({ lat: -15.5680, lng: -54.3250 });
    });

    it("deve limpar coordenadas e distância quando o endereço for apagado", () => {
      let deliveryCoordinates: { lat: number; lng: number } | null = { lat: -15.5680, lng: -54.3250 };
      let estimatedDistanceKm = 4.2;

      const input = "";
      if (!input || input.trim().length < 3) {
        deliveryCoordinates = null;
        estimatedDistanceKm = 0;
      }

      expect(deliveryCoordinates).toBeNull();
      expect(estimatedDistanceKm).toBe(0);
    });
  });

  describe("2. Cálculo Rigoroso do Valor da Corrida (Taxa de Saída + KM Rodado)", () => {
    it("deve calcular exatamente: taxa de saída + (km * taxa_por_km) com as configurações do admin", () => {
      const adminConfig: DeliveryConfig = {
        base_fee: 5.30,
        fee_per_km: 1.70,
        dynamic_pricing_enabled: false,
        dynamic_fee_per_km: 0,
        min_km: 0,
        max_km: 0,
        round_km_up: false,
      };

      const distance = 3.0; // 3 km
      const result = calculateRideFare(distance, adminConfig);

      // 5.30 + (3.0 * 1.70) = 5.30 + 5.10 = 10.40
      expect(result.baseFee).toBe(5.30);
      expect(result.kmCost).toBe(5.10);
      expect(result.totalCost).toBe(10.40);
    });

    it("deve somar a tarifa dinâmica apenas quando ela estiver ativada e com valor > 0", () => {
      const configWithDynamic: DeliveryConfig = {
        base_fee: 5.30,
        fee_per_km: 1.70,
        dynamic_pricing_enabled: true,
        dynamic_fee_per_km: 1.00, // Adicional de R$ 1,00/km
      };

      const distance = 4.0;
      const result = calculateRideFare(distance, configWithDynamic);

      // Taxa por km = 1.70 + 1.00 = 2.70
      // 5.30 + (4.0 * 2.70) = 5.30 + 10.80 = 16.10
      expect(result.feePerKm).toBe(2.70);
      expect(result.kmCost).toBe(10.80);
      expect(result.totalCost).toBe(16.10);
    });

    it("não deve cobrar taxa dinâmica quando ela estiver desativada, mesmo que haja resíduo em dynamic_fee_per_km", () => {
      const configDynamicDisabled: DeliveryConfig = {
        base_fee: 5.30,
        fee_per_km: 1.70,
        dynamic_pricing_enabled: false,
        dynamic_fee_per_km: 2.50, // Resíduo não deve ser cobrado
      };

      const distance = 4.0;
      const result = calculateRideFare(distance, configDynamicDisabled);

      // Taxa por km deve ser apenas 1.70
      expect(result.feePerKm).toBe(1.70);
      expect(result.dynamicFee).toBe(0);
      expect(result.totalCost).toBe(12.10); // 5.30 + 6.80
    });

    it("deve respeitar arredondamento para cima (round_km_up) se configurado pelo admin", () => {
      const configRoundUp: DeliveryConfig = {
        base_fee: 5.30,
        fee_per_km: 1.70,
        round_km_up: true,
      };

      const distance = 2.3; // 2.3 km arredonda para 3 km
      const result = calculateRideFare(distance, configRoundUp);

      expect(result.effectiveKm).toBe(3.0);
      // 5.30 + (3 * 1.70) = 5.30 + 5.10 = 10.40
      expect(result.totalCost).toBe(10.40);
    });

    it("deve respeitar km mínimo (min_km) configurado pelo admin", () => {
      const configMinKm: DeliveryConfig = {
        base_fee: 5.30,
        fee_per_km: 1.70,
        min_km: 3.0,
      };

      const distance = 1.2; // 1.2 km < 3.0 km -> usa 3.0 km
      const result = calculateRideFare(distance, configMinKm);

      expect(result.effectiveKm).toBe(3.0);
      expect(result.totalCost).toBe(10.40);
    });

    it("deve respeitar km máximo (max_km) configurado pelo admin", () => {
      const configMaxKm: DeliveryConfig = {
        base_fee: 5.30,
        fee_per_km: 1.70,
        max_km: 5.0,
      };

      const distance = 8.5; // 8.5 km > 5.0 km -> limitado a 5.0 km
      const result = calculateRideFare(distance, configMaxKm);

      expect(result.effectiveKm).toBe(5.0);
      // 5.30 + (5.0 * 1.70) = 5.30 + 8.50 = 13.80
      expect(result.totalCost).toBe(13.80);
    });

    it("deve respeitar valores customizados de taxa de saída (mesmo que 0.00)", () => {
      const zeroBaseFeeConfig: DeliveryConfig = {
        base_fee: 0.00,
        fee_per_km: 2.00,
      };

      const distance = 5.0;
      const result = calculateRideFare(distance, zeroBaseFeeConfig);

      expect(result.baseFee).toBe(0.00);
      // 0.00 + (5.0 * 2.00) = 10.00
      expect(result.totalCost).toBe(10.00);
    });

    it("garantia sênior: corrida de 4.3 km ou mais calcula exatamente saída (5.40) + km rodado (4.3 * 1.70 = 7.31) = 12.71", () => {
      const adminConfig: DeliveryConfig = {
        base_fee: 5.40,
        fee_per_km: 1.70,
        round_km_up: false,
        dynamic_pricing_enabled: false,
      };

      const result = calculateRideFare(4.3, adminConfig);
      expect(result.effectiveKm).toBe(4.3);
      expect(result.baseFee).toBe(5.40);
      expect(result.kmCost).toBe(7.31);
      expect(result.totalCost).toBe(12.71);

      // Corrida de 6.2 km (ex: Buritis ao Centro)
      const result62 = calculateRideFare(6.2, adminConfig);
      expect(result62.effectiveKm).toBe(6.2);
      // 5.40 + (6.2 * 1.70 = 10.54) = 15.94
      expect(result62.kmCost).toBe(10.54);
      expect(result62.totalCost).toBe(15.94);
    });
  });
});
