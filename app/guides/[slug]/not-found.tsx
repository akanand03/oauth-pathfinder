import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-xl font-semibold">No guide here yet</h1>
      <p className="text-zinc-600 dark:text-zinc-400">Search for the app on the home page and the agent will research it.</p>
      <Link href="/" className="text-indigo-600 hover:underline dark:text-indigo-400">
        Go to search
      </Link>
    </div>
  );
}
