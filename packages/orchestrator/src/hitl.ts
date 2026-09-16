import { HitlRequest, TripPlan, type ToolGateway, type HitlCheckpoint } from "@trip/shared";
import { createToolGateway } from "@trip/tools";
import { costOf, rollUpCost } from "./budget";
import { detectConflicts } from "./conflicts";

/** Build explicit decisions from the current artifact, never from summary text. */
export function checkpointsFor(plan: TripPlan): HitlCheckpoint[] {
  const decisions: HitlCheckpoint[] = [
    {
      id: "confirm-brief",
      type: "confirm_brief",
      title: "Confirm your trip basics",
      detail: `${plan.brief.destination} · ${plan.brief.dates.join(" to ")} · ${plan.brief.groupSize} people · USD ${plan.brief.budgetTotal}`,
      status: "pending",
    },
  ];
  for (const section of plan.sections)
    for (const stay of section.proposal?.stays ?? []) {
      decisions.push({
        id: `select-${stay.id}`,
        type: "select_stay",
        title: `Choose your stay in ${stay.city}`,
        detail: `${stay.checkIn} to ${stay.checkOut} · ${stay.rooms} room(s)`,
        sectionId: section.id,
        stayId: stay.id,
        status: "pending",
      });
    }
  if (plan.overrunPct > 0 || plan.conflicts?.length)
    decisions.push({
      id: "escalation",
      type: "escalation",
      title: "Review unresolved conflicts",
      detail: [
        ...new Set(plan.conflicts?.map((c) => c.reason) ?? []),
        ...(plan.overrunPct > 0
          ? [`USD ${(plan.estTotal - plan.budgetTotal).toFixed(2)} over budget.`]
          : []),
      ].join(" "),
      status: "pending",
    });
  decisions.push({
    id: "confirm-plan",
    type: "confirm_plan",
    title: "Confirm this plan",
    detail: "Confirm the reviewed itinerary. This does not book or reserve anything.",
    status: "pending",
  });
  return decisions;
}

function recalculate(plan: TripPlan) {
  for (const section of plan.sections) {
    const proposal = section.proposal;
    if (!proposal)
      throw new Error("This saved plan has no proposal details. Replan before confirming.");
    if (proposal.stays?.length) {
      // Derive room/night costs from the brief and dates, not client totals.
      const expectedRooms =
        plan.brief.accommodation?.roomAllocation === "individual"
          ? plan.brief.groupSize
          : Math.ceil(plan.brief.groupSize / 2);
      for (const stay of proposal.stays) {
        const nights = (Date.parse(stay.checkOut) - Date.parse(stay.checkIn)) / 86400000;
        if (
          nights <= 0 ||
          stay.checkIn < plan.brief.dates[0] ||
          stay.checkOut > plan.brief.dates[1]
        )
          throw new Error("Invalid stay dates. Replan this trip.");
        stay.nights = nights;
        stay.rooms = expectedRooms;
        const choice = stay.candidates.find((c) => c.id === stay.selectedId);
        if (!choice) throw new Error("Selected stay is unavailable. Choose another stay.");
        const prefs = plan.brief.accommodation;
        if (
          prefs &&
          (choice.rating < prefs.minRating || (prefs.freeCancellation && !choice.freeCancellation))
        )
          throw new Error("This stay does not match your preferences.");
      }
      proposal.items = proposal.stays.map((stay) => {
        const choice = stay.candidates.find((c) => c.id === stay.selectedId)!;
        return {
          kind: "hotel",
          day: stay.day,
          location: choice.name,
          estCost: Math.round(choice.pricePerNightUsd * stay.nights * stay.rooms * 100) / 100,
          detail: `${choice.area} · ${stay.checkIn} to ${stay.checkOut} · ${stay.rooms} room(s) × ${stay.nights} nights × USD ${choice.pricePerNightUsd.toFixed(2)} · ${choice.rating}/10 · ${choice.freeCancellation ? "Free cancellation" : "No free cancellation"}`,
        };
      });
      proposal.summary = proposal.stays
        .map((s) => `${s.city}: ${s.candidates.find((c) => c.id === s.selectedId)!.name}`)
        .join(" · ");
      section.summary = proposal.summary;
    }
    section.estCost = costOf(proposal);
  }
  plan.budgetTotal = plan.brief.budgetTotal;
  Object.assign(plan, rollUpCost(plan.sections, plan.budgetTotal));
  plan.conflicts = detectConflicts(
    plan.sections.flatMap((s) => (s.proposal ? [s.proposal] : [])),
    plan.brief,
  );
}

