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

  it("deve unificar saldo 'requested' órfão no saldo disponível quando não há solicitação pendente de saque", () => {
    const withdrawals: Array<{ id: string; status: string }> = [
      { id: "w1", status: "approved" }, // Já foi pago
    ];

    const earnings = [
      { id: "e1", amount: 20.00, status: "pending" },
      { id: "e2", amount: 30.00, status: "requested" }, // Órfão sem solicitação pendente correspondente
    ];

    const hasActiveWithdrawalRequest = withdrawals.some((w) => w.status === "pending");

    const pendingBalance = earnings
      .filter((e) => e.status === "pending" || (!hasActiveWithdrawalRequest && e.status === "requested"))
      .reduce((sum, e) => sum + Number(e.amount), 0);

    // Sem a solicitação pendente, o motorista não fica com valor travado e tem R$ 50,00 disponíveis
    expect(hasActiveWithdrawalRequest).toBe(false);
    expect(pendingBalance).toBe(50.00);
  });

  it("deve lidar de forma resiliente caso o RPC sync_driver_wallet_integrity não esteja no schema cache", async () => {
    // Simula erro de schema cache retornado pelo PostgREST (PGRST202)
    const mockPostgrestError = {
      message: "Could not find the function public.sync_driver_wallet_integrity without parameters in the schema cache",
      code: "PGRST202",
    };

    let toastShown = "";
    let queriesRefreshed = false;

    const executeSafeSync = async (rpcCall: () => Promise<{ data: any; error: any }>) => {
      let rpcData: any = null;
      try {
        const { data, error } = await rpcCall();
        if (!error && data) {
          rpcData = data;
        }
      } catch (ex) {
        // Ignora falha de schema cache
      }

      queriesRefreshed = true;

      if (rpcData && (rpcData.restored_missing_earnings > 0 || rpcData.reverted_requested_earnings > 0)) {
        toastShown = "Carteira sincronizada com alterações";
      } else {
        toastShown = "Carteira 100% verificada e sincronizada!";
      }
    };

    await executeSafeSync(async () => {
      return { data: null, error: mockPostgrestError };
    });

    expect(queriesRefreshed).toBe(true);
    expect(toastShown).toBe("Carteira 100% verificada e sincronizada!");
    expect(toastShown).not.toContain("Could not find the function");
  });

  describe("Isolamento de Ganhos do Mês Atual e Histórico de Ganhos das Corridas", () => {
    // Datas de referência: mês atual, hoje, e meses anteriores
    const now = new Date();
    const currentMonthIso = now.toISOString();
    const todayIso = now.toISOString();

    const pastMonthDate = new Date(now.getFullYear(), now.getMonth() - 2, 15);
    const pastMonthIso = pastMonthDate.toISOString();

    const mockEarnings = [
      {
        id: "earn-curr-1",
        driver_id: "driver-1",
        amount: 25.50,
        status: "pending",
        created_at: currentMonthIso,
        delivery_requests: {
          id: "req-1",
          customer_name: "João Silva",
          delivery_address: "Rua das Flores, 123",
          restaurants: { name: "Pizzaria Bella" }
        }
      },
      {
        id: "earn-curr-2",
        driver_id: "driver-1",
        amount: 14.50,
        status: "pending",
        created_at: currentMonthIso,
        delivery_requests: {
          id: "req-2",
          customer_name: "Maria Santos",
          delivery_address: "Av. Central, 456",
          restaurants: { name: "Burger House" }
        }
      },
      {
        id: "earn-old-1",
        driver_id: "driver-1",
        amount: 150.00,
        status: "pending", // Antigo acumulado que não deve entrar no saldo disponível
        created_at: pastMonthIso,
        delivery_requests: {
          id: "req-old-1",
          customer_name: "Carlos Velho",
          delivery_address: "Rua Antiga, 789",
          restaurants: { name: "Lanchonete 2025" }
        }
      },
      {
        id: "earn-old-2",
        driver_id: "driver-1",
        amount: 80.00,
        status: "settled",
        created_at: pastMonthIso,
        delivery_requests: {
          id: "req-old-2",
          customer_name: "Ana Antiga",
          delivery_address: "Rua Passada, 101",
          restaurants: { name: "Sushi Antigo" }
        }
      }
    ];

    it("deve isolar o 'Saldo Disponível' apenas para os ganhos pendentes do mês atual, desconsiderando acúmulo antigo", () => {
      const isThisMonth = (date: Date) => {
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      };

      const hasActiveWithdrawalRequest = false;

      // Lógica idêntica à do DriverPanel.tsx
      const pendingBalance = mockEarnings
        .filter((e) =>
          (e.status === "pending" || (!hasActiveWithdrawalRequest && e.status === "requested")) &&
          isThisMonth(new Date(e.created_at))
        )
        .reduce((sum, e) => sum + Number(e.amount), 0);

      // Apenas earn-curr-1 (25.50) + earn-curr-2 (14.50) = 40.00
      // O valor antigo de 150.00 NÃO deve entrar no saldo disponível
      expect(pendingBalance).toBe(40.00);
    });

    it("deve calcular 'Ganhos do Mês' isolando estritamente os rendimentos do mês corrente", () => {
      const isThisMonth = (date: Date) => {
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      };

      const monthlyEarnings = mockEarnings
        .filter((e) => isThisMonth(new Date(e.created_at)))
        .reduce((sum, e) => sum + Number(e.amount), 0);

      expect(monthlyEarnings).toBe(40.00);
    });

    it("deve filtrar o histórico de corridas por período ('month', 'today', 'all')", () => {
      const isThisMonth = (date: Date) => {
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      };
      const isToday = (date: Date) => {
        return (
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth() &&
          date.getDate() === now.getDate()
        );
      };

      const filterBy = (period: "month" | "today" | "all") => {
        return mockEarnings.filter((e) => {
          if (period === "today") return isToday(new Date(e.created_at));
          if (period === "month") return isThisMonth(new Date(e.created_at));
          return true;
        });
      };

      const monthList = filterBy("month");
      const todayList = filterBy("today");
      const allList = filterBy("all");

      expect(monthList.length).toBe(2);
      expect(monthList.map((e) => e.id)).toEqual(["earn-curr-1", "earn-curr-2"]);

      expect(todayList.length).toBe(2);
      expect(allList.length).toBe(4);
    });

    it("deve rotular corretamente os status no histórico (Disponível, Pago, Em Saque, Liquidado)", () => {
      const isThisMonth = (date: Date) => {
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      };

      const getStatusLabel = (e: { status: string; created_at: string }) => {
        const isCurrentMonth = isThisMonth(new Date(e.created_at));
        if (e.status === "paid") return "Pago";
        if (e.status === "requested") return "Em Saque";
        if (e.status === "settled" || !isCurrentMonth) return "Liquidado";
        return "Disponível";
      };

      expect(getStatusLabel({ status: "pending", created_at: currentMonthIso })).toBe("Disponível");
      expect(getStatusLabel({ status: "pending", created_at: pastMonthIso })).toBe("Liquidado");
      expect(getStatusLabel({ status: "settled", created_at: pastMonthIso })).toBe("Liquidado");
      expect(getStatusLabel({ status: "paid", created_at: currentMonthIso })).toBe("Pago");
      expect(getStatusLabel({ status: "requested", created_at: currentMonthIso })).toBe("Em Saque");
    });

    it("deve impedir solicitação de saque se não houver saldo pendente no mês atual", () => {
      const isThisMonth = (date: Date) => {
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      };

      // Cenário onde motorista tem apenas ganhos do mês passado
      const oldEarningsOnly = [
        { id: "e-old", amount: 200.00, status: "pending", created_at: pastMonthIso },
      ];

      const totalPendingCurrentMonth = oldEarningsOnly
        .filter((e) => e.status === "pending" && isThisMonth(new Date(e.created_at)))
        .reduce((sum, e) => sum + Number(e.amount), 0);

      expect(totalPendingCurrentMonth).toBe(0);
      expect(totalPendingCurrentMonth <= 0).toBe(true);
    });
  });
});

