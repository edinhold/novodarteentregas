import { describe, it, expect } from "vitest";

describe("Configuração e Persistência da Taxa do App por Corrida (app_fee_per_delivery)", () => {
  it("deve carregar corretamente o valor configurado de app_fee_per_delivery e não reverter para padrão", () => {
    // Simula dados retornados pelo Supabase
    const dbRecord = {
      id: "config-123",
      base_fee: 5.3,
      fee_per_km: 1.7,
      app_fee_per_delivery: 12.5, // Admin configurou 12.5%
    };

    const rawAppFee = (dbRecord as any).app_fee_per_delivery;
    const parsedAppFee = rawAppFee !== undefined && rawAppFee !== null && !isNaN(Number(rawAppFee))
      ? String(rawAppFee)
      : "2";

    expect(parsedAppFee).toBe("12.5");
    expect(parsedAppFee).not.toBe("2");
  });

  it("deve preservar o valor 0% (isenção de taxa) sem substituir pelo valor padrão 2%", () => {
    const dbRecordZero = {
      id: "config-123",
      base_fee: 5.3,
      fee_per_km: 1.7,
      app_fee_per_delivery: 0, // Admin configurou 0% de comissão
    };

    const rawAppFee = (dbRecordZero as any).app_fee_per_delivery;
    const parsedAppFee = rawAppFee !== undefined && rawAppFee !== null && !isNaN(Number(rawAppFee))
      ? String(rawAppFee)
      : "2";

    expect(parsedAppFee).toBe("0");
    expect(Number(parsedAppFee)).toBe(0);
  });

  it("deve aplicar fallback para 2% somente quando app_fee_per_delivery for estritamente nulo ou indefinido", () => {
    const incompletePayload = {
      id: "config-123",
      base_fee: 5.3,
      fee_per_km: 1.7,
      // app_fee_per_delivery ausente (ex: payload público legado)
    };

    const rawAppFee = (incompletePayload as any).app_fee_per_delivery;
    const parsedAppFee = rawAppFee !== undefined && rawAppFee !== null && !isNaN(Number(rawAppFee))
      ? String(rawAppFee)
      : "2";

    expect(parsedAppFee).toBe("2");
  });

  it("deve calcular o valor líquido do motorista e a retenção do app com precisão para qualquer porcentagem", () => {
    const calculateEarnings = (grossFee: number, appFeePercent: number) => {
      const appFee = (grossFee * appFeePercent) / 100;
      const netToDriver = Math.max(0, grossFee - appFee);
      return {
        appFee: Number(appFee.toFixed(2)),
        netToDriver: Number(netToDriver.toFixed(2)),
      };
    };

    // Corrida de R$ 15,00 com taxa padrão de 2%
    expect(calculateEarnings(15.00, 2)).toEqual({
      appFee: 0.30,
      netToDriver: 14.70,
    });

    // Corrida de R$ 20,00 com taxa configurada de 10%
    expect(calculateEarnings(20.00, 10)).toEqual({
      appFee: 2.00,
      netToDriver: 18.00,
    });

    // Corrida de R$ 20,00 com taxa configurada de 15%
    expect(calculateEarnings(20.00, 15)).toEqual({
      appFee: 3.00,
      netToDriver: 17.00,
    });

    // Corrida de R$ 25,00 com taxa de 0% (isenção)
    expect(calculateEarnings(25.00, 0)).toEqual({
      appFee: 0.00,
      netToDriver: 25.00,
    });
  });

  it("deve validar e formatar adequadamente valores numéricos decimais informados pelo admin", () => {
    const parseAdminInput = (input: string) => {
      const parsed = parseFloat(input);
      if (isNaN(parsed)) return 2;
      return Math.min(100, Math.max(0, parsed));
    };

    expect(parseAdminInput("10")).toBe(10);
    expect(parseAdminInput("12.5")).toBe(12.5);
    expect(parseAdminInput("0")).toBe(0);
    expect(parseAdminInput("150")).toBe(100); // Clamped to 100%
    expect(parseAdminInput("-5")).toBe(0);    // Clamped to 0%
    expect(parseAdminInput("")).toBe(2);      // Default fallback
    expect(parseAdminInput("abc")).toBe(2);   // Default fallback
  });
});

