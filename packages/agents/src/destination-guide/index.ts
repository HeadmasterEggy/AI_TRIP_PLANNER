import {
  TripBrief as TripBriefSchema,
  type AgentContext,
  type AgentProposal,
  type Place,
  type Specialist,
  type TripBrief,
  type UserPreference,
} from "@trip/shared";
import { z } from "zod/v4";
import { createAgent, tool } from "langchain";
import { createRoutedChatModel } from "../models";

// The guide schema keeps model output bounded and makes every downstream item
// safe to render as traveller-facing content.
const GuideAttraction = z.object({
  name: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(500),
});

const DestinationGuideDraft = z.object({
  summary: z.string().trim().min(1).max(400),
  attractions: z.array(GuideAttraction).max(5),
  customs: z.array(z.string().trim().min(1).max(400)).min(1).max(4),
  safety: z.array(z.string().trim().min(1).max(400)).min(1).max(4),
  entryHealth: z.array(z.string().trim().min(1).max(400)).min(1).max(4),
  weather: z.string().trim().min(1).max(500),
  packing: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
  assumptions: z.array(z.string().trim().min(1).max(400)).max(6),
});

/** Structured guide content before it is adapted to the shared proposal shape. */
export type DestinationGuideDraft = z.infer<typeof DestinationGuideDraft>;

/** Injectable model seam used by tests and alternate providers. */
export interface DestinationGuideGenerator {
  generate(input: {
    brief: TripBrief;
    travelMonth: string;
    places: Place[];
    preferences: UserPreference[];
  }): Promise<DestinationGuideDraft>;
}

/** Configuration for selecting an injected generator or deterministic mode. */
export interface DestinationGuideAgentOptions {
  /** Pass false to force the grounded deterministic guide. */
  generator?: DestinationGuideGenerator | false;
}

/** Normalize names before comparing model output with map evidence. */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Turn the trip start date into month-only context (not a weather forecast). */
function travelMonth(date: string): string {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`Destination guide requires a valid YYYY-MM-DD date: ${date}`);
  }
  return new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(timestamp);
}

/** Reject attractions that are not present in the injected map candidates. */
function validateDraft(draft: DestinationGuideDraft, places: Place[]): DestinationGuideDraft {
  const parsed = DestinationGuideDraft.parse(draft);
  const candidates = new Set(places.map((place) => normalize(place.name)));
  if (candidates.size === 0 && parsed.attractions.length > 0) {
    throw new Error("Destination guide cannot invent attractions without place candidates.");
  }
  for (const attraction of parsed.attractions) {
    if (!candidates.has(normalize(attraction.name))) {
      throw new Error(`Destination guide returned an ungrounded attraction: ${attraction.name}`);
    }
  }
  return parsed;
}

/** Provide conservative guidance when no model is configured or it fails validation. */
function fallbackDraft(brief: TripBrief, month: string, places: Place[]): DestinationGuideDraft {
  return {
    summary: `${brief.destination} planning guidance for ${month}`,
    attractions: places.slice(0, 5).map((place) => ({
      name: place.name,
      detail: `${place.category} candidate${place.rating ? ` with supplied rating ${place.rating}` : ""}; verify opening hours and suitability before visiting.`,
    })),
    customs: ["Follow posted venue rules and check official local visitor guidance before travel."],
    safety: [
      "Save local emergency contacts, keep copies of essential documents, and follow current official travel advisories.",
    ],
    entryHealth: [
      `Check current official immigration and public-health requirements${brief.nationality ? ` for a ${brief.nationality} passport` : " for each traveller's passport"}; requirements can change.`,
    ],
    weather: `For ${month}, use this as planning context only and check an official short-range forecast shortly before departure.`,
    packing: [
      "Weather-appropriate layers",
      "Comfortable walking shoes",
      "Medication and copies of prescriptions",
      "Travel documents and suitable power adapters",
    ],
    assumptions: ["Destination-specific claims are limited to the validated evidence available."],
  };
}

