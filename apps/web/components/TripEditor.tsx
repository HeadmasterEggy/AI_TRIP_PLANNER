"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { TripPlan } from "@trip/shared";
import type { GooglePlace, RouteResult } from "@/lib/google";
import type { EditInput, EditPreview } from "@/lib/trip-edit";
const TripMap = dynamic(() => import("./TripMap").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <p>Loading map…</p>,
});
export function TripEditor({
  plan,
  disabled,
  onApply,
  onPending,
  onViewChange,
  currentView,
  onReview,
  onSave,
}: {
  plan: TripPlan;
  disabled: boolean;
  onApply(plan: TripPlan): void;
  onPending(value: boolean): void;
  onViewChange?(view: "overview" | "timeline" | "map"): void;
  currentView?: "overview" | "timeline" | "map";
  onReview?(): void;
  onSave?(): void;
}) {
  const [localView, setView] = useState<"overview" | "timeline" | "map">("overview");
  const view = currentView ?? localView;
  const [day, setDay] = useState(1),
    [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"WALK" | "TRANSIT">("WALK");
  const [places, setPlaces] = useState<Record<string, GooglePlace>>({});
  const [runtimePlaceIds, setRuntimePlaceIds] = useState<Record<string, string>>({});
  const [placeRetry, setPlaceRetry] = useState(0);
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
  const attemptedPlaces = useRef(new Set<string>());
  const current = useRef(plan);
  current.current = plan;
  const activities = useMemo(
    () =>
      plan.sections
        .find((s) => s.id === "itinerary")
        ?.proposal?.items.filter((i) => i.kind === "activity") ?? [],
    [plan],
  );
  const daily = useMemo(() => activities.filter((a) => a.day === day), [activities, day]);
  const dayPlaces = useMemo(
    () =>
      daily.flatMap((activity) => {
        const placeId =
          activity.placeId ?? (activity.id ? runtimePlaceIds[activity.id] : undefined);
        return placeId && places[placeId] ? [places[placeId]!] : [];
      }),
    [daily, places, runtimePlaceIds],
  );
  const active = activities.find((a) => a.id === selected);
  const days = (Date.parse(plan.brief.dates[1]) - Date.parse(plan.brief.dates[0])) / 86400000;
  useEffect(() => {
    setDay((value) => Math.min(Math.max(1, value), Math.max(1, days)));
  }, [days]);
  useEffect(() => {
    if (selected && !daily.some((item) => item.id === selected)) setSelected("");
  }, [daily, selected]);
  useEffect(() => {
    request.current?.abort();
    setPreview(undefined);
    if (applied.current !== plan) {
      setUndo(undefined);
      setVerifiedRoutes([]);
    }
    applied.current = null;
    setWorking(false);
    attemptedPlaces.current.clear();
    setRuntimePlaceIds({});
  }, [plan]);
  useEffect(() => {
    onPending(!!preview || working);
  }, [preview, working, onPending]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!preview) {
      returnFocus.current?.focus();
      return;
    }
    previewRoot.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreview(undefined);
        returnFocus.current?.focus();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [preview]);
  useEffect(() => {
    if (view === "overview") return;
    const controller = new AbortController();
    const attempted = attemptedPlaces.current;
    const ids = [
      ...new Set(
        daily.flatMap((item) => (item.placeId && !places[item.placeId] ? [item.placeId] : [])),
      ),
    ];
    const unresolved = daily.filter(
      (item) =>
        item.id &&
        !item.placeId &&
        !runtimePlaceIds[item.id] &&
        !attempted.has(item.id),
    );
    unresolved.forEach((item) => attempted.add(item.id!));
    if (ids.length || unresolved.length)
      void Promise.allSettled([
        ...ids.map(async (placeId) => {
          const response = await fetch("/api/places/details", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ placeId }),
            signal: controller.signal,
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          return { place: body.place as GooglePlace };
        }),
        ...unresolved.map(async (activity) => {
          const response = await fetch("/api/places/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: activity.detail, destination: plan.brief.destination }),
            signal: controller.signal,
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          const place = (body.places as GooglePlace[] | undefined)?.find(
            (candidate) => candidate.location,
          );
          if (!place) throw new Error(`No Google place matched ${activity.detail}.`);
          return { place, activityId: activity.id! };
        }),
      ]).then((results) => {
        if (controller.signal.aborted) return;
        const found = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        if (found.length)
          setPlaces((old) => ({
            ...old,
            ...Object.fromEntries(found.map(({ place }) => [place.id, place])),
          }));
        const resolved = found.filter(
          (item): item is { place: GooglePlace; activityId: string } => "activityId" in item,
        );
        if (resolved.length)
          setRuntimePlaceIds((old) => ({
            ...old,
            ...Object.fromEntries(resolved.map(({ activityId, place }) => [activityId, place.id])),
          }));
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected")
          setError(
            failed.reason instanceof Error
              ? failed.reason.message
              : "Place details unavailable. Change day or reopen the map to retry.",
          );
      });
    return () => {
      controller.abort();
      unresolved.forEach((item) => item.id && attempted.delete(item.id));
    };
  }, [daily, view, places, placeRetry, plan.brief.destination, runtimePlaceIds]);
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
  const selectPlace = useCallback(
    (placeId: string) => {
      const item = daily.find(
        (activity) =>
          activity.placeId === placeId ||
          (activity.id !== undefined && runtimePlaceIds[activity.id] === placeId),
      );
      if (item?.id) setSelected(item.id);
    },
    [daily, runtimePlaceIds],
  );
  const locked = disabled || working || !!preview;
  return (
    <section className="trip-editor" aria-label="Trip timeline and map">
      <nav aria-label="Trip views">
        {(["overview", "timeline", "map"] as const).map((v) => (
          <button
            key={v}
            aria-pressed={view === v}
            onClick={() => {
              setView(v);
              onViewChange?.(v);
            }}
          >
            {v[0]!.toUpperCase() + v.slice(1)}
          </button>
        ))}
      </nav>
      {view === "overview" ? (
        <p>
          Explore your daily schedule and Google map. Hotels and transport remain read-only. Chat
          replanning replaces manually edited activities.
        </p>
      ) : (
        <>
          <div className="editor-actions">
            <button disabled={locked} onClick={onReview}>
              Review plan
            </button>
            <button disabled={locked} onClick={onSave}>
              Save trip
            </button>
          </div>
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
          <p>
            Walking routes may miss sidewalks or pedestrian paths; check conditions before
            travelling.
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
                  <button aria-pressed={selected === item.id} onClick={() => setSelected(item.id!)}>
                    {item.startTime ?? "Time missing"}–{item.endTime} · {item.detail}
                  </button>
                  <p>
                    {item.placeId
                      ? (places[item.placeId]?.displayName?.text ?? "Place details not loaded")
                      : "Location unverified — select a Google place"}
                  </p>
                  <p>
                    {item.estCost === undefined
                      ? "Activity price unknown"
                      : `USD ${item.estCost.toFixed(2)}${item.priceNeedsReview ? " · needs verification" : " estimated"}`}
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
                        {place.displayName?.text} ·{" "}
                        {place.formattedAddress ?? "Address unavailable"}
                      </p>
                      <button
                        disabled={locked}
                        onClick={() => {
                          setPlaces((old) => ({ ...old, [place.id]: place }));
                          void edit({ kind: "place", id: active.id!, placeId: place.id });
                        }}
                      >
                        Preview this place
                      </button>
                    </div>
                  ))}
                  {active.placeId && places[active.placeId] && (
                    <p>
                      {places[active.placeId]!.formattedAddress ?? "Address unavailable"} · Google
                      rating: {places[active.placeId]!.rating ?? "unavailable"}{" "}
                      {places[active.placeId]!.googleMapsUri && (
                        <a
                          href={places[active.placeId]!.googleMapsUri}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View on Google Maps
                        </a>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
            {view === "map" && (
              <div>
                {!daily.length ? (
                  <div className="map-empty">
                    <h3>No activities for this day</h3>
                    <p>Add an activity to this day to show it on the map.</p>
                  </div>
                ) : dayPlaces.length ? (
                  <TripMap
                    places={dayPlaces}
                    selected={
                      active?.placeId ?? (active?.id ? runtimePlaceIds[active.id] : undefined)
                    }
                    onSelect={selectPlace}
                    mode={mode}
                    routes={(preview?.routes ?? verifiedRoutes).filter(
                      (r) =>
                        daily.some((a) => a.placeId === r.from) &&
                        daily.some((a) => a.placeId === r.to),
                    )}
                  />
                ) : (
                  <div className="map-empty" role={error ? "alert" : "status"}>
                    <p>{error || "Loading verified Google place details…"}</p>
                    {error && (
                      <button
                        onClick={() => {
                          daily.forEach(
                            (item) => item.id && attemptedPlaces.current.delete(item.id),
                          );
                          setError("");
                          setPlaceRetry((value) => value + 1);
                        }}
                      >
                        Retry places
                      </button>
                    )}
                  </div>
                )}
                <p>
                  Google Maps · Named activities without a saved place ID are matched at runtime and
                  remain unverified until selected. Simulated hotels are not mapped.
                </p>
              </div>
            )}
          </div>
        </>
      )}
      {working && <p role="status">Verifying edit…</p>}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div
          ref={previewRoot}
          tabIndex={-1}
          className="edit-preview"
          role="region"
          aria-label="Edit preview"
        >
          <h3>Preview changes</h3>
          <p>
            Trip estimate: USD {preview.plan.estTotal.toFixed(2)} · Change: USD{" "}
            {(preview.plan.estTotal - plan.estTotal).toFixed(2)} · Budget difference: USD{" "}
            {(preview.plan.budgetTotal - preview.plan.estTotal).toFixed(2)}. Route fares are
            separate and are not added to the transport budget.
          </p>
          {preview.differences.map((d, i) => (
            <p key={i}>{d}</p>
          ))}
          {!preview.differences.length && <p>Activity order or route verification updated.</p>}
          {preview.routes.map((r, i) => (
            <p key={i}>
              {r.mode}: {r.durationMin ?? "Unknown"} minutes ·{" "}
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
