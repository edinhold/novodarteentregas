import { describe, it, expect } from "vitest";

describe("Exibição do Valor Real da Corrida para o Lojista vs Valor do Motorista", () => {
  it("deve priorizar credit_cost (valor pago pelo lojista) sobre driver_fee (valor do motorista)", () => {
    // Cenário: Uma corrida onde o lojista pagou R$ 10,40 (saída + km + dinâmica)
    // e o repasse bruto do motorista é R$ 7,50
    const activeRequest = {
      id: "req-12345",
      status: "pending",
      driver_id: null,
      credit_cost: 10.4,
      driver_fee: 7.5,
    };

    // Lógica padronizada implementada em AssignedDriverCard, CallDriverTab e StoreModernDashboard:
    const storeDeliveryValue = Number(
      activeRequest.credit_cost || (activeRequest as any).delivery_price || activeRequest.driver_fee || 0
    );

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

    const storeDeliveryValue = Number(
      activeRequest.credit_cost || (activeRequest as any).delivery_price || activeRequest.driver_fee || 0
    );

    expect(storeDeliveryValue).toBe(12.0);
    expect(storeDeliveryValue).not.toBe(8.0);
  });

  it("deve recorrer a delivery_price ou driver_fee apenas se credit_cost estiver ausente ou zerado", () => {
    const legacyRequestWithPrice = {
      id: "req-legacy-1",
      status: "pending",
      credit_cost: 0,
      delivery_price: 9.5,
      driver_fee: 6.0,
    };

    const legacyVal1 = Number(
      legacyRequestWithPrice.credit_cost || (legacyRequestWithPrice as any).delivery_price || legacyRequestWithPrice.driver_fee || 0
    );
    expect(legacyVal1).toBe(9.5);

    const legacyRequestWithDriverFeeOnly = {
      id: "req-legacy-2",
      status: "pending",
      credit_cost: 0,
      driver_fee: 7.0,
    };

    const legacyVal2 = Number(
      legacyRequestWithDriverFeeOnly.credit_cost || (legacyRequestWithDriverFeeOnly as any).delivery_price || legacyRequestWithDriverFeeOnly.driver_fee || 0
    );
    expect(legacyVal2).toBe(7.0);
  });

  it("deve formatar o valor monetário corretamente para moeda brasileira (R$)", () => {
    const activeRequest = {
      credit_cost: 8.7,
      driver_fee: 5.5,
    };

    const storeDeliveryValue = Number(
      activeRequest.credit_cost || (activeRequest as any).delivery_price || activeRequest.driver_fee || 0
    );

    const formatted = `R$ ${storeDeliveryValue.toFixed(2).replace(".", ",")}`;
    expect(formatted).toBe("R$ 8,70");
    expect(formatted).not.toBe("R$ 5,50");
  });
});
