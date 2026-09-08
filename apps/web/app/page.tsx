// Owner: E (layout / composition). Server component: computes the first plan.
import { runOrchestrator, DEMO_BRIEF } from "@trip/orchestrator";
import { Header } from "@/components/Header";
import { Workspace } from "@/components/Workspace";

export default async function Page() {
  // Start with a complete example; each chat request then updates this brief and
  // re-runs the orchestrator through POST /api/chat.
  const plan = await runOrchestrator(DEMO_BRIEF);

  return (
    <>
      <Header />
      <Workspace initialPlan={plan} />
    </>
  );
}
