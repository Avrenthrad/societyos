/**
 * Money is stored in minor units (cents) as whole numbers, so adding up a
 * year of coffees never drifts by a cent. Negative is money out.
 */

export const DEFAULT_CURRENCY = "AUD";

/**
 * Read an amount the way people and banks write it: "4.50", "$1,234.56",
 * "-12", "(12.00)" (accounting negative), "12.00 CR", "12.00 DR", "1.234,56".
 * Returns minor units, or undefined if it is not a number.
 */
export function parseAmount(raw: string): number | undefined {
  let s = raw.trim();
  if (!s) return undefined;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\bDR\b/i.test(s)) sign = -1;
  s = s.replace(/\b(CR|DR)\b/gi, "").replace(/[A-Z]{3}/g, "").replace(/[$€£¥\s]/g, "");
  if (s.startsWith("-")) {
    sign = -sign;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    sign = -sign;
    s = s.slice(0, -1);
  }
  // "1.234,56" (European) -> "1234.56"; "1,234.56" -> "1234.56"
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return undefined;
  return sign * Math.round(Number(s) * 100);
}

const formatters = new Map<string, Intl.NumberFormat>();

/** "$4.50", "-$1,234.00". `signed` adds "+" to money in. */
export function formatMoney(minor: number, currency = DEFAULT_CURRENCY, opts: { signed?: boolean } = {}): string {
  let f = formatters.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-AU", { style: "currency", currency });
    } catch {
      f = new Intl.NumberFormat("en-AU", { style: "currency", currency: DEFAULT_CURRENCY });
    }
    formatters.set(currency, f);
  }
  const text = f.format(Math.abs(minor) / 100);
  if (minor < 0) return `-${text}`;
  return opts.signed && minor > 0 ? `+${text}` : text;
}
