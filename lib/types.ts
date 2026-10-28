import type { GuideUsage } from "./usage";

/** "Unknown" is only set by code, for partial guides; the model must pick one of the other four. */
export type Difficulty = "Easy" | "Medium" | "Hard" | "Gated" | "Unknown";
export type EvidenceLabel = "Tested" | "Docs" | "Uncertain";
export type Actor = "agent" | "you";

/** Every claim carries one of these. Docs must have a url; Tested/Uncertain may. */
export interface Evidence {
  label: EvidenceLabel;
  url?: string | null;
  note?: string | null;
}

export interface Claim {
  text: string;
  evidence: Evidence;
}

export interface Step {
  title: string;
  detail: string;
  actor: Actor;
  evidence: Evidence;
}

export interface Requirement {
  item: string;
  status: "required" | "not_required" | "conditional" | "unknown";
  detail: string;
  evidence: Evidence;
}

export interface ScopeInfo {
  scope: string;
  why: string;
  evidence: Evidence;
}

export interface Blocker {
  reason: string;
  fix: string;
  evidence: Evidence;
}

/** Scope Advisor: "only need X? use this lighter scope instead of that one". Built only from facts already sourced in the guide. */
export interface ScopeSuggestion {
  need: string;
  use: string;
  insteadOf: string | null;
  why: string;
  evidence: Evidence;
}

/** One bar on the timeline. "waiting" is time spent on someone else's queue; "active" is your own work. */
export interface TimelinePhase {
  phase: "setup" | "test" | "review" | "production";
  label: string;
  duration: string;
  kind: "active" | "waiting" | "none";
  evidence: Evidence;
}

/** Copyable templates the developer edits before submitting for review. */
export interface Drafts {
  scopeJustification: { scope: string; text: string }[];
  demoVideoOutline: string[];
  checklist: string[];
  note: string;
}

/**
 * A tip from a developer's public post (forum, Q&A, code repo, blog). Anecdotal by definition: one person's
 * experience, paraphrased by us, never evidence for a guide claim. Library guides only; hand-curated.
 */
export interface CommunityNote {
  id: string;
  /** Our own words, at most two sentences. */
  tip: string;
  tag: "time_sink" | "rejection" | "shortcut" | "gotcha";
  sourceType: "forum" | "qa" | "code" | "blog";
  site: string;
  url: string;
  /** "YYYY-MM-DD", "YYYY-MM" or "YYYY": only as precise as the source shows. */
  date: string;
  /** "updated" when the only date is a last-commit date (e.g. a README). Defaults to "posted". */
  dateKind?: "posted" | "updated";
  dateNote?: string | null;
  /** Public handle as shown on the source; null shows "A developer". */
  author: string | null;
  /** Optional short quote from the source, under 15 words. */
  quote?: string | null;
  conflictsWithDocs: boolean;
  conflictNote?: string | null;
  /** Shown in the home page strip. */
  featured?: boolean;
}

export interface Guide {
  slug: string;
  name: string;
  website: string | null;
  kind: "library" | "generated";
  verdict: {
    difficulty: Difficulty;
    timeToFirstTest: Claim;
    timeToProduction: Claim;
    summary: string;
  };
  /** Things worth flagging before you start (e.g. "use a GitHub App instead"). */
  callouts: Claim[];
  steps: Step[];
  requirements: Requirement[];
  scopes: {
    triggerReview: ScopeInfo[];
    noReview: ScopeInfo[];
    tip: string;
  };
  blockers: Blocker[];
  /** Library guides set these; generated guides fall back to values derived from verdict and scopes. */
  scopeAdvisor?: ScopeSuggestion[];
  timeline?: TimelinePhase[];
  drafts?: Drafts;
  communityNotes?: CommunityNote[];
  composio: {
    managed: "yes" | "no" | "unknown";
    toolkit: string | null;
    note: string;
    evidence: Evidence;
  };
  /** What the agent saw on the provider's app-creation page (generated guides). */
  portalObservation: {
    url: string | null;
    fields: string[];
    note: string;
  } | null;
  sources: string[];
  lastChecked: string;
  /** Set when a generated run hit the time limit and saved its raw facts instead of a written guide. */
  partial?: boolean;
  /** Token and cost accounting for generated guides. */
  usage?: GuideUsage;
}

export type ProgressEvent =
  | { type: "stage"; stage: string; message: string }
  | { type: "search"; query: string }
  | { type: "fetch"; url: string }
  | { type: "found"; message: string }
  | { type: "done"; slug: string }
  | { type: "error"; message: string };
