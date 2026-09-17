import { createRoutedChatModel, createRoutedStructuredInvoker } from "@trip/agents";
import { memory } from "@trip/services";
import {
  ChatTurn,
  TripBrief as TripBriefSchema,
  type ChatRequest,
  type ChatResponse,
  type MemoryStore,
  type TripBrief,
} from "@trip/shared";
import { z } from "zod/v4";
import { DEMO_BRIEF } from "./demo";
import { runOrchestrator, type OrchestratorOptions } from "./workflow";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const MONTH_WORDS = Object.keys(MONTH_NAMES).join("|");

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/**
 * The date shapes `parseDateToken` understands, so a range can be found inside a sentence.
 * Order matters: the year-first form has to be tried before the year-last one.
 */
const DATE_TOKEN = [
  String.raw`\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?`,
  String.raw`(?:${MONTH_WORDS})[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?`,
  String.raw`\d{1,2}(?:st|nd|rd|th)?\s+(?:${MONTH_WORDS})[a-z]*\.?(?:\s*,?\s*\d{4})?`,
  String.raw`\d{1,2}\s*月\s*\d{1,2}\s*日`,
  String.raw`\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}`,
].join("|");

/** “to”, “through”, “~” and friends, plus a dash only when it stands alone between spaces. */
const RANGE_SEPARATOR = String.raw`(?:to|through|until|till|and|~|～|–|—|至|到)|\s+-\s+`;

function isoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const value = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
  return validDate(value) ? value : undefined;
}

/** The stated year inside one token, used to fill a year-less sibling like “10月1日”. */
function statedYear(token: string): number | undefined {
  const found = /\d{4}/.exec(token);
  return found ? Number(found[0]) : undefined;
}

/**
 * Normalise the date shapes people actually type into `YYYY-MM-DD`.
 *
 * `M/D/YYYY` is read only when a component above 12 settles the order; a fully ambiguous token
 * is left undefined so the caller can ask. A token with no year of its own borrows `fallbackYear`;
 * without one there is nothing to normalise to.
 */
function parseDateToken(token: string, fallbackYear?: number): string | undefined {
  const text = token.trim();

  // 2026-10-01, 2026/10/1, 2026.10.01, 2026年10月1日
  const yearFirst = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/.exec(text);
  if (yearFirst) return isoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));

  // Oct 1 2026, October 1, 2026
  const monthFirst = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})?$/.exec(text);
  if (monthFirst) {
    const month = MONTH_NAMES[monthFirst[1].toLowerCase()];
    const year = monthFirst[3] ? Number(monthFirst[3]) : fallbackYear;
    return month && year ? isoDate(year, month, Number(monthFirst[2])) : undefined;
  }

  // 1 Oct 2026, 1st October 2026
  const dayFirstWord = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?\s*,?\s*(\d{4})?$/.exec(text);
  if (dayFirstWord) {
    const month = MONTH_NAMES[dayFirstWord[2].toLowerCase()];
    const year = dayFirstWord[3] ? Number(dayFirstWord[3]) : fallbackYear;
    return month && year ? isoDate(year, month, Number(dayFirstWord[1])) : undefined;
  }

  // 10月1日
  const cjk = /^(\d{1,2})\s*月\s*(\d{1,2})\s*日$/.exec(text);
  if (cjk) return fallbackYear ? isoDate(fallbackYear, Number(cjk[1]), Number(cjk[2])) : undefined;

  // 13/10/2026, 10/13/2026 — only when a component above 12 settles the order. A fully ambiguous
  // 01/10/2026 is left unset so the caller asks, rather than silently picking a month.
  const numeric = /^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})$/.exec(text);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    if (first > 12) return isoDate(year, second, first);
    if (second > 12) return isoDate(year, first, second);
    return undefined;
  }

  return undefined;
}

/**
 * The date range in a message, normalised to ISO. Either side may omit its year as long as the
 * other states one, so “2026年10月1日到10月5日” works. A range with no year at all stays unset
 * rather than borrowing a currency figure or today's date.
 */
function parseDateRange(message: string): [string, string] | undefined {
  const range = new RegExp(
    String.raw`(${DATE_TOKEN})\s*(?:${RANGE_SEPARATOR})\s*(${DATE_TOKEN})`,
    "i",
  ).exec(message);
  if (!range) return undefined;
  const [, left, right] = range;
  const year = statedYear(left!) ?? statedYear(right!);
  const start = parseDateToken(left!, year);
  const end = parseDateToken(right!, year);
  return start && end ? [start, end] : undefined;
}

