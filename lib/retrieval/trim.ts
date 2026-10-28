/** Rough token estimate (~4 chars per token for English docs). Used for budgeting only; costs use the provider's reported usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const KEYWORDS = [
  "oauth", "scope", "permission", "review", "verif", "approv", "publish", "marketplace", "listing",
  "client id", "client secret", "redirect", "callback", "consent", "privacy policy", "terms", "security",
  "public integration", "public connection", "submit", "submission", "distribution", "partner", "requirement",
  "reject", "domain", "logo", "demo", "video", "business", "test user", "sandbox", "access token", "authoriz",
];

function score(section: string): number {
  const lower = section.toLowerCase();
  return KEYWORDS.reduce((n, k) => n + (lower.split(k).length - 1), 0);
}

/**
 * Keeps the sections of a page most relevant to OAuth setup and review, in original order, under a token cap.
 * Sections are split on "## " headings (from htmlToText), falling back to paragraph blocks.
 */
export function trimToRelevant(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  let sections = text.split(/\n(?=## )/);
  if (sections.length < 3) sections = text.split(/\n\n+/);

  const intro = sections[0].slice(0, 800);
  const ranked = sections
    .slice(1)
    .map((s, i) => ({ s, i, score: score(s) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const budgetChars = maxTokens * 4 - intro.length;
  const keep: { s: string; i: number }[] = [];
  let used = 0;
  for (const x of ranked) {
    const piece = x.s.length > budgetChars / 2 ? x.s.slice(0, Math.floor(budgetChars / 2)) : x.s;
    if (used + piece.length > budgetChars) continue;
    keep.push({ s: piece, i: x.i });
    used += piece.length;
  }
  keep.sort((a, b) => a.i - b.i);
  return [intro, ...keep.map((k) => k.s)].join("\n\n…\n\n");
}