/** Build the LangChain generator; the evidence tool is the model's sole source of facts. */
function createMiniMaxGenerator(): DestinationGuideGenerator | undefined {
  const model = createRoutedChatModel("destination-guide");
  if (!model) return undefined;

  return {
    async generate(input) {
      // The tool returns already-validated brief, month, places and preferences.
      const evidence = tool(async () => input, {
        name: "read_destination_evidence",
        description:
          "Read the validated trip brief, travel month, grounded map candidates and confirmed user preferences.",
        schema: z.object({}),
      });
      const specialist = createAgent({
        name: "destination_specialist",
        model,
        tools: [evidence],
        systemPrompt:
          "You are the destination specialist. Always call read_destination_evidence before answering and use only its facts. Attraction names must exactly match grounded candidates. Give concise customs, packing and planning guidance. Treat weather as monthly context, never a forecast. Never assert entry eligibility, vaccine requirements or that an area is safe; direct travellers to current official immigration, health and travel-advisory sources. Never claim live opening hours or availability. Return the requested structured destination guide.",
        responseFormat: DestinationGuideDraft,
      });
      const result = await specialist.invoke({
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              task: "Prepare destination guidance from the validated evidence available through your tool.",
              tripId: input.brief.tripId,
            }),
          },
        ],
      });
      return DestinationGuideDraft.parse(result.structuredResponse);
    },
  };
}

async function planDestinationGuide(
  briefInput: TripBrief,
  ctx: AgentContext,
  options: DestinationGuideAgentOptions,
): Promise<AgentProposal> {
  // Fetch map evidence and long-term preferences in parallel, then normalize
  // duplicate place names before asking the model to draft guidance.
  ctx.signal?.throwIfAborted();
  const brief = TripBriefSchema.parse(briefInput);
  const month = travelMonth(brief.dates[0]);
  const [sights, museums, preferences] = await Promise.all([
    ctx.tools.maps.places({ near: brief.destination, category: "sight" }),
    ctx.tools.maps.places({ near: brief.destination, category: "museum" }),
    ctx.mem.getLongTerm(brief.userId),
  ]);
  ctx.signal?.throwIfAborted();
  const places = [...sights, ...museums].filter(
    (place, index, all) =>
      all.findIndex((candidate) => normalize(candidate.name) === normalize(place.name)) === index,
  );
  const generator =
    options.generator === false ? undefined : (options.generator ?? createMiniMaxGenerator());
  let draft: DestinationGuideDraft;
  if (generator) {
    try {
      draft = validateDraft(
        await generator.generate({ brief, travelMonth: month, places, preferences }),
        places,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown model error";
      console.warn(
        `[destination-guide] Model draft failed; using a safe local plan: ${reason}`,
      );
      draft = fallbackDraft(brief, month, places);
    }
  } else {
    draft = fallbackDraft(brief, month, places);
  }

  return {
    agent: "destination-guide",
    summary: draft.summary,
    items: [
      ...draft.attractions.map((attraction) => ({
        kind: "attraction",
        location: attraction.name,
        detail: `${attraction.name}: ${attraction.detail}`,
      })),
      { kind: "customs", detail: draft.customs.join(" ") },
      { kind: "safety", detail: draft.safety.join(" ") },
      {
        kind: "entry-health",
        detail: `${draft.entryHealth.join(" ")} Verify all entry and health rules against current official government sources before booking or departure.`,
      },
      {
        kind: "weather-packing",
        detail: `${draft.weather} Pack: ${draft.packing.join(", ")}.`,
      },
    ],
    assumptions: [
      "Attractions come only from the injected MapsPort and may still be mock or stale data.",
      "Weather is general model context, not a forecast; entry, health and safety guidance requires official verification.",
      ...draft.assumptions,
    ],
    conflictsWith: [],
  };
}

/** Factory keeps the generator injectable while exposing the Specialist API. */
export function createDestinationGuideAgent(
  options: DestinationGuideAgentOptions = {},
): Specialist {
  return {
    name: "destination-guide",
    label: "Destination guide",
    async invoke({ brief, context, revision }) {
      if (revision) {
        throw new Error("Destination guide does not support targeted revisions.");
      }
      return planDestinationGuide(brief, context, options);
    },
  };
}

// Default instance used by the shared agent registry.
export const destinationGuideAgent = createDestinationGuideAgent();
