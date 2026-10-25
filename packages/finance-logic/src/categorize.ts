import type { Transaction } from "@societyos/core";

/**
 * Categories without busywork: the person's own past choices win (fix a
 * category once and every later "WOOLWORTHS 1234 SYDNEY" follows), then a
 * short list of common Australian merchants, then nothing.
 */

export const CATEGORIES = [
  "Groceries",
  "Eating out",
  "Transport",
  "Bills",
  "Home",
  "Shopping",
  "Health",
  "Fun",
  "Travel",
  "Income",
  "Transfers",
  "Other",
] as const;

const RULES: [string, RegExp][] = [
  ["Groceries", /\b(woolworths|woolies|coles|aldi|iga|harris farm|foodworks|costco|supermarket|grocer)/],
  ["Eating out", /\b(cafe|caf[eé]|coffee|restaurant|bistro|bar|pub|hotel|mcdonald|kfc|hungry jack|domino|subway|grill'd|guzman|uber ?eats|doordash|menulog|bakery|sushi|pizza|lunch|dinner|breakfast|brunch)/],
  ["Transport", /\b(uber(?! ?eats)|didi|ola|taxi|opal|myki|go card|translink|fuel|petrol|bp|shell|caltex|ampol|7-eleven|parking|toll|linkt|e-toll)\b/],
  ["Bills", /\b(agl|origin|energy ?australia|red energy|alinta|telstra|optus|vodafone|tpg|aussie broadband|internet|electricity|gas bill|water|council|rates|insurance|nrma|racv|aami|budget direct|medibank|bupa|hcf|nib|netflix|spotify|stan|disney|binge|youtube premium|apple\.com|icloud|google storage|phone bill|rent)\b/],
  ["Home", /\b(bunnings|ikea|mitre ?10|harvey norman|freedom|fantastic furniture|strata|plumber|electrician)/],
  ["Shopping", /\b(amazon|kmart|target|big w|myer|david jones|jb hi-?fi|officeworks|ebay|uniqlo|cotton on|rebel)/],
  ["Health", /\b(chemist|pharmacy|priceline|doctor|medical|dental|dentist|physio|gym|fitness|pathology|optometrist)/],
  ["Fun", /\b(cinema|hoyts|event cinemas|steam|playstation|xbox|nintendo|ticketek|ticketmaster|concert|movie)/],
  ["Travel", /\b(qantas|virgin|jetstar|airbnb|booking\.com|expedia|hotel|motel|flight)/],
  ["Income", /\b(salary|wages|payroll|pay ?day|refund|dividend|interest paid|centrelink)/],
  ["Transfers", /\b(transfer|osko|payid|bpay to self|internal)/],
];

/**
 * A short, stable key for "the same merchant": card wording, reference
 * numbers, dates and towns are stripped, so "VISA PURCHASE WOOLWORTHS 1234
 * SYDNEY AU 21/10" and "Woolworths 0987 Newtown" both become "woolworths".
 */
export function merchantKey(description: string): string {
  // Card lines put the store number before the town: keep what comes first.
  const head = description.split(/\s\S*\d{2,}/)[0] ?? description;
  const words = head
    .toLowerCase()
    .replace(/\b(visa|eftpos|mastercard|debit|credit|card|purchase|pos|direct|payment|tap|and pay|value date|ref|receipt|the|aus?|nsw|vic|qld|wa|sa|tas|act|nt)\b/g, " ")
    .replace(/[^a-z&' ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return words.slice(0, 2).join(" ");
}

/** Best category for a description, or undefined. */
export function suggestCategory(description: string, history: Pick<Transaction, "description" | "category" | "updatedAt">[] = [], amountMinor = -1): string | undefined {
  const key = merchantKey(description);
  if (key) {
    let best: { category: string; at: string } | undefined;
    for (const t of history) {
      if (!t.category || merchantKey(t.description) !== key) continue;
      if (!best || t.updatedAt > best.at) best = { category: t.category, at: t.updatedAt };
    }
    if (best) return best.category;
  }
  const text = description.toLowerCase();
  for (const [category, re] of RULES) {
    if (category === "Income" && amountMinor < 0 && !/refund/.test(text)) continue;
    if (re.test(text)) return category;
  }
  return amountMinor > 0 ? "Income" : undefined;
}
