import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideView } from "@/components/GuideView";
import { getGuide } from "@/lib/store";

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuide(slug);
  return guide
    ? { title: `${guide.name} OAuth guide · OAuth Pathfinder`, description: guide.verdict.summary }
    : { title: "Guide not found · OAuth Pathfinder" };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) notFound();
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        ← All guides
      </Link>
      <GuideView guide={guide} />
    </div>
  );
}
