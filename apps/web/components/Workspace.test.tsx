import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Workspace } from "./Workspace";
import { CURRENT_KEY, SAVED_KEY } from "@/lib/workspace";
import { CATALOG_KEY, parseCatalog } from "@/lib/workspace-catalog";
import { plan, snapshot } from "@/lib/test-fixtures";
const planFor = (destination: string, activity = "Museum", tripId = plan.tripId) => ({
  ...plan,
  tripId,
  brief: { ...plan.brief, tripId, destination },
  sections: plan.sections.map((section) => ({
    ...section,
    proposal: section.proposal && {
      ...section.proposal,
      items: [{ kind: "activity" as const, detail: activity, estCost: 200 }],
    },
  })),
});
const complete = (destination: string, activity?: string) =>
  new Response(
    JSON.stringify({
      type: "complete",
      response: { reply: "Updated", plan: planFor(destination, activity) },
    }),
  );
/** A chat stream whose plan uses the trip ID the client sent. */
const completeFor = (destination: string) => (init?: RequestInit) => {
  const { tripId } = JSON.parse(init!.body as string);
  return new Response(
    JSON.stringify({
      type: "complete",
      response: { reply: "Updated", plan: planFor(destination, "Museum", tripId) },
    }),
  );
};
const louvre = {
  id: "place-louvre",
  displayName: { text: "Louvre" },
  location: { latitude: 48.86, longitude: 2.34 },
};
const drawer = (name: "trip" | "preferences") =>
  document.querySelector<HTMLElement>(`.workspace-drawer--${name}`)!;
const openPreferences = () =>
  fireEvent.click(screen.getByRole("button", { name: "Open trip preferences" }));
const googlePlace = {
  id: "place-museum",
  displayName: { text: "Sydney museum" },
  formattedAddress: "Sydney NSW, Australia",
  location: { latitude: -33.8688, longitude: 151.2093 },
};
const sidebar = () => screen.getByRole("complementary", { name: "Chats and trips" });
const historyButton = (name: RegExp) => within(sidebar()).getAllByRole("button", { name })[0]!;
const withPlaceRequests = (...responses: (Response | ((init?: RequestInit) => Response))[]) => {
  let next = 0;
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/places/search")
      return Promise.resolve(Response.json({ places: [googlePlace] }));
    if (url === "/api/places/details")
      return Promise.resolve(Response.json({ place: googlePlace }));
    const response = responses[next++]!;
    return Promise.resolve(typeof response === "function" ? response(init) : response);
  });
};

