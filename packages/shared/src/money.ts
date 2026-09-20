import { z } from "zod";

// ---------------------------------------------------------------------------
// Money. This product stores every amount in a single currency; nothing
// downstream — agents, budget guardrails, the UI — carries a currency, because
// there is only ever one. Travellers may state a budget in any
// SUPPORTED_CURRENCIES value; it is converted once, where it is read out of
// their message, and never again.
//
// BASE_CURRENCY is that one currency. Note it is not yet true everywhere: the
// display layer and the mock supplier prices still read as USD, and are being
// moved over separately. Until then, treat BASE_CURRENCY as the value new code
// should be written against, not as a description of every existing line.
// ---------------------------------------------------------------------------

export const SUPPORTED_CURRENCIES = ["AUD", "CNY", "USD", "JPY"] as const;
export const Currency = z.enum(SUPPORTED_CURRENCIES);
export type Currency = z.infer<typeof Currency>;

export const BASE_CURRENCY: Currency = "AUD";

/**
 * How many BASE_CURRENCY units one unit of each currency is worth.
 *
 * Deliberately static: this product does not call an FX service, and a rate
 * invented by a language model would silently skew every budget guardrail with
 * nothing to catch it. Stating the rates here makes them reviewable.
 *
 * TODO(人工核对): approximate values — replace with the numbers you want before
 * relying on them, and move RATES_AS_OF with them.
 */
export const AUD_PER: Record<Currency, number> = {
  AUD: 1,
  CNY: 0.21,
  USD: 1.55,
  JPY: 0.0105,
};

/** Without this nobody can tell a stale table from a current one. */
export const RATES_AS_OF = "2026-09-20";

/**
 * Convert to the base currency, rounded to cents.
 *
 * Throws rather than coercing: a budget that silently became 0 or NaN would
 * fail far away from here, inside TripBrief's `min(0.01)` or a budget check.
 */
export function toAud(amount: number, from: Currency): number {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("A budget must be a positive, finite amount.");
  const converted = Math.round(amount * AUD_PER[from] * 100) / 100;
  if (converted <= 0) throw new Error("That amount is too small to convert.");
  return converted;
}

/**
 * Order matters. 美元, 日元 and 澳元 all end in 元, so the qualified names have to
 * be tested before the bare 元 that means CNY — the same trap as 人民币 being
 * read as a traveller count because it contains 人.
 */
const CURRENCY_MARKERS: [RegExp, Currency][] = [
  [/(?:^|[^a-z])(?:rmb|cny)|人民币|￥|¥/i, "CNY"],
  [/(?:^|[^a-z])(?:jpy|yen)|日元|日圓|円/i, "JPY"],
  [/(?:^|[^a-z])(?:usd|us\$)|美元|美金/i, "USD"],
  [/(?:^|[^a-z])(?:aud|au\$|a\$)|澳元|澳币|澳幣/i, "AUD"],
  // Bare 元 is CNY, but only when it is not the tail of one of the above.
  [/(?<![美日澳])元/, "CNY"],
];

/**
 * Best-effort currency marker detection for the offline (no API key) path only.
 * When a model is available it identifies the currency itself; patterns cannot
 * cover the ways people write money, which is the whole reason this is a
 * fallback rather than the main path.
 *
 * Two deliberate calls on ambiguous markers:
 * - bare `¥` / `￥` means CNY. This product's second language is Chinese; JPY
 *   has to be said explicitly (`円`, `JPY`, `yen`).
 * - bare `$` is not a marker at all. It is ambiguous between USD and AUD, and
 *   with AUD as the base an unmarked amount is already treated as AUD.
 */
export function detectCurrency(text: string): Currency | undefined {
  for (const [pattern, currency] of CURRENCY_MARKERS) if (pattern.test(text)) return currency;
  return undefined;
}

/**
 * Format an amount in the currency the traveller actually named, for the "what
 * you told us" hint beside a converted budget. The base-currency formatter for
 * everything else lives in the web app; this one exists because JPY has no
 * minor unit and Intl only knows that from the currency code.
 */
export function moneyIn(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}
