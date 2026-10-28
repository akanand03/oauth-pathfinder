import { Suspense } from "react";
import { ProgressFeed } from "@/components/ProgressFeed";

export default function GeneratePage() {
  return (
    <Suspense>
      <ProgressFeed />
    </Suspense>
  );
}
