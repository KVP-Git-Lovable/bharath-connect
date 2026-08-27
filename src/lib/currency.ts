// Locale-aware currency formatting helpers.
// Currency code drives symbol/format. Numeric value stays untouched so sorting/filtering
// continues to work on the raw number.

const INR_LIKE = new Set(["INR"]);

export function formatCurrency(
  amount: number | null | undefined,
  currencyCode?: string | null,
): string {
  const value = Number(amount || 0);
  const code = (currencyCode || "INR").toUpperCase();
  const locale = INR_LIKE.has(code) ? "en-IN" : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}

const SYMBOLS: Record<string, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "د.إ",
  AUD: "A$", CAD: "C$", SGD: "S$", JPY: "¥", CNY: "¥",
};

export function currencySymbolFor(code?: string | null): string {
  const c = (code || "INR").toUpperCase();
  if (SYMBOLS[c]) return SYMBOLS[c];
  try {
    const parts = new Intl.NumberFormat("en", { style: "currency", currency: c })
      .formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? c;
  } catch {
    return c;
  }
}

// Compact display (e.g. ₹1.2Cr / $1.2M) — for tight KPI cells.
export function formatCurrencyCompact(
  amount: number | null | undefined,
  currencyCode?: string | null,
): string {
  const value = Number(amount || 0);
  const code = (currencyCode || "INR").toUpperCase();
  const sym = currencySymbolFor(code);
  if (code === "INR") {
    if (value >= 1e7) return `${sym}${(value / 1e7).toFixed(1)}Cr`;
    if (value >= 1e5) return `${sym}${(value / 1e5).toFixed(1)}L`;
    if (value >= 1e3) return `${sym}${(value / 1e3).toFixed(1)}k`;
    return `${sym}${value.toLocaleString("en-IN")}`;
  }
  if (value >= 1e9) return `${sym}${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${sym}${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${sym}${(value / 1e3).toFixed(1)}k`;
  return `${sym}${value.toLocaleString("en-US")}`;
}

// Group amounts by currency for mixed-currency aggregate KPIs.
export function sumByCurrency<T>(
  rows: T[],
  amountKey: (r: T) => number,
  currencyKey: (r: T) => string | null | undefined,
): { code: string; total: number }[] {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    const code = (currencyKey(r) || "INR").toUpperCase();
    map.set(code, (map.get(code) ?? 0) + Number(amountKey(r) || 0));
  });
  return Array.from(map, ([code, total]) => ({ code, total }))
    .sort((a, b) => b.total - a.total);
}

export function formatMixedCurrencyTotals(
  groups: { code: string; total: number }[],
  compact = true,
): string {
  if (groups.length === 0) return formatCurrencyCompact(0, "INR");
  const fmt = compact ? formatCurrencyCompact : formatCurrency;
  return groups.map((g) => fmt(g.total, g.code)).join(" · ");
}
