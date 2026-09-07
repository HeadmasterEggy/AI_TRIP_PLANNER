# Class model — design-time structure

ELEC5620 Lab 4 Part 2. Static structure of `AI_TRIP_PLANNER` as four UML 2.5 class
diagrams that share one namespace. Rendered reference (with the full relationship,
multiplicity, interface and rationale tables):
<https://claude.ai/code/artifact/06ae7f45-f805-47f0-b610-4c8f46854e42>

This is a **design** model — a light refinement of the current skeleton. Two classes
are introduced ahead of implementation and flagged below: `AbstractSpecialistAgent`
(shared agent behaviour) and `ConflictDetector` (conflict logic split out of the
orchestrator, per *separate control from function*).

Supporting types used in signatures but not expanded: `Money`, `Date`, `DateTime`,
`AbortSignal`, `RoomPlan`, `HitlDecision`, `TransportMode`, and the tool DTOs
`RouteQuery` / `PlaceQuery` / `Place` / `StayQuery` / `FlightQuery` / `FlightOption`.

## Notation

| Mark | Relationship | Meaning |
|---|---|---|
| solid line, hollow triangle | generalisation | subclass → superclass ("is a kind of") |
| dashed line, hollow triangle | realisation | class → interface ("implements") |
| solid line, filled diamond | composition | whole ◆ part; part cannot outlive the whole |
| solid line, hollow diamond | aggregation | whole ◇ part, shared; part has an independent lifetime |
| solid line, open arrow | association | source holds a stored reference to the target |
| dashed line, open arrow | dependency | transient use only (parameter, return, local); no stored field |

---

## Diagram 1 — Structural spine

Load-bearing classes across every layer: HTTP entry point, client shell that holds
plan state, orchestrator, agent registry, and the two interfaces the orchestrator
injects into every agent.

```mermaid
classDiagram
  direction TB
  class ChatRoute {
    +POST(req: ChatRequest) ChatResponse
  }
  class Workspace {
    -plan: TripPlan
    +onPlan(next: TripPlan) void
  }
  class ChatPanel {
    -messages: Message[]
    +send(text: String) void
  }
  class FiltersPanel
  class TripPanel
  class OrchestratorAgent {
    -MAX_ROUNDS: int
    -escalationOverrunPct: float
    +run(brief: TripBrief) TripPlan
    +resume(tripId: String, decision: HitlDecision) TripPlan
  }
  class AgentRegistry {
    +all() Agent[]
    +byName(name: AgentName) Agent
  }
  class Agent {
    <<interface>>
    +name: AgentName
    +label: String
    +run(brief, ctx) AgentProposal
    +revise(brief, ctx, req) AgentProposal
  }
  class ToolGateway {
    <<interface>>
  }
  class MemoryStore {
    <<interface>>
  }

  Workspace "1" *-- "1" FiltersPanel : contains
  Workspace "1" *-- "1" ChatPanel : contains
  Workspace "1" *-- "1" TripPanel : contains
  Workspace "1" --> "1" TripPlan : holds state
  FiltersPanel "1" --> "1" TripBrief : renders
  TripPanel "1" --> "1" TripPlan : renders
  ChatPanel ..> ChatRequest : sends
  ChatPanel ..> ChatResponse : receives

  ChatRoute ..> ChatRequest : validates
  ChatRoute ..> ChatResponse : returns
  ChatRoute "1" --> "1" OrchestratorAgent : delegates to

  OrchestratorAgent "1" --> "1" AgentRegistry : agents
  OrchestratorAgent "1" --> "1" ToolGateway : creates
  OrchestratorAgent "1" --> "1" MemoryStore : uses
  OrchestratorAgent ..> TripBrief : consumes
  OrchestratorAgent ..> TripPlan : produces
  AgentRegistry "1" o-- "1..*" Agent : registers
```

---

## Diagram 2 — Domain model

The value classes carried between the client, the orchestrator, and the agents.
Every field is data the agents plan against or the UI renders.

