import { describe, it, expect } from "vitest";
import { calculateDeliveryFare, resolveStoreDeliveryCost } from "@/utils/deliveryPricing";

describe("Exibição do Valor Real da Corrida para o Lojista vs Valor do Motorista", () => {
  it("deve priorizar credit_cost (valor pago pelo lojista) sobre driver_fee (valor do motorista)", () => {
    const activeRequest = {
      id: "req-12345",
      status: "pending",
      driver_id: null,
      credit_cost: 10.4,
      driver_fee: 7.5,
    };

    const storeDeliveryValue = resolveStoreDeliveryCost(activeRequest);

    expect(storeDeliveryValue).toBe(10.4);
    expect(storeDeliveryValue).not.toBe(7.5);
  });

  it("deve priorizar credit_cost quando motorista aceita e corrida está em andamento", () => {
    const activeRequest = {
      id: "req-67890",
      status: "accepted",
      driver_id: "driver-uuid-1",
      credit_cost: 12.0,
      driver_fee: 8.0,
    };

    const storeDeliveryValue = resolveStoreDeliveryCost(activeRequest);

    expect(storeDeliveryValue).toBe(12.0);
    expect(storeDeliveryValue).not.toBe(8.0);
  });

  it("quando credit_cost estiver zerado e houver distance_km + config do admin, deve calcular Saída + KM antes de recorrer a driver_fee", () => {
    const adminConfig = {
      base_fee: 5.4,
      fee_per_km: 1.7,
      dynamic_pricing_enabled: false,
      dynamic_fee_per_km: 0,
      round_km_up: false,
    };

    const reqWithoutCreditCost = {
      id: "req-43km",
      status: "pending",
      credit_cost: 0,
      distance_km: 4.3,
      driver_fee: 12.46, // valor líquido do motorista com desconto
    };

    const storeVal = resolveStoreDeliveryCost(reqWithoutCreditCost, adminConfig);
    expect(storeVal).toBe(12.71);
    expect(storeVal).not.toBe(12.46);
  });

  it("deve recorrer a delivery_price ou driver_fee apenas se credit_cost e distance_km estiverem ausentes", () => {
    const legacyRequestWithPrice = {
      id: "req-legacy-1",
      status: "pending",
      credit_cost: 0,
      delivery_price: 9.5,
      driver_fee: 6.0,
    };

    expect(resolveStoreDeliveryCost(legacyRequestWithPrice)).toBe(9.5);

    const legacyRequestWithDriverFeeOnly = {
      id: "req-legacy-2",
      status: "pending",
      credit_cost: 0,
      driver_fee: 7.0,
    };

    expect(resolveStoreDeliveryCost(legacyRequestWithDriverFeeOnly)).toBe(7.0);
  });

  it("deve cumprir rigorosamente Saída + KM para todas as distâncias inclusive com base_fee = 0", () => {
    const zeroBaseConfig = { base_fee: 0, fee_per_km: 2.0, round_km_up: false };
    const fare = calculateDeliveryFare(4.3, zeroBaseConfig);
    expect(fare.baseFee).toBe(0);
    expect(fare.kmCost).toBe(8.6);
    expect(fare.totalCost).toBe(8.6);

    const standardConfig = { base_fee: 5.4, fee_per_km: 1.7, round_km_up: false };
    for (const [km, expected] of [
      [0.5, 6.25],
      [1.0, 7.1],
      [2.5, 9.65],
      [4.3, 12.71],
      [7.8, 18.66],
    ]) {
      expect(calculateDeliveryFare(km, standardConfig).totalCost).toBe(expected);
    }
  });
});