const BriefPatchSchema = z.object({
  destination: z.string().trim().min(1).optional(),
  dates: z.tuple([z.string().regex(ISO_DATE), z.string().regex(ISO_DATE)]).optional(),
  groupSize: z.number().int().positive().optional(),
  budgetTotal: z.number().positive().optional(),
  nationality: z.string().trim().min(1).optional(),
});

export type BriefPatch = z.infer<typeof BriefPatchSchema>;

export interface BriefExtractor {
  /** `current` is undefined when a blank conversation starts without a brief. */
  extract(message: string, current: TripBrief | undefined): Promise<BriefPatch>;
}

/** A blank conversation did not state every field required to plan a trip. */
export class IncompleteBriefError extends Error {
  constructor(readonly missing: string[]) {
    super(
      `To start planning, include the ${missing.join(", ")}. You can also fill in Trip preferences.`,
    );
    this.name = "IncompleteBriefError";
  }
}

const REQUIRED_START_FIELDS = [
  ["destination", "destination"],
  ["dates", "start and end dates"],
  ["groupSize", "number of travellers"],
  ["budgetTotal", "total budget"],
] as const;

export interface ReplyGenerator {
  generate(prompt: string): Promise<string>;
}

export interface TripChatOptions extends OrchestratorOptions {
  extractor?: BriefExtractor;
  replyGenerator?: ReplyGenerator;
}

// The wire shape keeps the two dates as scalar fields rather than the `dates` tuple in
// `TripBrief`: a model that states only one end of a range must not produce a half-applied patch,
// and a nullable scalar says that more clearly than a tuple that can only be whole.
const ModelPatchSchema = z.object({
  destination: z.string().trim().min(1).nullable(),
  startDate: z.string().regex(ISO_DATE).nullable(),
  endDate: z.string().regex(ISO_DATE).nullable(),
  groupSize: z.number().int().positive().nullable(),
  budgetTotal: z.number().positive().nullable(),
  nationality: z.string().trim().min(1).nullable(),
});

function validDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return (
    ISO_DATE.test(value) &&
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value
  );
}

