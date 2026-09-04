// Owner: A — ToolGateway
// One place that decides mock vs real for every external tool call.

import * as mapsAdapter from "./maps";
import * as bookingAdapter from "./booking";

export interface ToolGateway {
  maps: typeof mapsAdapter;
  booking: typeof bookingAdapter;
}

export function createToolGateway(): ToolGateway {
  const useMock = process.env.USE_MOCK_TOOLS !== "false";
  if (!useMock) {
    // TODO(B/C): wire the real Maps / Booking APIs and return real adapters here.
    throw new Error("Real tool adapters are not implemented. Set USE_MOCK_TOOLS=true for now.");
  }
  return { maps: mapsAdapter, booking: bookingAdapter };
}
