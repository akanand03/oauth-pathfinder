/** Search terms that should land on a library guide instead of triggering generation. */
const ALIASES: Record<string, string> = {
  github: "github",
  slack: "slack",
  gmail: "gmail",
  google: "gmail",
  "google-gmail": "gmail",
  linkedin: "linkedin",
  notion: "notion",
};

export function librarySlugFor(slug: string): string | null {
  return ALIASES[slug] ?? null;
}
