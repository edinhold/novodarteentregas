import { describe, it, expect } from "vitest";
import { detectLocationCategory } from "@/services/mapbox";

describe("detectLocationCategory Precision Tests", () => {
  it("should accurately identify Condominiums and Residential complexes", () => {
    const res1 = detectLocationCategory("Condomínio Cidade Jardim");
    expect(res1.type).toBe("condominium");
    expect(res1.badge).toBe("Condomínio");

    const res2 = detectLocationCategory("Residencial Buritis", "Rua dos Ipês, Parque dos Buritis");
    expect(res2.type).toBe("condominium");

    const res3 = detectLocationCategory("Edifício Portal do Sol");
    expect(res3.type).toBe("condominium");

    const res4 = detectLocationCategory("Rua Apto 302 Bloco B");
    expect(res4.type).toBe("condominium");
  });

  it("should accurately identify Supermarkets, Pharmacies, and Commercial Establishments", () => {
    const res1 = detectLocationCategory("Supermercado Machado");
    expect(res1.type).toBe("commercial");
    expect(res1.badge).toBe("Supermercado / Comércio");

    const res2 = detectLocationCategory("Atacadão Primavera");
    expect(res2.type).toBe("commercial");

    const res3 = detectLocationCategory("Farmácia Drogasil");
    expect(res3.type).toBe("commercial");

    const res4 = detectLocationCategory("Padaria Pão de Mel");
    expect(res4.type).toBe("commercial");
  });

  it("should accurately identify Avenues and Highways", () => {
    const res1 = detectLocationCategory("Avenida Cuiabá");
    expect(res1.type).toBe("avenue");
    expect(res1.badge).toBe("Avenida");

    const res2 = detectLocationCategory("Av. Campo Grande");
    expect(res2.type).toBe("avenue");

    const res3 = detectLocationCategory("Rodovia BR-070");
    expect(res3.type).toBe("avenue");
  });

  it("should accurately identify Streets, Alamedas, and Roads", () => {
    const res1 = detectLocationCategory("Rua Olivério Porta");
    expect(res1.type).toBe("street");
    expect(res1.badge).toBe("Rua");

    const res2 = detectLocationCategory("Travessa dos Pioneiros");
    expect(res2.type).toBe("street");

    const res3 = detectLocationCategory("Alameda das Rosas");
    expect(res3.type).toBe("street");
  });

  it("should accurately identify Neighborhoods", () => {
    const res1 = detectLocationCategory("Bairro Primavera III");
    expect(res1.type).toBe("neighborhood");
    expect(res1.badge).toBe("Bairro");

    const res2 = detectLocationCategory("Jardim Riva");
    expect(res2.type).toBe("neighborhood");
  });
});
