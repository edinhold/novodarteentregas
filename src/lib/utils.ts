import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeFormatTime(dateVal: any): string {
  if (!dateVal) return "";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function safeFormatDateTime(dateVal: any): string {
  if (!dateVal) return "";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR");
  } catch {
    return "";
  }
}

export function isFutureDate(dateVal: any): boolean {
  if (!dateVal) return false;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return false;
    return d.getTime() > Date.now();
  } catch {
    return false;
  }
}
