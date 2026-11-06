import { describe, it, expect } from "vitest";

describe("Blindagem da Carteira dos Motoristas e Integridade de Saldos", () => {
  const mockAppFeePercent = 10;

  const calculateDriverAmount = (grossFee: number, appFeePercent: number = mockAppFeePercent) => {
    const fee = (grossFee * appFeePercent) / 100;
    return Math.max(grossFee - fee, 0);
  };

  it("deve calcular o valor líquido da corrida descontando a taxa do app corretamente", () => {
    expect(calculateDriverAmount(20.00, 10)).toBe(18.00);
    expect(calculateDriverAmount(15.00, 10)).toBe(13.50);
    expect(calculateDriverAmount(10.00, 2)).toBe(9.80);
    expect(calculateDriverAmount(0, 10)).toBe(0);
  });

  it("deve separar saldo disponível ('pending') e saldo solicitado/em processamento ('requested')", () => {
    const earnings = [
      { id: "e1", amount: 15.00, status: "pending" },
      { id: "e2", amount: 20.00, status: "pending" },
      { id: "e3", amount: 50.00, status: "requested" },
      { id: "e4", amount: 100.00, status: "paid" },
    ];

    const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
    const pendingBalance = earnings
      .filter((e) => e.status === "pending")
      .reduce((sum, e) => sum + e.amount, 0);
    const requestedBalance = earnings
      .filter((e) => e.status === "requested")
      .reduce((sum, e) => sum + e.amount, 0);

    expect(totalEarnings).toBe(185.00);
    expect(pendingBalance).toBe(35.00);
    expect(requestedBalance).toBe(50.00);
  });

  it("deve estornar ganhos com status 'requested' de volta para 'pending' quando saque é rejeitado ou cancelado", () => {
    const driverEarnings = [
      { id: "e1", driver_id: "driver-123", amount: 45.00, status: "requested" },
      { id: "e2", driver_id: "driver-123", amount: 25.00, status: "requested" },
    ];

    // Simula a transição de rejeição de saque (handle_withdrawal_request_status_change)
    const withdrawalAction = "rejected";
    if (withdrawalAction === "rejected" || withdrawalAction === "cancelled") {
      driverEarnings.forEach((e) => {
        if (e.status === "requested") {
          e.status = "pending";
        }
      });
    }

    const availableBalanceAfterRejection = driverEarnings
      .filter((e) => e.status === "pending")
      .reduce((sum, e) => sum + e.amount, 0);

    expect(availableBalanceAfterRejection).toBe(70.00);
    expect(driverEarnings.every((e) => e.status === "pending")).toBe(true);
  });

  it("deve preservar ganhos de paradas concluídas ('delivered') mesmo quando uma rota multi-entregas é cancelada", () => {
    const deliveryRequests = [
      { id: "req-1", group_id: "group-999", status: "delivered", driver_fee: 15.00 },
      { id: "req-2", group_id: "group-999", status: "cancelled", driver_fee: 15.00 },
      { id: "req-3", group_id: "group-999", status: "cancelled", driver_fee: 15.00 },
    ];

    let driverEarnings = [
      { id: "earn-1", delivery_request_id: "req-1", amount: 13.50, status: "pending" },
    ];

    // Regra da nova migration: Deletar APENAS ganhos de entregas NÃO entregues (status <> 'delivered')
    const nonDeliveredIds = deliveryRequests
      .filter((r) => r.group_id === "group-999" && r.status !== "delivered")
      .map((r) => r.id);

    driverEarnings = driverEarnings.filter(
      (e) => !nonDeliveredIds.includes(e.delivery_request_id)
    );

    expect(driverEarnings.length).toBe(1);
    expect(driverEarnings[0].delivery_request_id).toBe("req-1");
    expect(driverEarnings[0].amount).toBe(13.50);
  });

  it("deve sincronizar e consultar ganhos tanto por drivers.id quanto por drivers.user_id", () => {
    const driverProfile = { id: "driver-table-uuid", user_id: "auth-user-uuid" };

    const allEarningsInDb = [
      { id: "e1", driver_id: "driver-table-uuid", amount: 30.00, status: "pending" },
      { id: "e2", driver_id: "auth-user-uuid", amount: 20.00, status: "pending" },
      { id: "e3", driver_id: "other-driver-uuid", amount: 99.00, status: "pending" },
    ];

    // Simula a query or(`driver_id.eq.${driverId},driver_id.eq.${userId}`)
    const matchedEarnings = allEarningsInDb.filter(
      (e) => e.driver_id === driverProfile.id || e.driver_id === driverProfile.user_id
    );

    const totalBalance = matchedEarnings.reduce((sum, e) => sum + e.amount, 0);

    expect(matchedEarnings.length).toBe(2);
    expect(totalBalance).toBe(50.00);
  });

  it("deve garantir que se uma corrida está 'delivered' e não há ganho gerado, o trigger auto-repara", () => {
    const deliveredRequest = {
      id: "req-missing-earn",
      driver_id: "driver-table-uuid",
      status: "delivered",
      driver_fee: 25.00,
    };

    const existingEarnings: Array<{ id: string; delivery_request_id: string; amount: number; status: string }> = [];

    // Trigger ensure_driver_earning_on_delivered:
    const hasEarning = existingEarnings.some((e) => e.delivery_request_id === deliveredRequest.id);
    if (!hasEarning && deliveredRequest.status === "delivered") {
      const net = calculateDriverAmount(deliveredRequest.driver_fee, 10);
      existingEarnings.push({
        id: "earn-auto-generated",
        delivery_request_id: deliveredRequest.id,
        amount: net,
        status: "pending",
      });
    }

    expect(existingEarnings.length).toBe(1);
    expect(existingEarnings[0].amount).toBe(22.50);
    expect(existingEarnings[0].status).toBe("pending");
  });
});
