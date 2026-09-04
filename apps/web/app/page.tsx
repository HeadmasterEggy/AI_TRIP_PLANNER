// Owner: E (layout / composition). Server component: fetches the initial plan.
import { runOrchestrator, DEMO_BRIEF } from "@trip/orchestrator";
import { Header } from "@/components/Header";
import { FiltersPanel } from "@/components/FiltersPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { TripPanel } from "@/components/TripPanel";

export default async function Page() {
  // TODO(A/E): once chat parsing exists, build the brief from the conversation
  // instead of DEMO_BRIEF, and re-run the orchestrator per message.
  const plan = await runOrchestrator(DEMO_BRIEF);

  return (
    <>
      <Header />
      <main className="layout">
        <FiltersPanel brief={DEMO_BRIEF} />
        <ChatPanel />
        <TripPanel plan={plan} />
      </main>
    </>
  );
}
