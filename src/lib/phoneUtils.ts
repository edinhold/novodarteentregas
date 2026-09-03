/**
 * Utility functions for Brazilian phone numbers and WhatsApp formatting.
 */

/**
 * Normalizes Brazilian phone numbers for WhatsApp direct URL (wa.me)
 * without modifying the database value.
 */
export function normalizeWhatsAppNumber(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  // If already prefixed with 55 and length 12 or 13 (55 + DDD + 8 or 9 digits)
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  // Standard 10 or 11 digits (DDD + 8 or 9 digits)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

/**
 * Formats a raw phone string into a readable format: (XX) XXXXX-XXXX
 */
export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return "Não informado";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone;
}