describe("Workspace interactions", () => {
  it("opens the trip drawer over the map and removes it completely when closed", async () => {
    render(<Workspace initialPlan={plan} />);
    const trigger = screen.getByRole("button", { name: "Open your trip" });
    const map = document.querySelector(".workspace-panel--map")!;
    const trip = drawer("trip");
    expect(trip.getAttribute("aria-hidden")).toBe("true");
    expect(trip.hasAttribute("inert")).toBe(true);
    expect(map.contains(trip)).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trip.getAttribute("aria-hidden")).toBe("false");
    expect(trip.hasAttribute("inert")).toBe(false);
    expect(trip.getAttribute("aria-modal")).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close your trip" }));
    // The drawer overlays the map; the map canvas stays mounted in its own column.
    expect(document.querySelector(".workspace-panel--map")).toBe(map);
    expect(within(trip).getByRole("button", { name: "Review plan" })).toBeTruthy();
    expect(within(trip).getByRole("button", { name: "Save trip" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(trip.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close open panel" }));
    expect(trip.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close your trip" }));
    expect(trip.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(trigger);
    await waitFor(() => {
      const catalog = parseCatalog(localStorage.getItem(CATALOG_KEY));
      expect(catalog.layout.preferences.open).toBe(false);
      expect(catalog.layout.trip.open).toBe(false);
    });
  });
  it("keeps only one drawer open and returns focus from Preferences", () => {
    render(<Workspace initialPlan={plan} />);
    const preferences = drawer("preferences");
    const trip = drawer("trip");
    const preferencesTrigger = screen.getByRole("button", { name: "Open trip preferences" });
    fireEvent.click(preferencesTrigger);
    expect(preferences.getAttribute("aria-hidden")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Open your trip" }));
    expect(preferences.getAttribute("aria-hidden")).toBe("true");
    expect(trip.getAttribute("aria-hidden")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Open trip preferences" }));
    expect(trip.getAttribute("aria-hidden")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(preferences.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(preferencesTrigger);
    expect(document.querySelector(".workspace-drawer-backdrop")).toBeNull();
  });
  it("keeps the timeline and editors out of the map canvas", () => {
    render(<Workspace initialPlan={plan} />);
    const map = document.querySelector<HTMLElement>(".workspace-panel--map")!;
    expect(within(map).queryByRole("button", { name: "Verify day routes" })).toBeNull();
    expect(within(map).queryByRole("button", { name: "Review plan" })).toBeNull();
    expect(within(map).queryByText(/Estimated total/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open your trip" }));
    fireEvent.click(screen.getByRole("tab", { name: "Timeline & routes" }));
    const trip = drawer("trip");
    expect(within(trip).getByRole("button", { name: "Verify day routes" })).toBeTruthy();
    expect(within(map).queryByRole("button", { name: "Verify day routes" })).toBeNull();
  });
  it("starts a blank conversation instead of carrying the demo trip into New chat", async () => {
    vi.stubGlobal("fetch", withPlaceRequests());
    render(<Workspace initialPlan={plan} />);
    await waitFor(() =>
      expect(parseCatalog(localStorage.getItem(CATALOG_KEY)).trips).toHaveLength(1),
    );
    fireEvent.change(screen.getByLabelText("Message AI Trip Planner"), {
      target: { value: "left over from Sydney" },
    });
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    const chat = document.querySelector<HTMLElement>(".workspace-panel--chat")!;
    const map = document.querySelector<HTMLElement>(".workspace-panel--map")!;
    expect((screen.getByLabelText("Message AI Trip Planner") as HTMLInputElement).value).toBe("");
    expect(within(chat).queryByText(/Sydney|Museum/)).toBeNull();
    expect(within(map).queryByText(/Sydney|Museum/)).toBeNull();
    expect(within(chat).getByText("Where to next?")).toBeTruthy();
    openPreferences();
    for (const label of [
      "Destination",
      "Start date",
      "End date",
      "Travellers",
      "Total budget (USD)",
    ])
      expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Open your trip" }));
    expect(within(drawer("trip")).getByText(/No trip yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save trip" })).toBeNull();
    await waitFor(() => {
      const catalog = parseCatalog(localStorage.getItem(CATALOG_KEY));
      const active = catalog.conversations.find(
        (conversation) => conversation.id === catalog.activeConversationId,
      );
      expect(active?.title).toBe("New chat");
      expect(active?.tripId).toBeUndefined();
      expect(active?.messages).toEqual([]);
      expect(catalog.activeTripId).toBeUndefined();
      expect(catalog.trips).toHaveLength(1);
      expect(catalog.conversations).toHaveLength(2);
    });
  });
  it("saves a blank conversation's form and input and restores it after reload", async () => {
    vi.stubGlobal("fetch", withPlaceRequests());
    const view = render(<Workspace initialPlan={plan} />);
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    openPreferences();
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Lisbon" } });
    fireEvent.change(screen.getByLabelText("Message AI Trip Planner"), {
      target: { value: "somewhere warm" },
    });
    await waitFor(() => {
      const catalog = parseCatalog(localStorage.getItem(CATALOG_KEY));
      const active = catalog.conversations.find((item) => item.id === catalog.activeConversationId);
      expect(active?.draft?.destination).toBe("Lisbon");
      expect(active?.input).toBe("somewhere warm");
    });
    view.unmount();
    render(<Workspace />);
    expect((screen.getByLabelText("Message AI Trip Planner") as HTMLInputElement).value).toBe(
      "somewhere warm",
    );
    openPreferences();
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("Lisbon");
    expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe("");
    expect(within(drawer("trip")).queryByText(/Sydney/)).toBeNull();
    expect(
      within(document.querySelector<HTMLElement>(".workspace-panel--chat")!).queryByText(/Sydney/),
    ).toBeNull();
    // Switching back to the earlier chat restores its own trip.
    fireEvent.click(historyButton(/^Sydney · 2026-10-01/));
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("Sydney");
  });
  it("starts a blank chat from natural language and links the generated trip", async () => {
    const fetcher = withPlaceRequests(completeFor("Lisbon"));
    vi.stubGlobal("fetch", fetcher);
    render(<Workspace initialPlan={plan} />);
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    fireEvent.change(screen.getByLabelText("Message AI Trip Planner"), {
      target: { value: "Lisbon, 2026-11-02 to 2026-11-06, 2 people, budget $2400" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Updated");
    const request = JSON.parse(
      (fetcher.mock.calls.find(([url]) => url === "/api/chat")![1] as RequestInit).body as string,
    );
    expect(request.mode).toBe("start");
    expect(request.brief).toBeUndefined();
    expect(request.tripId).not.toBe(plan.tripId);
    await waitFor(() => {
      const catalog = parseCatalog(localStorage.getItem(CATALOG_KEY));
      const active = catalog.conversations.find((item) => item.id === catalog.activeConversationId);
      expect(active?.tripId).toBe(`trip:${request.tripId}`);
      expect(catalog.trips.map((trip) => trip.id)).toContain(`trip:${request.tripId}`);
      expect(catalog.activeTripId).toBe(`trip:${request.tripId}`);
    });
  });
  it("aborts an in-flight plan on New chat and never shows its late answer", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn((input: RequestInfo | URL) =>
      String(input) === "/api/chat"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(Response.json({ places: [] })),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<Workspace initialPlan={plan} />);
    fireEvent.change(screen.getByLabelText("Message AI Trip Planner"), {
      target: { value: "Change to Tokyo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const call = fetcher.mock.calls.find(([url]) => url === "/api/chat") as unknown as [
      string,
      RequestInit,
    ];
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(call[1].signal!.aborted).toBe(true);
    await act(async () => {
      finish(complete("Tokyo"));
    });
    expect(screen.queryByText(/Tokyo/)).toBeNull();
    const input = screen.getByLabelText("Message AI Trip Planner") as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.value).toBe("");
  });
  it("lets chat planning run while map lookups are pending and drops stale places", async () => {
    let finishPlaces!: (response: Response) => void;
    let finishChat!: (response: Response) => void;
    const searches: string[] = [];
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/places/search") {
        const body = JSON.parse(init!.body as string);
        if (body.destination) searches.push(`${body.text}@${body.destination}`);
        if (body.destination === "Sydney")
          return new Promise<Response>((resolve) => {
            finishPlaces = resolve;
          });
        return Promise.resolve(Response.json({ places: [louvre] }));
      }
      return new Promise<Response>((resolve) => {
        finishChat = resolve;
      });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<Workspace initialPlan={plan} />);
    await waitFor(() => expect(searches).toEqual(["Museum@Sydney"]));
    fireEvent.change(screen.getByLabelText("Message AI Trip Planner"), {
      target: { value: "Change to Paris" },
    });
    // A pending map lookup does not block the chat.
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => {
      finishChat(complete("Paris", "Louvre"));
    });
    expect(await within(drawer("trip")).findByText(/Paris · 2026-10-01/)).toBeTruthy();
    await waitFor(() => expect(searches).toContain("Louvre@Paris"));
    await act(async () => {
      finishPlaces(Response.json({ places: [googlePlace] }));
    });
    const list = await screen.findByRole("list", { name: "Places shown on the map" });
    expect(within(list).getByText(/Louvre/)).toBeTruthy();
    expect(within(list).queryByText(/Sydney museum/)).toBeNull();
  });
  it("opens blank on first visit without requesting a demo plan", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<Workspace />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "New trip" })).toBeTruthy();
    expect(screen.getByText(/Not planned yet/)).toBeTruthy();
    expect(screen.getByText("Where to next?")).toBeTruthy();
    expect(screen.getByText("Your map will appear here")).toBeTruthy();
    expect((screen.getByLabelText("Message AI Trip Planner") as HTMLInputElement).value).toBe("");
    expect(document.body.textContent).not.toMatch(/Tokyo|Kyoto/);
    openPreferences();
    for (const label of ["Destination", "Start date", "End date", "Travellers"])
      expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
    await waitFor(() => {
      const catalog = parseCatalog(localStorage.getItem(CATALOG_KEY));
      expect(catalog.trips).toHaveLength(0);
      expect(catalog.conversations[0]?.title).toBe("New chat");
    });
  });
  it("does not reopen the last trip on refresh but restores it when chosen from history", async () => {
    vi.stubGlobal("fetch", withPlaceRequests());
    const view = render(<Workspace initialPlan={plan} />);
    openPreferences();
    fireEvent.change(screen.getByLabelText("Total budget (USD)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Message AI Trip Planner"), {
      target: { value: "unfinished request" },
    });
    await waitFor(() =>
      expect(
        parseCatalog(localStorage.getItem(CATALOG_KEY)).conversations.some(
          (item) => item.input === "unfinished request",
        ),
      ).toBe(true),
    );
    view.unmount();
    render(<Workspace />);
    expect(screen.getByRole("heading", { name: "New trip" })).toBeTruthy();
    expect((screen.getByLabelText("Message AI Trip Planner") as HTMLInputElement).value).toBe("");
    expect(within(drawer("trip")).queryByText(/Sydney/)).toBeNull();
    fireEvent.click(historyButton(/^Sydney · 2026-10-01/));
    expect(screen.getByRole("heading", { name: "Sydney" })).toBeTruthy();
    expect((screen.getByLabelText("Message AI Trip Planner") as HTMLInputElement).value).toBe(
      "unfinished request",
    );
    openPreferences();
    expect((screen.getByLabelText("Total budget (USD)") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /^Trips\s*1$/ }));
    expect(historyButton(/^Sydney · 2026-10-01/).getAttribute("aria-current")).toBe("true");
  });
  it("keeps the plan and draft on failure and retries the same structured request", async () => {
    const fetcher = withPlaceRequests(
      new Response('{"error":"Offline"}', { status: 503 }),
      complete("Paris"),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<Workspace initialPlan={plan} />);
    openPreferences();
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Paris" } });
    fireEvent.click(screen.getByRole("button", { name: "Update trip" }));
    await screen.findByText("Offline");
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("Paris");
    expect(within(drawer("trip")).getByText(/Sydney · 2026-10-01/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry update" }));
    await within(drawer("trip")).findByText(/Paris · 2026-10-01/);
    const chatCalls = fetcher.mock.calls.filter(([url]) => url === "/api/chat");
    const first = JSON.parse((chatCalls[0]![1] as RequestInit).body as string);
    expect(first.mode).toBe("plan");
    expect(first.brief.destination).toBe("Paris");
    expect((chatCalls[0]![1] as RequestInit).body).toBe((chatCalls[1]![1] as RequestInit).body);
  });
  it("restores saved data and ignores the result of the aborted old request", async () => {
    const restored = {
      ...snapshot,
      plan: { ...plan, brief: { ...plan.brief, destination: "Melbourne" } },
      draft: { ...snapshot.draft, destination: "Melbourne" },
    };
    localStorage.setItem(SAVED_KEY, JSON.stringify([restored]));
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<Workspace initialPlan={plan} />);
    openPreferences();
    fireEvent.click(screen.getByRole("button", { name: "Update trip" }));
    fireEvent.click(screen.getByRole("button", { name: /^Saved trips/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restore trip" }));
    openPreferences();
    await act(async () => {
      finish(complete("Obsolete result"));
    });
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("Melbourne");
    expect(screen.queryByText(/Obsolete result/)).toBeNull();
    expect(screen.getByRole("button", { name: "Update trip" }).hasAttribute("disabled")).toBe(
      false,
    );
  });
  it("keeps corrupt storage intact and tolerates quota failures", async () => {
    localStorage.setItem(CURRENT_KEY, "broken");
    render(<Workspace initialPlan={plan} />);
    expect(localStorage.getItem(CURRENT_KEY)).toBe("broken");
    expect(screen.getByRole("alert").textContent).toContain("could not be read");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry / replace workspace storage" }));
    expect(screen.getByRole("alert").textContent).toContain("unavailable or full");
    expect(within(drawer("trip")).getByText(/Sydney · 2026-10-01/)).toBeTruthy();
  });
});

const planWith = (
  items: { detail: string; location?: string; placeId?: string }[],
  destination = "Kyoto",
) =>
  ({
    ...plan,
    brief: { ...plan.brief, destination },
    sections: plan.sections.map((section) => ({
      ...section,
      proposal: section.proposal && {
        ...section.proposal,
        items: items.map((item) => ({ kind: "activity", day: 1, estCost: 10, ...item })),
      },
    })),
  }) as typeof plan;
const kyoto = {
  id: "city-kyoto",
  displayName: { text: "Kyoto" },
  location: { latitude: 35.01, longitude: 135.77 },
};
const toji = {
  id: "place-toji",
  displayName: { text: "To-ji Temple" },
  location: { latitude: 34.98, longitude: 135.75 },
};

describe("Workspace navigation", () => {
  it("collapses the sidebar to labelled icons, keeps focus and remembers the preference", async () => {
    const view = render(<Workspace />);
    // The blank conversation appears in Chats once autosave has recorded it.
    await waitFor(() =>
      expect(within(sidebar()).getByRole("button", { name: /^Chats\s*1$/ })).toBeTruthy(),
    );
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(sidebar()).getByText("AI Trip Planner")).toBeTruthy();
    expect(
      within(sidebar())
        .getByRole("button", { name: /^Chats\s*1$/ })
        .getAttribute("aria-current"),
    ).toBe("true");
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Expand sidebar");
    expect(document.activeElement).toBe(toggle);
    // Text and history details are gone; icon buttons stay reachable by name.
    expect(within(sidebar()).queryByText("AI Trip Planner")).toBeNull();
    expect(within(sidebar()).getByRole("img", { name: "AI Trip Planner" })).toBeTruthy();
    expect(within(sidebar()).queryByRole("region", { name: "Chats" })).toBeNull();
    expect(within(sidebar()).queryByRole("searchbox")).toBeNull();
    for (const name of [
      "New chat",
      "Search chats and trips",
      "Chats, 1",
      "Trips, 0",
      "Saved trips, 0",
    ]) {
      const button = within(sidebar()).getByRole("button", { name });
      expect(button.getAttribute("data-tooltip")).toBeTruthy();
    }
    await waitFor(() =>
      expect(parseCatalog(localStorage.getItem(CATALOG_KEY)).layout.sidebar.collapsed).toBe(true),
    );
    view.unmount();
    render(<Workspace />);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
    fireEvent.click(within(sidebar()).getByRole("button", { name: "Search chats and trips" }));
    expect(document.activeElement).toBe(within(sidebar()).getByRole("searchbox"));
  });

  it("falls back safely when the stored layout is corrupt", () => {
    localStorage.setItem(
      CATALOG_KEY,
      JSON.stringify({
        version: 3,
        conversations: [],
        trips: [],
        layout: { sidebar: "yes", view: 7 },
      }),
    );
    render(<Workspace />);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("puts Preferences and Trip in a top bar above the chat and map, with drawers below it", () => {
    render(<Workspace initialPlan={plan} />);
    const topbar = document.querySelector<HTMLElement>(".workspace-topbar")!;
    const shell = document.querySelector<HTMLElement>(".workspace-shell")!;
    const map = document.querySelector<HTMLElement>(".workspace-panel--map")!;
    const actions = within(topbar).getAllByRole("button");
    expect(actions.at(-1)!.getAttribute("aria-label")).toBe("Open your trip");
    expect(within(topbar).getByRole("button", { name: "Open trip preferences" })).toBeTruthy();
    expect(
      within(map).queryByRole("button", { name: /Open (your trip|trip preferences)/ }),
    ).toBeNull();
    expect(within(topbar).getByRole("heading", { name: "Sydney" })).toBeTruthy();
    expect(topbar.textContent).toMatch(/4 days · 2 travellers · USD\s2,000\.00 budget/);
    expect(shell.contains(topbar)).toBe(false);
    expect(shell.contains(drawer("trip"))).toBe(true);
    expect(shell.contains(drawer("preferences"))).toBe(true);
  });
});

describe("Workspace map places", () => {
  it("never sends descriptive activity text to Places and centres on the destination city", async () => {
    const bodies: Record<string, string>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(init!.body as string));
        return Response.json({ places: [kyoto] });
      }),
    );
    render(
      <Workspace
        initialPlan={planWith([
          {
            detail:
              "Arrival-day orientation walk at the single grounded candidate; low-key start to settle in.",
          },
          {
            detail: "Morning visit at the grounded candidate place.",
            location: "Mock attraction near Kyoto",
          },
        ])}
      />,
    );
    await waitFor(() => expect(bodies).toEqual([{ text: "Kyoto" }]));
    const map = document.querySelector<HTMLElement>(".workspace-panel--map")!;
    await waitFor(() =>
      expect(within(map).getByText(/2 activities have no confirmed place yet/)).toBeTruthy(),
    );
    expect(map.querySelector(".trip-map-status")!.getAttribute("role")).toBe("status");
    expect(within(map).queryByText(/No Google place matched/)).toBeNull();
    expect(within(map).queryByRole("button", { name: "Retry places" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open your trip" }));
    fireEvent.click(screen.getByRole("tab", { name: "Timeline & routes" }));
    expect(within(drawer("trip")).getAllByText(/Location to be confirmed/).length).toBeGreaterThan(
      0,
    );
  });

  it("keeps located places when another lookup fails and retries only the failed one", async () => {
    const searches: string[] = [];
    let failGallery = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const { text } = JSON.parse(init!.body as string);
        searches.push(text);
        if (text === "Kyoto") return Response.json({ places: [kyoto] });
        if (text === "To-ji Temple") return Response.json({ places: [toji] });
        if (failGallery) return Response.json({ error: "busy" }, { status: 429 });
        return Response.json({ places: [] });
      }),
    );
    render(
      <Workspace
        initialPlan={planWith([
          { detail: "Temple morning", location: "To-ji Temple" },
          { detail: "Gallery afternoon", location: "Kyoto Gallery" },
        ])}
      />,
    );
    const list = await screen.findByRole("list", { name: "Places shown on the map" });
    expect(within(list).getByText(/To-ji Temple/)).toBeTruthy();
    const map = document.querySelector<HTMLElement>(".workspace-panel--map")!;
    await waitFor(() =>
      expect(within(map).getByText(/1 could not be loaded from Google Places/)).toBeTruthy(),
    );
    expect(map.querySelector(".trip-map-status")!.getAttribute("role")).toBe("status");
    failGallery = false;
    searches.length = 0;
    fireEvent.click(within(map).getByRole("button", { name: "Retry places" }));
    await waitFor(() => expect(searches).toEqual(["Kyoto Gallery"]));
    await waitFor(() =>
      expect(within(map).getByText(/1 activity has no confirmed place yet/)).toBeTruthy(),
    );
    expect(
      within(screen.getByRole("list", { name: "Places shown on the map" })).getByText(
        /To-ji Temple/,
      ),
    ).toBeTruthy();
  });

  it("shows a neutral placeholder instead of a world map when the destination cannot be located", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "down" }, { status: 502 })),
    );
    render(<Workspace initialPlan={planWith([{ detail: "Free time" }], "Atlantis")} />);
    const map = document.querySelector<HTMLElement>(".workspace-panel--map")!;
    expect(await within(map).findByText("Atlantis could not be shown on the map yet")).toBeTruthy();
    expect(within(map).getByText(/temporarily unavailable. Your plan is unchanged/)).toBeTruthy();
    expect(within(map).queryByLabelText("Google activity map")).toBeNull();
    expect(within(drawer("trip")).getByText(/Atlantis/)).toBeTruthy();
  });
});