function amount(value: string): number | undefined {
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function cleanDestination(value: string): string {
  return value
    .trim()
    .replace(/\s+(?:trip|travel|holiday)$/i, "")
    .replace(/[，,。.]+$/, "")
    .trim();
}

export function extractBriefPatchLocally(message: string): BriefPatch {
  const patch: BriefPatch = {};

  const dates = parseDateRange(message);
  if (dates) patch.dates = dates;

  const budget =
    message.match(
      /(?:budget|预算(?:改成|调整为|是|为)?)[^\d]{0,12}(?:USD\s*)?\$?\s*([\d,]+(?:\.\d+)?)/i,
    ) ?? message.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (budget?.[1]) patch.budgetTotal = amount(budget[1]);

  const group =
    message.match(/(\d+)\s*(?:people|persons?|travell?ers?)/i) ??
    message.match(/(\d+)\s*人/) ??
    // “2个人”, “2 位”, “2名” — but not “3个月” or “2个晚上”, which are durations.
    message.match(/(\d+)\s*(?:个|位|名)(?!\s*(?:月|天|日|晚|小时|钟头))/);
  const englishGroup = new RegExp(
    String.raw`\b(${Object.keys(NUMBER_WORDS).join("|")})\s+(?:people|persons?|travell?ers?)\b`,
    "i",
  ).exec(message);
  if (group?.[1]) patch.groupSize = amount(group[1]);
  else if (englishGroup?.[1]) patch.groupSize = NUMBER_WORDS[englishGroup[1].toLowerCase()];
  if (!patch.groupSize) {
    const chineseGroup = message.match(/([一二两三四五六七八九十])\s*(?:个)?人/);
    const values: Record<string, number> = {
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
    };
    if (chineseGroup?.[1]) patch.groupSize = values[chineseGroup[1]];
  }

  const englishDestination = message.match(
    /(?:(?:trip|travel|holiday|go|going)\s+(?:to|in)|visit(?:ing)?)\s+(.+?)(?=\s+(?:for|from|between|on|with|budget)\b|[,.;]|$)/i,
  );
  const explicitDestination = message.match(
    /(?:destination|place)(?:\s+(?:is|to|as))?\s*[:=]?\s+(.+?)(?=\s+(?:and\s+)?(?:for|from|between|on|with|budget)\b|[,.;]|$)/i,
  );
  const leadingDestination = message.match(
    new RegExp(String.raw`^\s*([A-Za-z][A-Za-z &.·\-]*?)\s*[,，]\s*(?=${DATE_TOKEN})`, "i"),
  );
  const chineseDestination = message.match(
    /(?:去|前往|目的地(?:是|为|改成|调整为)?)[：:\s]*([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z&·\- ]*?)(?=\s*(?:旅行|旅游|玩|，|,|。|预算|\d{4}-|$))/u,
  );
  // A place named at the start of the message and closed by a comma or a date, with no lead-in.
  const bareChineseDestination = message.match(
    /(?:^|[\s，,。:：])([\p{Script=Han}]{2,12}(?:&[\p{Script=Han}]{2,12})?)\s*(?=[，,。:：]|\s*\d{4}\s*[-/年])/u,
  );
  const destination = cleanDestination(
    englishDestination?.[1] ??
      explicitDestination?.[1] ??
      leadingDestination?.[1] ??
      chineseDestination?.[1] ??
      bareChineseDestination?.[1] ??
      "",
  );
  if (destination) patch.destination = destination;

  const passport =
    message.match(/([A-Za-z][A-Za-z ]+?)\s+passport/i) ??
    message.match(/([\p{Script=Han}]{2,12})护照/u);
  if (passport?.[1]) patch.nationality = passport[1].trim();

  return BriefPatchSchema.parse(patch);
}

export function applyBriefPatch(current: TripBrief, patch: BriefPatch, tripId: string): TripBrief {
  const parsedPatch = BriefPatchSchema.parse(patch);
  const next = TripBriefSchema.parse({ ...current, ...parsedPatch, tripId });
  if (!validDate(next.dates[0]) || !validDate(next.dates[1])) {
    throw new Error(
      "I could not read those trip dates. Try a range like 2026-10-01 to 2026-10-05, or say 1 October 2026.",
    );
  }
  if (Date.parse(next.dates[1]) <= Date.parse(next.dates[0])) {
    throw new Error("Trip end date must be after the start date.");
  }
  return next;
}

function extractionPrompt(message: string, current: TripBrief | undefined): string {
  return `Extract only explicit updates to the trip brief. Use null for every field the user did not specify. Do not infer a nationality, group size, destination or budget the user did not state. Budget is total USD.

Dates: write every date the user gave as YYYY-MM-DD, converting whatever shape they used ("Oct 1 2026", "01/10/2026", "2026年10月1日", "1 October 2026"). Normalising a date the user stated is a format conversion, not an inference. An ambiguous "01/10/2026" is read day first; the plan shows the dates you chose, so the traveller can correct it. Only return null when the user gave no year at all to work from.

Current brief:
${current ? JSON.stringify(current) : "None. This is a new conversation."}

User message:
${message}`;
}

/** Fold the flat wire shape back into the public `dates` tuple. */
function toBriefPatch(result: z.infer<typeof ModelPatchSchema>): BriefPatch {
  const { startDate, endDate, ...fields } = result;
  const patch: BriefPatch = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null) patch[key as keyof BriefPatch] = value as never;
  }
  if (startDate !== null && endDate !== null) patch.dates = [startDate, endDate];
  return BriefPatchSchema.parse(patch);
}

function createModelExtractor(): BriefExtractor | undefined {
  // The routed model normalises dates, so the shapes people type ("Oct 1", "2026年10月1日",
  // "01/10/2026") do not each need a pattern here.
  const invoke = createRoutedStructuredInvoker("itinerary", ModelPatchSchema, "TripBriefPatch");
  if (!invoke) return undefined;
  return {
    async extract(message, current) {
      return toBriefPatch(await invoke(extractionPrompt(message, current)));
    },
  };
}

function createLangChainExtractor(): BriefExtractor | undefined {
  // The routed model handles chat/intent extraction; without a key the local parser is used.
  return createModelExtractor();
}

async function extractPatch(
  message: string,
  current: TripBrief | undefined,
  extractor?: BriefExtractor,
): Promise<BriefPatch> {
  const selected = extractor ?? createLangChainExtractor();
  if (selected) {
    try {
      return await selected.extract(message, current);
    } catch {
      console.warn("[chat] model brief extraction failed; using the local parser.");
    }
  }
  return extractBriefPatchLocally(message);
}

