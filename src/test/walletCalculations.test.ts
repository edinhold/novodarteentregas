import { describe, it, expect } from "vitest";
import { parseBRLToNumber, formatCurrency } from "../utils/financialCalculations";

describe("Ajuste de Carteira do Motorista - Conversão e Formatação de Moeda", () => {
  it("deve converter corretamente os valores requeridos no teste", () => {
    expect(parseBRLToNumber("1,00")).toBe(1.00);
    expect(parseBRLToNumber("10,50")).toBe(10.50);
    expect(parseBRLToNumber("100,00")).toBe(100.00);
    expect(parseBRLToNumber("1.250,75")).toBe(1250.75);
    expect(parseBRLToNumber("0,01")).toBe(0.01);
  });

  it("deve converter strings com prefixo R$, espaços e pontos de milhar", () => {
    expect(parseBRLToNumber("R$ 1.250,75")).toBe(1250.75);
    expect(parseBRLToNumber("R$ 50,50")).toBe(50.50);
    expect(parseBRLToNumber("1250,75")).toBe(1250.75);
    expect(parseBRLToNumber("1250.75")).toBe(1250.75);
    expect(parseBRLToNumber("50")).toBe(50.00);
  });

  it("deve tratar valores nulos, indefinição e strings vazias com segurança", () => {
    expect(parseBRLToNumber(null)).toBe(0);
    expect(parseBRLToNumber(undefined)).toBe(0);
    expect(parseBRLToNumber("")).toBe(0);
    expect(parseBRLToNumber("abc")).toBe(0);
  });

  it("deve formatar valores numéricos em BRL corretamente", () => {
    expect(formatCurrency(1.00)).toContain("1,00");
    expect(formatCurrency(10.50)).toContain("10,50");
    expect(formatCurrency(100.00)).toContain("100,00");
    expect(formatCurrency(1250.75)).toContain("1.250,75");
    expect(formatCurrency(0.01)).toContain("0,01");
  });
});
