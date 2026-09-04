// Owner: A — local mock API server so nobody needs real keys in dev.
// TODO: expand the canned responses as B / C flesh out their adapters.
// Run: pnpm --filter @trip/tools mock-server   (or `pnpm mock-server` from the repo root)

import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_API_PORT ?? 4000);

const json = (res, body) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = req.url ?? "/";
  if (url.startsWith("/maps/route")) {
    return json(res, [{ mode: "train", durationMin: 140, priceUsd: 90 }]);
  }
  if (url.startsWith("/maps/places")) {
    return json(res, [{ name: "Stub attraction", category: "sight", rating: 4.5 }]);
  }
  if (url.startsWith("/booking/stays")) {
    return json(res, [{ name: "Stub Hotel", area: "Central", pricePerNightUsd: 180, rating: 8.7 }]);
  }
  if (url.startsWith("/booking/flights")) {
    return json(res, [{ carrier: "StubAir", priceUsd: 1246 }]);
  }
  if (url === "/" || url.startsWith("/health")) {
    return json(res, { ok: true, routes: ["/maps/route", "/maps/places", "/booking/stays", "/booking/flights"] });
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found", url }));
}).listen(PORT, () => {
  console.log(`[mock-apis] listening on http://localhost:${PORT}`);
});