```mermaid
classDiagram
  direction TB
  class TripBrief {
    +tripId: String
    +userId: String
    +destination: String
    +startDate: Date
    +endDate: Date
    +groupSize: int
    +budgetTotal: Money
    +travelStyle: TravelStyle
    +nationality: String
    +daySpan() int
  }
  class ProposalItem {
    +kind: ProposalKind
    +detail: String
    +estCost: Money
    +day: int
  }
  class AgentProposal {
    +agent: AgentName
    +summary: String
    +assumptions: String[]
    +conflictsWith: AgentName[]
    +totalCost() Money
  }
  class RevisionRequest {
    +tripId: String
    +targetAgent: AgentName
    +reason: String
    +constraints: String[]
  }
  class TripSection {
    +id: AgentName
    +label: String
    +summary: String
    +status: SectionStatus
    +estCost: Money
  }
  class HitlCheckpoint {
    +id: String
    +type: HitlType
    +title: String
    +detail: String
    +status: CheckpointStatus
  }
  class TripPlan {
    +tripId: String
    +round: int
    +budgetTotal: Money
    +estTotal: Money
    +overrunPct: float
  }
  class ChatRequest {
    +tripId: String
    +message: String
  }
  class ChatResponse {
    +reply: String
  }
  class TravelStyle {
    <<enumeration>>
    J
    P
  }
  class AgentName {
    <<enumeration>>
    ITINERARY
    TRANSPORT
    ACCOMMODATION
    DESTINATION_GUIDE
    DINING
  }
  class SectionStatus {
    <<enumeration>>
    PLANNING
    DRAFT
    NEEDS_YOU
    CONFIRMED
  }
  class HitlType {
    <<enumeration>>
    CONFIRM_BRIEF
    CONFIRM_PLAN
    ESCALATION
  }
  class CheckpointStatus {
    <<enumeration>>
    PENDING
    APPROVED
    REJECTED
  }
  class ProposalKind {
    <<enumeration>>
    TRANSPORT
    HOTEL
    ACTIVITY
    MEAL
    NOTE
  }

  TripPlan "1" *-- "1" TripBrief : brief
  TripPlan "1" *-- "1..*" TripSection : sections
  TripPlan "1" *-- "0..*" HitlCheckpoint : hitl
  AgentProposal "1" *-- "1..*" ProposalItem : items
  TripSection "1" o-- "0..1" AgentProposal : detail
  ChatResponse "1" *-- "1" TripPlan : plan

  TripBrief ..> TravelStyle
  AgentProposal ..> AgentName
  RevisionRequest ..> AgentName
  TripSection ..> SectionStatus
  HitlCheckpoint ..> HitlType
  HitlCheckpoint ..> CheckpointStatus
  ProposalItem ..> ProposalKind
```

---

## Diagram 3 — Agents & orchestration

`OrchestratorAgent` owns the negotiation loop; it composes a `ConflictDetector` and
a `CostAggregator` and drives the five specialist agents through a registry. Each
agent receives its dependencies through `AgentContext` rather than importing them.

```mermaid
classDiagram
  direction TB
  class Agent {
    <<interface>>
    +name: AgentName
    +label: String
    +run(brief: TripBrief, ctx: AgentContext) AgentProposal
    +revise(brief: TripBrief, ctx: AgentContext, req: RevisionRequest) AgentProposal
  }
  class AbstractSpecialistAgent {
    <<abstract>>
    #name: AgentName
    #label: String
    +run(brief, ctx) AgentProposal*
    +revise(brief, ctx, req) AgentProposal
    #callModel(prompt: String) String
    #loadPreferences(ctx: AgentContext) UserPreference[]
  }
  class ItineraryPlannerAgent {
    +run(brief, ctx) AgentProposal
    +revise(brief, ctx, req) AgentProposal
    -orderActivities(brief: TripBrief) ProposalItem[]
  }
  class TransportAgent {
    +run(brief, ctx) AgentProposal
    +revise(brief, ctx, req) AgentProposal
    +checkTimeGeoConflicts(sections: TripSection[]) RevisionRequest[]
  }
  class AccommodationAgent {
    +run(brief, ctx) AgentProposal
    +revise(brief, ctx, req) AgentProposal
    -allocateRooms(groupSize: int) RoomPlan
  }
  class DestinationGuideAgent {
    +run(brief, ctx) AgentProposal
    -weatherAndPacking(destination: String, month: int) ProposalItem[]
  }
  class DiningAgent {
    +run(brief, ctx) AgentProposal
  }
  class AgentContext {
    +tripId: String
    +round: int
    +signal: AbortSignal
  }
  class AgentRegistry {
    +all() Agent[]
    +byName(name: AgentName) Agent
  }
  class OrchestratorAgent {
    -MAX_ROUNDS: int
    -escalationOverrunPct: float
    +run(brief: TripBrief) TripPlan
    +resume(tripId: String, decision: HitlDecision) TripPlan
    -dispatch(brief, ctx) AgentProposal[]
    -applyRevisions(brief, ctx, proposals, reqs) AgentProposal[]
    -aggregate(proposals) TripSection[]
    -buildHitl(brief, cost, unresolved) HitlCheckpoint[]
  }
  class ConflictDetector {
    -budgetTolerancePct: float
    +detect(proposals: AgentProposal[], brief: TripBrief) RevisionRequest[]
    -detectBudget(proposals, brief) RevisionRequest[]
    -detectTimeGeo(sections) RevisionRequest[]
  }
  class CostAggregator {
    +rollUp(sections: TripSection[], budgetTotal: Money) CostSummary
  }
  class CostSummary {
    +estTotal: Money
    +overrunPct: float
  }

  Agent <|.. AbstractSpecialistAgent
  AbstractSpecialistAgent <|-- ItineraryPlannerAgent
  AbstractSpecialistAgent <|-- TransportAgent
  AbstractSpecialistAgent <|-- AccommodationAgent
  AbstractSpecialistAgent <|-- DestinationGuideAgent
  AbstractSpecialistAgent <|-- DiningAgent

  OrchestratorAgent "1" --> "1" AgentRegistry : agents
  AgentRegistry "1" o-- "1..*" Agent : registers
  OrchestratorAgent "1" *-- "1" ConflictDetector : owns
  OrchestratorAgent "1" *-- "1" CostAggregator : owns
  OrchestratorAgent ..> AgentContext : creates
  OrchestratorAgent ..> RevisionRequest
  OrchestratorAgent ..> TripPlan : produces

  ConflictDetector ..> AgentProposal
  ConflictDetector ..> RevisionRequest : emits
  ConflictDetector ..> TransportAgent : geo check
  CostAggregator ..> TripSection
  CostAggregator ..> CostSummary : returns

  Agent ..> AgentProposal : returns
  Agent ..> AgentContext : uses
  AgentContext "1" --> "1" ToolGateway : tools
  AgentContext "1" --> "1" MemoryStore : mem
```

