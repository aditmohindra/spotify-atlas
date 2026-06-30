import type { Era } from "@/lib/types";

export function intToRoman(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  let result = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) {
      result += syms[i];
      n -= vals[i];
    }
  }
  return result;
}

export function defaultEraTitle(eraNumber: number): string {
  return `Era ${intToRoman(eraNumber)}`;
}

export function displayTitle(era: Pick<Era, "title" | "era_number">): string {
  return era.title ?? defaultEraTitle(era.era_number);
}

export function formatDateRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return `${fmt(start)} — ${fmt(end)}`;
}

export function dateToMs(iso: string): number {
  return new Date(iso).getTime();
}

export function msToFraction(ms: number, minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return 0;
  return (ms - minMs) / (maxMs - minMs);
}

export function eraDurationDays(start: string, end: string): number {
  return Math.max(1, (dateToMs(end) - dateToMs(start)) / (1000 * 60 * 60 * 24));
}
