// Owner: E (layout / composition). Server component: computes the first plan.
import { runOrchestrator, DEMO_BRIEF } from "@trip/orchestrator";
import { Header } from "@/components/Header";
import { Workspace } from "@/components/Workspace";

export default async function Page() {
  // TODO(A/E): once chat parsing exists, the first render can stay on DEMO_BRIEF
  // but every message re-runs the orchestrator via POST /api/chat (ChatResponse).
  const plan = await runOrchestrator(DEMO_BRIEF);

  return (
    <>
      <Header />
      <Workspace initialPlan={plan} />
    </>
  );
}
