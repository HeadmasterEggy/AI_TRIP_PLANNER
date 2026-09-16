import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Workspace } from "./Workspace";
import { CURRENT_KEY, SAVED_KEY } from "@/lib/workspace";
import { plan, snapshot } from "@/lib/test-fixtures";
const complete = (destination: string) =>
  new Response(
    JSON.stringify({
      type: "complete",
      response: { reply: "Updated", plan: { ...plan, brief: { ...plan.brief, destination } } },
    }),
  );

describe("Workspace interactions", () => {
  it("keeps the plan and draft on failure and retries the same structured request", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"Offline"}', { status: 503 }))
      .mockResolvedValueOnce(complete("Paris"));
    vi.stubGlobal("fetch", fetcher);
    render(<Workspace initialPlan={plan} />);
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Paris" } });
    fireEvent.click(screen.getByRole("button", { name: "Update trip" }));
    await screen.findByText("Offline");
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("Paris");
    expect(screen.getByText(/Sydney · 2026-10-01/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry update" }));
    await screen.findByText(/Paris · 2026-10-01/);
    const first = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(first.mode).toBe("plan");
    expect(first.brief.destination).toBe("Paris");
    expect(fetcher.mock.calls[0]![1].body).toBe(fetcher.mock.calls[1]![1].body);
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
    fireEvent.click(screen.getByRole("button", { name: "Update trip" }));
    fireEvent.click(screen.getByRole("button", { name: "Saved trips" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore trip" }));
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
