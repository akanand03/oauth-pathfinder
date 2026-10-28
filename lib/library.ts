import github from "@/data/guides/github.json";
import slack from "@/data/guides/slack.json";
import gmail from "@/data/guides/gmail.json";
import linkedin from "@/data/guides/linkedin.json";
import notion from "@/data/guides/notion.json";
import type { Guide } from "./types";

export { librarySlugFor } from "./aliases";

export const LIBRARY: Guide[] = [github, slack, gmail, linkedin, notion] as Guide[];

export function getLibraryGuide(slug: string): Guide | null {
  return LIBRARY.find((g) => g.slug === slug) ?? null;
}
