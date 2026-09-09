"use client";

// Owner: E — holds the live TripPlan on the client so a chat message can
// swap in a fresh plan without a full page reload.
import { useRef, useState } from "react";
import type { TripPlan } from "@trip/shared";
import { FiltersPanel } from "@/components/FiltersPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { TripPanel } from "@/components/TripPanel";

export function Workspace({ initialPlan }: { initialPlan: TripPlan }) {
  const [plan, setPlan] = useState(initialPlan);
  const composerRef = useRef<HTMLInputElement>(null);

  return (
    <main className="layout">
      <FiltersPanel brief={plan.brief} />
      <ChatPanel brief={plan.brief} onPlan={setPlan} inputRef={composerRef} />
      <TripPanel plan={plan} onReview={() => composerRef.current?.focus()} />
    </main>
  );
}
