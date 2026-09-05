/**
 * Configuração da Mapbox Geocoding API v6.
 * A Mapbox é usada EXCLUSIVAMENTE para geocodificação (forward/reverse).
 * A exibição do mapa continua sendo responsabilidade da biblioteca de mapas atual.
 */

export const MAPBOX_ACCESS_TOKEN: string =
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ?? "";

/** Mensagem exibida ao usuário quando o token não está configurado. */
export const MAPBOX_TOKEN_MISSING_MESSAGE =
  "O serviço de localização não está configurado.";

/** True quando existe um token público válido (pk.*). */
export function hasMapboxToken(): boolean {
  return MAPBOX_ACCESS_TOKEN.trim().length > 0;
}

/**
 * Garante que o token existe antes de qualquer requisição.
 * Nunca registra nem expõe o valor do token.
 */
export function assertMapboxToken(): string {
  const token = MAPBOX_ACCESS_TOKEN.trim();
  if (!token) {
    throw new Error("Mapbox access token não configurado");
  }
  if (token.startsWith("sk.")) {
    throw new Error("Mapbox access token inválido: use um token público (pk.)");
  }
  return token;
}

/** Endpoints oficiais da Geocoding API v6. */
export const MAPBOX_GEOCODE_FORWARD_URL =
  "https://api.mapbox.com/search/geocode/v6/forward";
export const MAPBOX_GEOCODE_REVERSE_URL =
  "https://api.mapbox.com/search/geocode/v6/reverse";

/** Timeout padrão das requisições de geocodificação (ms). */
export const MAPBOX_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Armazenamento permanente de resultados da Mapbox.
 * Só pode virar `true` após validação do plano contratado e dos termos de uso.
 */
export const MAPBOX_PERMANENT_GEOCODING_ENABLED = false;