---

## Diagram 4 — Ports, adapters & infrastructure

The hexagonal boundary. Ports live in `packages/shared`; concrete adapters — mock
and real — implement them. `ToolGatewayImpl` is a factory that wires one adapter per
port based on `USE_MOCK_TOOLS`.

```mermaid
classDiagram
  direction TB
  class ToolGateway {
    <<interface>>
    +maps: MapsPort
    +booking: BookingPort
  }
  class MapsPort {
    <<interface>>
    +route(q: RouteQuery) RouteLeg[]
    +places(q: PlaceQuery) Place[]
  }
  class BookingPort {
    <<interface>>
    +searchStays(q: StayQuery) StayOption[]
    +searchFlights(q: FlightQuery) FlightOption[]
  }
  class ToolGatewayImpl {
    -useMock: boolean
    +create() ToolGateway$
  }
  class MockMapsAdapter {
    +route(q) RouteLeg[]
    +places(q) Place[]
  }
  class RealMapsAdapter {
    -apiKey: String
    +route(q) RouteLeg[]
    +places(q) Place[]
  }
  class MockBookingAdapter {
    +searchStays(q) StayOption[]
    +searchFlights(q) FlightOption[]
  }
  class RealBookingAdapter {
    -apiKey: String
    +searchStays(q) StayOption[]
    +searchFlights(q) FlightOption[]
  }
  class RouteLeg {
    +mode: TransportMode
    +durationMin: int
    +priceUsd: Money
  }
  class StayOption {
    +name: String
    +area: String
    +pricePerNightUsd: Money
    +rating: float
    +freeCancellation: boolean
  }
  class MemoryStore {
    <<interface>>
    +getShortTerm(tripId: String) ChatTurn[]
    +appendShortTerm(tripId: String, turn: ChatTurn) void
    +getLongTerm(userId: String) UserPreference[]
    +setLongTerm(userId: String, pref: UserPreference) void
    +promote(tripId: String, userId: String, key: String) void
  }
  class PreferenceMemoryService {
    -shortTerm: Map
    -longTerm: Map
  }
  class ChatTurn {
    +role: Role
    +content: String
    +at: DateTime
  }
  class UserPreference {
    +key: String
    +value: String
    +source: PrefSource
  }
  class NotificationService {
    <<interface>>
    +notify(userId: String, message: String) void
  }
  class StubNotificationService {
    +notify(userId, message) void
  }
  class AuthService {
    <<interface>>
    +currentUser() User
  }
  class StubAuthService {
    +currentUser() User
  }
  class User {
    +id: String
    +email: String
    +displayName: String
  }
  class Role {
    <<enumeration>>
    USER
    ASSISTANT
  }
  class PrefSource {
    <<enumeration>>
    FILTER
    CHAT_CONFIRMED
  }

  ToolGateway <|.. ToolGatewayImpl
  MapsPort <|.. MockMapsAdapter
  MapsPort <|.. RealMapsAdapter
  BookingPort <|.. MockBookingAdapter
  BookingPort <|.. RealBookingAdapter
  ToolGateway "1" o-- "1" MapsPort : maps
  ToolGateway "1" o-- "1" BookingPort : booking
  ToolGatewayImpl ..> MapsPort : instantiates
  ToolGatewayImpl ..> BookingPort : instantiates
  MapsPort ..> RouteLeg : returns
  BookingPort ..> StayOption : returns

  MemoryStore <|.. PreferenceMemoryService
  PreferenceMemoryService "1" *-- "0..*" ChatTurn : shortTerm
  PreferenceMemoryService "1" *-- "0..*" UserPreference : longTerm
  ChatTurn ..> Role
  UserPreference ..> PrefSource

  NotificationService <|.. StubNotificationService
  AuthService <|.. StubAuthService
  AuthService ..> User : returns
```

