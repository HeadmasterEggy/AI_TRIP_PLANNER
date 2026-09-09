// Owner: E (layout / composition). Server component: computes the first plan.
import { Suspense } from "react";
import { getDemoPlan } from "@/lib/demoPlan";
import { Header } from "@/components/Header";
import { Workspace } from "@/components/Workspace";
import { WorkspaceSkeleton } from "@/components/WorkspaceSkeleton";

// The initial plan can call a configured model, so it must be produced at
// request time rather than frozen (and billed) during `next build`. It is
// memoised per server process in `lib/demoPlan`, not per request.
export const dynamic = "force-dynamic";

// The orchestrator negotiates across several model calls, so the first plan
// takes seconds. Streaming it from inside Suspense lets the shell paint
// immediately instead of holding the whole response back.
async function PlannedWorkspace() {
  const plan = await getDemoPlan();
  return <Workspace initialPlan={plan} />;
}

export default function Page() {
  return (
    <>
      <Header />
      <Suspense fallback={<WorkspaceSkeleton />}>
        <PlannedWorkspace />
      </Suspense>
    </>
  );
}
