import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AgentProgressEvent } from "@trip/shared";
import { ChatPanel } from "./ChatPanel";

const activity = (type: string): AgentProgressEvent =>
  ({
    type,
    agent: "itinerary",
    round: 1,
    ...(type === "agent_failed" ? { error: "Retry" } : {}),
  }) as AgentProgressEvent;

function Chat({ activityEvents = [] }: { activityEvents?: AgentProgressEvent[] }) {
  const [input, setInput] = useState("");
  return (
    <ChatPanel
      messages={[{ role: "agent", text: "Hello" }]}
      input={input}
      onInput={setInput}
      busy={false}
      activity={activityEvents}
      onSend={vi.fn()}
      onDecision={vi.fn()}
      onEdit={vi.fn()}
    />
  );
}

describe("ChatPanel", () => {
  it("prefills a suggestion without sending or adding a message", () => {
    const onSend = vi.fn();
    function EmptyChat() {
      const [input, setInput] = useState("");
      return (
        <ChatPanel
          messages={[]}
          input={input}
          onInput={setInput}
          busy={false}
          activity={[]}
          onSend={onSend}
          onDecision={vi.fn()}
          onEdit={vi.fn()}
        />
      );
    }
    render(<EmptyChat />);

    const log = screen.getByRole("log");
    expect(screen.getByRole("heading", { name: "Where to next?" })).toBeTruthy();
    expect(within(log).queryByText(/.+/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /week in paris/i }));

    const input = screen.getByRole("textbox", { name: "Message AI Trip Planner" });
    expect((input as HTMLInputElement).value).toBe(
      "Plan a week in Paris with food, museums and day trips.",
    );
    expect(document.activeElement).toBe(input);
    expect(within(log).queryByText(/.+/)).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
  });

  it.each([
    ["agent_started", "Running"],
    ["agent_completed", "Complete"],
    ["agent_failed", "Needs attention"],
    ["unexpected", "Unknown status"],
  ])("exposes %s progress as %s and keeps details collapsed", (type, status) => {
    render(<Chat activityEvents={[activity(type)]} />);

    const progress = screen.getByRole("region", { name: "Planning progress" });
    expect(
      within(progress).getByRole("listitem", { name: new RegExp(`Day plan.*${status}`) }),
    ).toBeTruthy();
    const details = within(progress).getByRole("group", { name: "Day plan details" });
    expect(details.hasAttribute("open")).toBe(false);
    fireEvent.click(details.querySelector("summary")!);
    expect(details.hasAttribute("open")).toBe(true);
  });
});
