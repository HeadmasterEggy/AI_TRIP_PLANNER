"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { TripPlan } from "@trip/shared";
import type { GooglePlace, RouteResult } from "@/lib/google";
import type { EditInput, EditPreview } from "@/lib/trip-edit";
import type { TripPlaces } from "./useTripPlaces";
import { money } from "@/lib/workspace";

/**
 * Day timeline and activity editor shown inside the Your Trip drawer. Place data and the
 * selected activity are shared with the map canvas, so selecting either side highlights both.
 */
export function TripEditor({
  plan,
  disabled,
  onApply,
  onPending,
  tripPlaces,
  selected = "",
  onSelect,
  onRoutesChange,
}: {
  plan: TripPlan;
  disabled: boolean;
  onApply(plan: TripPlan): void;
  onPending(value: boolean): void;
  tripPlaces: TripPlaces;
  selected?: string;
  onSelect(activityId: string): void;
  /** Routes to draw on the map: the open preview's routes, otherwise the last verified ones. */
  onRoutesChange?(routes: RouteResult[]): void;
}) {
  const { activities, places, placeIdFor, rememberPlace, locationStatus } = tripPlaces;
  const [day, setDay] = useState(1);
  const [mode, setMode] = useState<"WALK" | "TRANSIT">("WALK");
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<GooglePlace[]>([]);
  const [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<EditPreview>();
  const [undo, setUndo] = useState<EditInput["operation"]>();
  const [verifiedRoutes, setVerifiedRoutes] = useState<RouteResult[]>([]);
  const applied = useRef<TripPlan | null>(null);
  const previewRoot = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const current = useRef(plan);
  current.current = plan;
  const daily = useMemo(() => activities.filter((a) => a.day === day), [activities, day]);
  const active = activities.find((a) => a.id === selected);
  const activePlaceId = active ? placeIdFor(active) : undefined;
  const days = Math.max(
    1,
    (Date.parse(plan.brief.dates[1]) - Date.parse(plan.brief.dates[0])) / 86400000,
  );
  useEffect(() => {
    setDay((value) => Math.min(Math.max(1, value), days));
  }, [days]);
  // Selecting a marker on the map jumps the timeline to that activity's day.
  useEffect(() => {
    if (active?.day && active.day !== day) setDay(active.day);
    // Only follow selection changes; manual day changes must not be undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  useEffect(() => {
    request.current?.abort();
    setPreview(undefined);
    if (applied.current !== plan) {
      setUndo(undefined);
      setVerifiedRoutes([]);
    }
    applied.current = null;
    setWorking(false);
  }, [plan]);
  useEffect(() => {
    onPending(!!preview || working);
  }, [preview, working, onPending]);
  const routesSynced = useRef(false);
  useEffect(() => {
    // Skip the mount: reopening the timeline must not erase routes already on the map.
    if (!routesSynced.current) {
      routesSynced.current = true;
      return;
    }
    onRoutesChange?.(preview?.routes ?? verifiedRoutes);
  }, [preview, verifiedRoutes, onRoutesChange]);
  useEffect(
    () => () => {
      request.current?.abort();
      onPending(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    if (!preview) {
      returnFocus.current?.focus();
      return;
    }
    previewRoot.current?.focus();
  }, [preview]);
  async function edit(operation: EditInput["operation"]) {
    returnFocus.current = document.activeElement as HTMLElement;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const base = plan;
    setWorking(true);
    setError("");
    setPreview(undefined);
    try {
      const response = await fetch("/api/trip/preview-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, baseVersion: plan.editVersion ?? 0, operation, mode }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (!controller.signal.aborted && current.current === base)
        setPreview({ ...body, plan: TripPlan.parse(body.plan) });
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Preview failed. Retry your edit.");
    } finally {
      if (request.current === controller) setWorking(false);
    }
  }
  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query, destination: plan.brief.destination }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (!controller.signal.aborted) {
        setResults(body.places);
        if (!body.places.length) setError("No places found. Try a different search.");
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (request.current === controller) setWorking(false);
    }
  }
  const locked = disabled || working || !!preview;
  const locationLabel = (item: (typeof activities)[number]) => {
    const placeId = placeIdFor(item);
    const name = placeId ? places[placeId]?.displayName?.text : undefined;
    switch (locationStatus(item)) {
      case "located":
        return item.placeId
          ? (name ?? "Google place")
          : `Map match: ${name ?? "Google place"} · unverified`;
      case "loading":
        return "Finding this place…";
      case "unavailable":
        return "Place could not be loaded right now — retry from the map";
      default:
        return "Location to be confirmed — search for a Google place";
    }
  };
  return (
    <section className="trip-editor" aria-label="Trip timeline">
      <div className="editor-toolbar">
        <label>
          Day{" "}
          <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {Array.from({ length: days }, (_, i) => (
              <option key={i} value={i + 1}>
                {new Date(Date.parse(plan.brief.dates[0]) + i * 86400000)
                  .toISOString()
                  .slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Route mode{" "}
          <select
            disabled={locked}
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="WALK">Walk</option>
            <option value="TRANSIT">Public transit</option>
          </select>
        </label>
        <p>
          Routes use local departure times plus a 15-minute buffer. Route fares are separate from
          the existing transport budget.
        </p>
        <button disabled={locked} onClick={() => void edit({ kind: "verify", day })}>
          Verify day routes
        </button>
      </div>
      <p>
        Walking routes may miss sidewalks or pedestrian paths; check conditions before travelling.
      </p>
      <div className="editor-columns">
        <div>
          <h3>Fixed transport and stays</h3>
          {plan.sections
            .filter((s) => s.id === "transport" || s.id === "accommodation")
            .flatMap(
              (s) =>
                s.proposal?.items
                  .filter((item) => item.day === day)
                  .map((item, i) => (
                    <p key={`${s.id}-${i}`}>
                      {s.label} · {item.startTime} {item.endTime && `–${item.endTime}`} ·{" "}
                      {item.detail} · Read-only
                    </p>
                  )) ?? [],
            )}
          {!daily.length && <p>No activities scheduled on this day.</p>}
          {daily.map((item, index) => (
            <article
              key={item.id}
              className="editor-activity"
              draggable={!locked}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id!)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!locked)
                  void edit({
                    kind: "move",
                    id: e.dataTransfer.getData("text/plain"),
                    day,
                    index,
                  });
              }}
            >
              <button aria-pressed={selected === item.id} onClick={() => onSelect(item.id!)}>
                {item.startTime ?? "Time missing"}–{item.endTime} · {item.detail}
              </button>
              <p>{locationLabel(item)}</p>
              <p>
                {item.estCost === undefined
                  ? "Activity price unknown"
                  : `${money(item.estCost)}${item.priceNeedsReview ? " · needs verification" : " estimated"}`}
              </p>
              <button
                disabled={locked || index === 0}
                onClick={() => void edit({ kind: "move", id: item.id!, day, index: index - 1 })}
              >
                Move up
              </button>
              <button
                disabled={locked || index === daily.length - 1}
                onClick={() => void edit({ kind: "move", id: item.id!, day, index: index + 1 })}
              >
                Move down
              </button>
              <label>
                Move to day{" "}
                <select
                  disabled={locked}
                  value={day}
                  onChange={(e) =>
                    void edit({
                      kind: "move",
                      id: item.id!,
                      day: Number(e.target.value),
                      index: 0,
                    })
                  }
                >
                  {Array.from({ length: days }, (_, d) => (
                    <option key={d} value={d + 1}>
                      {d + 1}
                    </option>
                  ))}
                </select>
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void edit({
                    kind: "time",
                    id: item.id!,
                    startTime: String(data.get("start")),
                    endTime: String(data.get("end")),
                  });
                }}
              >
                <label>
                  Start{" "}
                  <input
                    aria-label={`Start ${item.detail}`}
                    name="start"
                    type="time"
                    required
                    defaultValue={item.startTime}
                    key={`start-${plan.editVersion}-${item.startTime}`}
                    disabled={locked}
                  />
                </label>
                <label>
                  End{" "}
                  <input
                    aria-label={`End ${item.detail}`}
                    name="end"
                    type="time"
                    required
                    defaultValue={item.endTime}
                    key={`end-${plan.editVersion}-${item.endTime}`}
                    disabled={locked}
                  />
                </label>
                <button disabled={locked}>Preview time</button>
              </form>
            </article>
          ))}
          {active && (
            <div>
              <h3>Replace selected activity place</h3>
              <label>
                Search Google Places{" "}
                <input value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <button disabled={locked || !query.trim()} onClick={() => void search()}>
                Search places
              </button>
              <p>Place information provided by Google Maps.</p>
              {results.map((place) => (
                <div key={place.id}>
                  <p>
                    {place.displayName?.text} · {place.formattedAddress ?? "Address unavailable"}
                  </p>
                  <button
                    disabled={locked}
                    onClick={() => {
                      rememberPlace(place);
                      void edit({ kind: "place", id: active.id!, placeId: place.id });
                    }}
                  >
                    Preview this place
                  </button>
                </div>
              ))}
              {activePlaceId && places[activePlaceId] && (
                <p>
                  {places[activePlaceId]!.formattedAddress ?? "Address unavailable"} · Google
                  rating: {places[activePlaceId]!.rating ?? "unavailable"}{" "}
                  {places[activePlaceId]!.googleMapsUri && (
                    <a href={places[activePlaceId]!.googleMapsUri} target="_blank" rel="noreferrer">
                      View on Google Maps
                    </a>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      {working && <p role="status">Verifying edit…</p>}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div
          ref={previewRoot}
          tabIndex={-1}
          className="edit-preview"
          role="region"
          aria-label="Edit preview"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            // Close only the preview, not the surrounding drawer.
            event.preventDefault();
            event.stopPropagation();
            setPreview(undefined);
            returnFocus.current?.focus();
          }}
        >
          <h3>Preview changes</h3>
          <p>
            Trip estimate: {money(preview.plan.estTotal)} · Change:{" "}
            {money(preview.plan.estTotal - plan.estTotal)} · Budget difference:{" "}
            {money(preview.plan.budgetTotal - preview.plan.estTotal)}. Route fares are shown in the
            provider&apos;s own currency and are not added to the transport budget.
          </p>
          {preview.differences.map((d, i) => (
            <p key={i}>{d}</p>
          ))}
          {!preview.differences.length && <p>Activity order or route verification updated.</p>}
          {preview.routes.map((r, i) => (
            <p key={i}>
              {r.mode}: {r.durationMin ?? "Unknown"} minutes ·{" "}
              {/* The provider's currency, deliberately not converted and not counted. */}
              {r.fare ? `${r.fare.currency} ${r.fare.amount.toFixed(2)}` : "Fare unavailable"}
            </p>
          ))}
          {preview.blockers.map((b, i) => (
            <p role="alert" key={i}>
              {b}
            </p>
          ))}
          {preview.plan.conflicts?.map((c, i) => (
            <p key={i}>{c.reason}</p>
          ))}
          <button
            disabled={disabled || !!preview.blockers.length}
            onClick={() => {
              if (preview.baseVersion !== (plan.editVersion ?? 0)) {
                setError("Preview is stale. Please retry.");
                return;
              }
              const previous: EditInput["operation"] = {
                kind: "undo",
                activities: activities.map((a) => ({
                  id: a.id!,
                  day: a.day!,
                  startTime: a.startTime!,
                  endTime: a.endTime!,
                  placeId: a.placeId,
                  priceNeedsReview: a.priceNeedsReview,
                })),
              };
              applied.current = preview.plan;
              setUndo(previous);
              setVerifiedRoutes(preview.routes);
              onApply(preview.plan);
              setPreview(undefined);
            }}
          >
            Apply changes
          </button>
          <button
            onClick={() => {
              setPreview(undefined);
              returnFocus.current?.focus();
            }}
          >
            Cancel preview
          </button>
        </div>
      )}
      {undo && (
        <button disabled={locked} onClick={() => void edit(undo)}>
          Preview undo last edit
        </button>
      )}
    </section>
  );
}