function changedFields(before: TripBrief, after: TripBrief): string[] {
  return (["destination", "dates", "groupSize", "budgetTotal", "nationality"] as const).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

function fallbackReplyFor(plan: ChatResponse["plan"]): string {
  const summaries = plan.sections
    .map((section) => section.summary.trim())
    .filter(Boolean)
    .slice(0, 2);
  const pending = plan.hitl.find((checkpoint) => checkpoint.status === "pending");
  const facts = pending ? [pending.detail] : [];

  return [...summaries, ...facts].join(" ") || `USD ${plan.estTotal.toFixed(2)}`;
}

export function replyPrompt(
  message: string,
  before: TripBrief,
  after: TripBrief,
  fields: string[],
  plan: ChatResponse["plan"],
): string {
  const planContext = {
    brief: after,
    previousBrief: before,
    changedFields: fields,
    round: plan.round,
    estimatedTotal: plan.estTotal,
    budgetTotal: plan.budgetTotal,
    overrunPct: plan.overrunPct,
    sections: plan.sections.map((section) => ({
      label: section.label,
      status: section.status,
      summary: section.summary,
      estimatedCost: section.estCost,
    })),
    pendingHumanDecisions: plan.hitl
      .filter((checkpoint) => checkpoint.status === "pending")
      .map((checkpoint) => ({ title: checkpoint.title, detail: checkpoint.detail })),
  };

  return `You are the trip coordinator speaking directly to a traveler. Write one warm, natural reply to the user's latest message after reviewing the updated trip plan.

Communication rules:
- Detect the language of the traveler's latest message and reply in that exact same language. Do not default to English, translate unnecessarily, or mix languages.
- Acknowledge what the traveler asked for before giving the useful result.
- Be concise but personable (2-4 short sentences); sound like a thoughtful human travel partner, not a status template.
- Mention only facts supported by the plan context below. Never invent bookings, prices, availability, or certainty.
- If something still needs the traveler's decision, explain the most important next choice in plain language.
- Do not mention prompts, models, agents, orchestration, internal rounds, chain-of-thought, or implementation details.
- Do not use a fixed 'Updated: ...' or 'The plan completed...' formula. Vary the wording naturally.

Traveler's latest message:
${message}

Plan context (JSON):
${JSON.stringify(planContext)}

Return only the reply text. Do not add a heading or a JSON object.`;
}

function createReplyGenerator(): ReplyGenerator | undefined {
  const model = createRoutedChatModel("itinerary");
  if (!model) return undefined;
  return {
    async generate(prompt) {
      const response = await model.invoke(prompt);
      if (typeof response.content === "string") {
        const text = response.content.trim();
        if (text) return text;
      }
      if (Array.isArray(response.content)) {
        const text = response.content
          .map((part) => {
            if (typeof part === "string") return part;
            if (part && typeof part === "object" && "text" in part) return String(part.text);
            return "";
          })
          .join("")
          .trim();
        if (text) return text;
      }
      throw new Error("Reply model returned no text.");
    },
  };
}

export async function runTripChat(
  request: ChatRequest,
  options: TripChatOptions = {},
): Promise<ChatResponse> {
  const { extractor, replyGenerator, ...orchestrationOptions } = options;
  if (request.mode === "plan" && !request.brief) throw new Error("A brief is required to plan.");
  let current: TripBrief;
  let brief: TripBrief;
  if (request.mode === "start") {
    // Never borrow fields from the demo or a previous trip for a blank conversation.
    const patch = BriefPatchSchema.parse(await extractPatch(request.message, undefined, extractor));
    const missing = REQUIRED_START_FIELDS.filter(([key]) => patch[key] === undefined).map(
      ([, label]) => label,
    );
    if (missing.length) throw new IncompleteBriefError(missing);
    brief = applyBriefPatch(
      TripBriefSchema.parse({ ...patch, tripId: request.tripId }),
      {},
      request.tripId,
    );
    current = brief;
  } else {
    current = TripBriefSchema.parse({
      ...(request.brief ?? DEMO_BRIEF),
      tripId: request.tripId,
    });
    const patch =
      request.mode === "plan" ? {} : await extractPatch(request.message, current, extractor);
    brief = applyBriefPatch(current, patch, request.tripId);
  }
  const mem: MemoryStore = orchestrationOptions.mem ?? memory;
  await mem.appendShortTerm(
    request.tripId,
    ChatTurn.parse({ role: "user", content: request.message }),
  );
  const plan = await runOrchestrator(brief, { ...orchestrationOptions, mem });
  const fields =
    request.mode === "start"
      ? ["destination", "dates", "groupSize", "budgetTotal"]
      : changedFields(current, brief);
  const generator = replyGenerator ?? createReplyGenerator();
  let reply = fallbackReplyFor(plan);
  if (generator) {
    try {
      reply = await generator.generate(replyPrompt(request.message, current, brief, fields, plan));
    } catch (error) {
      console.warn(
        `[chat] natural-language reply failed; using a local fallback: ${
          error instanceof Error ? error.message : "unknown reply error"
        }`,
      );
    }
  }
  await mem.appendShortTerm(request.tripId, ChatTurn.parse({ role: "assistant", content: reply }));
  return { reply, plan };
}
