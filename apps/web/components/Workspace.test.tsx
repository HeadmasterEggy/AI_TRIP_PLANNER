import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Workspace } from "./Workspace";
import { CURRENT_KEY, SAVED_KEY } from "@/lib/workspace";
import { CATALOG_KEY, parseCatalog } from "@/lib/workspace-catalog";
import { plan, snapshot } from "@/lib/test-fixtures";
const complete = (destination: string) =>
  new Response(
    JSON.stringify({
      type: "complete",
      response: { reply: "Updated", plan: { ...plan, brief: { ...plan.brief, destination } } },
    }),
  );
const openPreferences = () =>
  fireEvent.click(screen.getByRole("button", { name: "Open trip preferences" }));
const googlePlace = {
  id: "place-museum",
  displayName: "Museum",
  formattedAddress: "Sydney NSW, Australia",
  location: { latitude: -33.8688, longitude: 151.2093 },
};
const withPlaceRequests = (...responses: Response[]) => {
  let next = 0;
  return vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/places/search")
      return Promise.resolve(Response.json({ places: [googlePlace] }));
    if (url === "/api/places/details")
      return Promise.resolve(Response.json({ place: googlePlace }));
    return Promise.resolve(responses[next++]!);
  });
};

describe("Workspace interactions", () => {
  it("opens side drawers over the workspace and removes them completely when closed", async () => {
    render(<Workspace initialPlan={plan} />);
    const trip = document.querySelector('[aria-label="Your trip panel"]')!;
    expect(trip.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Open your trip" }));
    expect(trip.getAttribute("aria-hidden")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Close your trip" }));
    expect(trip.getAttribute("aria-hidden")).toBe("true");
    await waitFor(() => {
      const catalog = parseCatalog(localStorage.getItem(CATALOG_KEY));
      expect(catalog.layout.preferences.open).toBe(false);
      expect(catalog.layout.trip.open).toBe(false);
    });
  });
  it("starts a blank conversation instead of carrying the demo trip into New chat", async () => {
    render(<Workspace initialPlan={plan} />);
    fireEvent.click(screen.getByRole("button", { name: "+ New chat" }));
    openPreferences();
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Message AI Trip Planner") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Open your trip" }));
    expect(screen.getByText(/Tell us where you want to go/)).toBeTruthy();
    await waitFor(() => {
      const catalog = parseCatalog(localStorage.getItem(CATALOG_KEY));
      const active = catalog.conversations.find(
        (conversation) => conversation.id === catalog.activeConversationId,
      );
      expect(active?.tripId).toBeUndefined();
    });
  });
  it("renders the shell before the demo resolves without persisting a placeholder", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    render(<Workspace />);
    expect(screen.getByText(/Drafting your plan/)).toBeTruthy();
    expect(localStorage.getItem(CURRENT_KEY)).toBeNull();
    await act(async () => {
      finish(Response.json({ plan }));
    });
    openPreferences();
    expect(screen.getByLabelText("Destination")).toBeTruthy();
  });
  it("restores the complete local workspace without requesting a demo", () => {
    localStorage.setItem(CURRENT_KEY, JSON.stringify({ ...snapshot, input: "unfinished" }));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<Workspace />);
    expect(fetcher.mock.calls.some(([url]) => url === "/api/demo")).toBe(false);
    expect((screen.getByLabelText("Message AI Trip Planner") as HTMLInputElement).value).toBe(
      "unfinished",
    );
  });
  it("retries failed demo loading and preserves corrupt storage", async () => {
    localStorage.setItem(CURRENT_KEY, "broken");
    vi.stubGlobal(
      "fetch",
      withPlaceRequests(new Response("", { status: 503 }), Response.json({ plan })),
    );
    render(<Workspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry planning" }));
    await screen.findByRole("button", { name: "Open trip preferences" });
    openPreferences();
    await screen.findByLabelText("Destination");
    expect(await screen.findByText(/last workspace could not be restored/)).toBeTruthy();
    expect(localStorage.getItem(CURRENT_KEY)).toBe("broken");
  });
  it("aborts the initial demo request on unmount", () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<Workspace />);
    const signal = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]![1].signal!;
    view.unmount();
    expect(signal.aborted).toBe(true);
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
    expect(screen.getByText(/Sydney · 2026-10-01/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry update" }));
    await screen.findByText(/Paris · 2026-10-01/);
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
    fireEvent.click(screen.getByRole("button", { name: "Saved trips" }));
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
  it("saves and restores an unfinished form and conversation input after remount", async () => {
    const view = render(<Workspace initialPlan={plan} />);
    openPreferences();
    fireEvent.change(screen.getByLabelText("Total budget (USD)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Message AI Trip Planner"), {
      target: { value: "unfinished request" },
    });
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(CURRENT_KEY)!).input).toBe("unfinished request"),
    );
    view.unmount();
    render(<Workspace initialPlan={plan} />);
    expect((screen.getByLabelText("Total budget (USD)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Message AI Trip Planner") as HTMLInputElement).value).toBe(
      "unfinished request",
    );
  });
  it("keeps corrupt storage intact and tolerates quota failures", async () => {
    localStorage.setItem(CURRENT_KEY, "broken");
    render(<Workspace initialPlan={plan} />);
    expect(localStorage.getItem(CURRENT_KEY)).toBe("broken");
    expect(screen.getByRole("alert").textContent).toContain("could not be restored");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry / replace workspace storage" }));
    expect(screen.getByRole("alert").textContent).toContain("unavailable or full");
    expect(screen.getByText(/Sydney · 2026-10-01/)).toBeTruthy();
  });
});
