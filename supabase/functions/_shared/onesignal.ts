export const ANDROID_CHANNEL_ID = "novas_entregas_v1";

export class PushError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function mask(value?: string | null): string {
  if (!value) return "";
  return value.length <= 8 ? "***" : `***${value.slice(-8)}`;
}

export function humanize(code?: string): string {
  switch (code) {
    case "NAO_AUTENTICADO": return "Sessão expirada. Entre novamente.";
    case "SEM_MOTORISTAS_ONLINE": return "Nenhum motorista online e disponível no momento.";
    case "SEM_INSCRICOES": return "Os motoristas online não possuem dispositivos com notificações ativas.";
    case "PEDIDO_INDISPONIVEL": return "O pedido já foi aceito ou cancelado.";
    default: return "Notificação processada internamente.";
  }
}
