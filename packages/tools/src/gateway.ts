// Owner: A — ToolGateway
// One place that decides mock vs real for every external tool call.
// The Orchestrator calls createToolGateway() once per run and injects the
// result into every agent via AgentContext.tools.

import type { ToolGateway } from "@trip/shared";
import * as mapsAdapter from "./maps";
import * as bookingAdapter from "./booking";

export function createToolGateway(): ToolGateway {
  const useMock = process.env.USE_MOCK_TOOLS !== "false";
  if (!useMock) {
    // TODO(B/C): construct and return the real Maps / Booking adapters here.
    console.warn(
      "[tools] USE_MOCK_TOOLS=false but real adapters are not implemented — falling back to mocks.",
    );
  }
  return { maps: mapsAdapter, booking: bookingAdapter };
}