---

## Key associations & multiplicity

Read *source → target*.

| Source | Target | Type | Mult. | Meaning |
|---|---|---|---|---|
| `Workspace` | `FiltersPanel` / `ChatPanel` / `TripPanel` | composition | 1 → 1 | shell owns one of each child view |
| `Workspace` / `TripPanel` | `TripPlan` | association | 1 → 1 | holds / renders the current plan |
| `ChatRoute` | `OrchestratorAgent` | association | 1 → 1 | HTTP handler delegates every request |
| `ChatResponse` | `TripPlan` | composition | 1 → 1 | response carries a full plan |
| `OrchestratorAgent` | `ConflictDetector` / `CostAggregator` | composition | 1 → 1 | private owned helpers |
| `OrchestratorAgent` | `AgentRegistry` / `ToolGateway` / `MemoryStore` | association | 1 → 1 | looks up agents; injects tools + memory |
| `AgentRegistry` | `Agent` | aggregation | 1 → 1..* | references shared singletons; no lifecycle ownership |
| `AgentContext` | `ToolGateway` / `MemoryStore` | association | 1 → 1 | injected — the agent's only route out |
| `TripPlan` | `TripBrief` | composition | 1 → 1 | embeds an immutable snapshot |
| `TripPlan` | `TripSection` | composition | 1 → 1..* | one section per specialist agent |
| `TripPlan` | `HitlCheckpoint` | composition | 1 → 0..* | pending human decisions on this plan |
| `AgentProposal` | `ProposalItem` | composition | 1 → 1..* | a proposal is its list of line items |
| `TripSection` | `AgentProposal` | aggregation | 1 → 0..1 | holds the proposal it was built from, for drill-down |
| `ToolGateway` | `MapsPort` / `BookingPort` | aggregation | 1 → 1 | exposes one port of each kind |
| `PreferenceMemoryService` | `ChatTurn` / `UserPreference` | composition | 1 → 0..* | owns the short- / long-term records |
| `AuthService` | `User` | dependency | → 0..1 | `currentUser()` may return none |

## Interfaces & realisation

| Interface | Realised by | Note |
|---|---|---|
| `Agent` | `AbstractSpecialistAgent` (abstract) → `ItineraryPlannerAgent`, `TransportAgent`, `AccommodationAgent`, `DestinationGuideAgent`, `DiningAgent` | base realises the interface + `revise()` + shared helpers; concretes override `run()` |
| `ToolGateway` | `ToolGatewayImpl` | also a factory (`create()`) reading `USE_MOCK_TOOLS` |
| `MapsPort` | `MockMapsAdapter`, `RealMapsAdapter` | owner B |
| `BookingPort` | `MockBookingAdapter`, `RealBookingAdapter` | owner C; real payment out of scope |
| `MemoryStore` | `PreferenceMemoryService` | owner E; in-memory now, SQLite/Redis later, same signature |
| `NotificationService` | `StubNotificationService` | owner E |
| `AuthService` | `StubAuthService` | owner E |

## Design rationale

- **`Agent` is an interface, not a base class** — the orchestrator iterates `Agent[]` and calls `run()` without knowing the concrete type or whether it uses an LLM.
- **`AbstractSpecialistAgent` (generalisation)** — all five specialists load preferences and call the model the same way; the base carries that, subclasses implement only `run()`. Design-time; the skeleton has five independent stubs.
- **`AgentRegistry → Agent` is aggregation** — agents are module-level singletons; the registry references them but does not own their lifecycle.
- **`OrchestratorAgent → ConflictDetector / CostAggregator` is composition** — private collaborators with no independent identity. Splitting them out follows *separate control from function*.
- **Dependencies injected via `AgentContext`** — agents never import concrete services, so a unit test passes a fake `ToolGateway` and mock↔real is a one-line switch in the factory.
- **Ports in `packages/shared` (hexagonal)** — the core never names a concrete adapter, so external APIs can change without touching agent or orchestrator code.
- **`TripPlan` composes a `TripBrief` snapshot** — a plan answers one specific brief; embedding a copy means a later brief edit cannot silently invalidate an existing plan.
- **`ConflictDetector` depends on `TransportAgent`** — "are these two stops reachable in one day?" needs routing data owned by `TransportAgent`; control asks, function answers.
