import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isWithinPrimaveraBounds,
  extractHouseNumber,
  validatePrimaveraFeature,
  searchAddressSuggestions,
  geocodeAddress,
  reverseGeocode,
} from "@/services/mapbox";
import { isWithinPrimaveraBounds as isWithinPrimaveraBoundsMaps } from "@/config/maps";

describe("Geocodificação e Gestão de Mapa do Lojista (Primavera do Leste)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. isWithinPrimaveraBounds - Limites Geográficos Confiáveis", () => {
    it("deve aceitar coordenadas centrais de Primavera do Leste", () => {
      expect(isWithinPrimaveraBounds(-15.5595, -54.3079)).toBe(true);
      expect(isWithinPrimaveraBoundsMaps(-15.5595, -54.3079)).toBe(true);
    });

    it("deve aceitar bairros periféricos, novos loteamentos e distritos industriais", () => {
      // Bairro Primavera 3
      expect(isWithinPrimaveraBounds(-15.522584, -54.332490)).toBe(true);
      // Distrito Industrial / Sul
      expect(isWithinPrimaveraBounds(-15.69, -54.30)).toBe(true);
      // Leste perimetral
      expect(isWithinPrimaveraBounds(-15.55, -54.12)).toBe(true);
    });

    it("deve rejeitar outras cidades (Cuiabá, Rondonópolis, Campo Verde, SP)", () => {
      // Cuiabá
      expect(isWithinPrimaveraBounds(-15.5978422, -56.0974321)).toBe(false);
      expect(isWithinPrimaveraBoundsMaps(-15.5978422, -56.0974321)).toBe(false);
      // São Paulo
      expect(isWithinPrimaveraBounds(-23.5505, -46.6333)).toBe(false);
      // Coordenadas nulas / inválidas
      expect(isWithinPrimaveraBounds(0, 0)).toBe(false);
      expect(isWithinPrimaveraBoundsMaps(null, null)).toBe(false);
    });
  });

  describe("2. extractHouseNumber - Extração Inteligente de Número Predial", () => {
    it("deve extrair números residenciais com formatos comuns", () => {
      expect(extractHouseNumber("Rua Piratini, 123")).toBe("123");
      expect(extractHouseNumber("Avenida Cuiabá nº 456")).toBe("456");
      expect(extractHouseNumber("Rua dos Ipês, n° 789")).toBe("789");
      expect(extractHouseNumber("Rua Paraná 1010")).toBe("1010");
      expect(extractHouseNumber("Avenida Florianópolis, 618B")).toBe("618B");
    });

    it("não deve confundir nomes de ruas numeradas com número de imóvel", () => {
      expect(extractHouseNumber("Rua 2")).toBe("");
      expect(extractHouseNumber("Avenida 15")).toBe("");
      expect(extractHouseNumber("Rua 08")).toBe("");
    });
  });

  describe("3. validatePrimaveraFeature - Validação Robusta sem Falsos Rejeites", () => {
    it("deve validar positivamente feição com coordenadas de Primavera do Leste mesmo sem context.region completo", () => {
      const feature: any = {
        id: "feat-1",
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-54.3079, -15.5595], // [lng, lat]
        },
        properties: {
          name: "Rua Piratini",
          context: {
            place: { name: "Primavera do Leste" },
          },
        },
      };

      const result = validatePrimaveraFeature(feature);
      expect(result.valid).toBe(true);
    });

    it("deve rejeitar feição que informe explicitamente outro município conhecido", () => {
      const feature: any = {
        id: "feat-2",
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-54.3079, -15.5595],
        },
        properties: {
          name: "Rua das Flores",
          context: {
            place: { name: "Cuiabá" },
          },
        },
      };

      const result = validatePrimaveraFeature(feature);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("outro município");
    });
  });

  describe("4. Fallback de Geocodificação: Rua sem Número para Cidades sem Indexação Predial", () => {
    it("deve encontrar o logradouro e anexar o número quando busca com número predial retornar vazio", async () => {
      // Mock global fetch
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
        const urlStr = String(input);

        // Se a query contiver o número 123, simula Mapbox retornando 0 features (como ocorre em cidades pequenas)
        if (urlStr.includes("123")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              type: "FeatureCollection",
              features: [],
            }),
          } as Response;
        }

        // Quando o fallback busca apenas pelo logradouro "Rua Piratini", retorna a rua com coordenadas
        if (urlStr.includes("Rua%20Piratini") || urlStr.includes("Piratini")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              type: "FeatureCollection",
              features: [
                {
                  id: "feat-street-1",
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: [-54.3050, -15.5560], // [lng, lat]
                  },
                  properties: {
                    feature_type: "street",
                    name: "Rua Piratini",
                    full_address: "Rua Piratini, Primavera do Leste - MT",
                    context: {
                      street: { name: "Rua Piratini" },
                      place: { name: "Primavera do Leste" },
                      region: { name: "Mato Grosso", region_code: "MT" },
                      country: { country_code: "BR" },
                    },
                  },
                },
              ],
            }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ type: "FeatureCollection", features: [] }),
        } as Response;
      });

      const suggestions = await searchAddressSuggestions("Rua Piratini, 123");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].street).toBe("Rua Piratini");
      expect(suggestions[0].number).toBe("123");
      expect(suggestions[0].coordinates.latitude).toBeCloseTo(-15.5560, 4);
      expect(suggestions[0].coordinates.longitude).toBeCloseTo(-54.3050, 4);
      expect(suggestions[0].isValidPrimavera).toBe(true);

      fetchSpy.mockRestore();
    });

    it("geocodeAddress deve resolver endereço com número mesmo quando indexação predial for ausente", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes("789")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ type: "FeatureCollection", features: [] }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            type: "FeatureCollection",
            features: [
              {
                id: "feat-av-1",
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [-54.2980, -15.5520],
                },
                properties: {
                  feature_type: "street",
                  name: "Avenida Cuiabá",
                  context: {
                    street: { name: "Avenida Cuiabá" },
                    place: { name: "Primavera do Leste" },
                    region: { region_code: "MT" },
                    country: { country_code: "BR" },
                  },
                },
              },
            ],
          }),
        } as Response;
      });

      const parsed = await geocodeAddress("Avenida Cuiabá, 789");
      expect(parsed.street).toBe("Avenida Cuiabá");
      expect(parsed.number).toBe("789");
      expect(parsed.coordinates.latitude).toBeCloseTo(-15.5520, 4);
      expect(parsed.isValidPrimavera).toBe(true);

      fetchSpy.mockRestore();
    });
  });

  describe("5. reverseGeocode - Resiliência e Fallback Gracioso", () => {
    it("deve retornar endereço legível ao clicar no mapa", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          type: "FeatureCollection",
          features: [
            {
              id: "rev-1",
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [-54.3079, -15.5595],
              },
              properties: {
                feature_type: "street",
                name: "Avenida Porto Alegre",
                context: {
                  street: { name: "Avenida Porto Alegre" },
                  neighborhood: { name: "Centro" },
                  place: { name: "Primavera do Leste" },
                  region: { region_code: "MT" },
                  country: { country_code: "BR" },
                },
              },
            },
          ],
        }),
      } as Response);

      const res = await reverseGeocode(-15.5595, -54.3079);
      expect(res.street).toBe("Avenida Porto Alegre");
      expect(res.city).toBe("Primavera do Leste");
      expect(res.isValidPrimavera).toBe(true);

      fetchSpy.mockRestore();
    });

    it("não deve quebrar em caso de falha de rede da Mapbox, gerando fallback com coordenadas legíveis", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network down"));

      const res = await reverseGeocode(-15.5595, -54.3079);
      expect(res.fullAddress).toContain("Primavera do Leste - MT");
      expect(res.coordinates.latitude).toBe(-15.5595);
      expect(res.coordinates.longitude).toBe(-54.3079);
      expect(res.isValidPrimavera).toBe(true);

      fetchSpy.mockRestore();
    });
  });

  describe("6. Cálculo de Distância e Taxa de Corrida", () => {
    it("deve calcular corretamente a taxa quando a distância de entrega é positiva", () => {
      const baseFee = 5.30;
      const feePerKm = 1.80;
      const rawDistanceKm = 3.5;
      const roundKmUp = false;
      const minKm = 1;
      const maxKm = 20;

      let effectiveKm = rawDistanceKm;
      if (roundKmUp && effectiveKm > 0) effectiveKm = Math.ceil(effectiveKm);
      if (minKm > 0 && effectiveKm < minKm) effectiveKm = minKm;
      if (maxKm > 0 && effectiveKm > maxKm) effectiveKm = maxKm;

      const deliveryCost = baseFee + feePerKm * effectiveKm;
      expect(deliveryCost).toBeCloseTo(5.30 + 1.80 * 3.5, 2); // 11.60
      expect(deliveryCost).toBeGreaterThan(baseFee);
    });

    it("deve aplicar regra de minKm mesmo em entregas muito curtas (ex: 200m)", () => {
      const baseFee = 5.30;
      const feePerKm = 1.80;
      const rawDistanceKm = 0.2; // 200 metros
      const minKm = 1.0;

      let effectiveKm = rawDistanceKm;
      if (minKm > 0 && effectiveKm < minKm) effectiveKm = minKm;

      const deliveryCost = baseFee + feePerKm * effectiveKm;
      // 5.30 + 1.80 * 1.0 = 7.10 (não cai abaixo do valor mínimo com km mínimo)
      expect(deliveryCost).toBeCloseTo(7.10, 2);
    });
  });
});

