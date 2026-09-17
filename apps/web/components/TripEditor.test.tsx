import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TripEditor } from "./TripEditor";
import { plan as seed } from "@/lib/test-fixtures";
import { identifyActivities } from "@/lib/workspace";
import { TripPlan } from "@trip/shared";
function fixture() {
  const plan = identifyActivities(structuredClone(seed));
  Object.assign(plan.sections[0]!.proposal!.items[0]!, {
    day: 1,
    startTime: "09:00",
    endTime: "10:00",
  });
  return plan;
}
const response = (plan: TripPlan) =>
  new Response(
    JSON.stringify({
      plan: { ...plan, editVersion: 1 },
      baseVersion: 0,
      routes: [],
      differences: ["Time changed"],
      blockers: [],
    }),
  );
describe("editor request lifecycle", () => {
  it("discards a late preview after workspace restore", async () => {
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
    const original = fixture(),
      apply = vi.fn(),
      pending = vi.fn();
    const { rerender } = render(
      <TripEditor plan={original} disabled={false} onApply={apply} onPending={pending} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview time" }));
    const restored = { ...original, tripId: "restored" };
    rerender(<TripEditor plan={restored} disabled={false} onApply={apply} onPending={pending} />);
    finish(response(original));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Apply changes" })).toBeNull());
    expect(apply).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("Escape cancels a preview and restores keyboard focus", async () => {
    const plan = fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(plan)),
    );
    render(<TripEditor plan={plan} disabled={false} onApply={vi.fn()} onPending={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    const trigger = screen.getByRole("button", { name: "Preview time" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("button", { name: "Apply changes" });
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Edit preview" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Apply changes" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    vi.unstubAllGlobals();
  });
});