export async function applyHitl(
  input: HitlRequest,
  tools: ToolGateway = createToolGateway(),
): Promise<TripPlan> {
  const { plan, checkpointId, action, candidateId } = HitlRequest.parse(input);
  if (!plan.sections.length) throw new Error("Create a plan before confirming it.");
  if (plan.sections.some((section) => section.proposal && section.proposal.agent !== section.id))
    throw new Error("Plan sections do not match their proposals. Replan first.");
  if (plan.tripId !== plan.brief.tripId) throw new Error("Trip identifiers do not match.");
  // Re-query the booking port: the browser snapshot is not a supplier quote.
  const cities = plan.brief.destination.split("&").map((city) => city.trim());
  const totalNights =
    (Date.parse(plan.brief.dates[1]) - Date.parse(plan.brief.dates[0])) / 86400000;
  let offset = 0;
  const segments = cities.map((city, index) => {
    const nights =
      Math.floor(totalNights / cities.length) + (index < totalNights % cities.length ? 1 : 0);
    const start = Date.parse(plan.brief.dates[0]) + offset * 86400000;
    const segment = {
      city,
      day: offset + 1,
      checkIn: new Date(start).toISOString().slice(0, 10),
      checkOut: new Date(start + nights * 86400000).toISOString().slice(0, 10),
    };
    offset += nights;
    return segment;
  });
  for (const section of plan.sections)
    if (section.proposal?.stays?.length) {
      if (section.id !== "accommodation" || section.proposal.stays.length !== segments.length)
        throw new Error("Invalid stay segments. Replan this trip.");
      for (const [index, stay] of section.proposal.stays.entries()) {
        const segment = segments[index]!;
        if (
          stay.city !== segment.city ||
          stay.checkIn !== segment.checkIn ||
          stay.checkOut !== segment.checkOut ||
          stay.day !== segment.day
        )
          throw new Error("Stay dates do not match this trip. Replan first.");
        const available = await tools.booking.searchStays({
          ...segment,
          guests: plan.brief.groupSize,
        });
        stay.candidates = stay.candidates.flatMap((candidate) => {
          const found = available.find((option) => option.name === candidate.name);
          return found ? [{ ...found, id: candidate.id }] : [];
        });
      }
    }
  recalculate(plan);
  const previous = new Map(plan.hitl.map((c) => [c.id, c]));
  plan.hitl = checkpointsFor(plan).map((c) => ({
    ...c,
    status: previous.get(c.id)?.status ?? "pending",
  }));
  const checkpoint = plan.hitl.find((c) => c.id === checkpointId);
  if (!checkpoint) throw new Error("This checkpoint is no longer available.");
  let changedStay = false;
  if (action === "select_stay") {
    if (checkpoint.type !== "select_stay") throw new Error("This checkpoint cannot select a stay.");
    const stay = plan.sections
      .find((s) => s.id === checkpoint.sectionId)
      ?.proposal?.stays?.find((s) => s.id === checkpoint.stayId);
    if (!stay || !stay.candidates.some((c) => c.id === candidateId))
      throw new Error("Choose a current hotel candidate.");
    changedStay = stay.selectedId !== candidateId;
    stay.selectedId = candidateId!;
    checkpoint.status = "approved";
    recalculate(plan);
  } else {
    if (action === "approve" && checkpoint.type === "select_stay")
      throw new Error("Choose a hotel to confirm this stay.");
    if (
      action === "approve" &&
      checkpoint.type === "confirm_plan" &&
      plan.hitl.some((c) => c.id !== checkpoint.id && c.status !== "approved")
    )
      throw new Error("Resolve the other decisions before confirming the plan.");
    checkpoint.status =
      action === "approve" ? "approved" : action === "reject" ? "rejected" : "deferred";
  }
  const statuses = new Map(plan.hitl.map((c) => [c.id, c.status]));
  plan.hitl = checkpointsFor(plan).map((c) => ({ ...c, status: statuses.get(c.id) ?? "pending" }));
  if (changedStay || (checkpoint.type !== "confirm_plan" && checkpoint.status !== "approved")) {
    const confirm = plan.hitl.find((c) => c.type === "confirm_plan");
    if (confirm) confirm.status = "pending";
  }
  if (changedStay) {
    const escalation = plan.hitl.find((c) => c.type === "escalation");
    if (escalation) escalation.status = "pending";
  }
  const confirmed = plan.hitl.every((c) => c.status === "approved");
  for (const section of plan.sections) {
    section.status = confirmed
      ? "confirmed"
      : plan.conflicts?.some((c) => c.targetAgent === section.id) ||
          plan.hitl.some((c) => c.sectionId === section.id && c.status !== "approved")
        ? "needs_you"
        : "draft";
  }
  return TripPlan.parse(plan);
}
