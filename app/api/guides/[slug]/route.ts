import { getGuide } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(guide);
}
