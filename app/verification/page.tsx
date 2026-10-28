import verification from "@/data/verification.json";

export const metadata = { title: "Verification · OAuth Pathfinder" };

interface ManualTest {
  guide: string;
  date: string;
  test: string;
  result: string;
}

const card = "rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";

export default function VerificationPage() {
  const { checked, corrected, uncertain } = verification;
  // Filled in by hand in data/verification.json after running a provider's setup yourself.
  const manualTests = verification.manualTests as ManualTest[];
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Verification</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Checked on {verification.checkedOn}. {verification.method}
        </p>
        <p className="text-sm text-zinc-500">
          {checked.length} confirmed · {corrected.length} corrected · {uncertain.length} still uncertain
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">What we checked and confirmed</h2>
        <div className={`${card} divide-y divide-zinc-100 dark:divide-zinc-800`}>
          {checked.map((c, i) => (
            <div key={i} className="flex flex-col gap-1 p-4 text-sm sm:flex-row sm:items-start sm:gap-4">
              <span className="w-20 shrink-0 text-xs font-semibold uppercase text-zinc-500">{c.guide}</span>
              <span className="flex-1">{c.claim}</span>
              <a href={c.source} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                source ↗
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-sky-700 dark:text-sky-400">What we corrected</h2>
        <div className={`${card} divide-y divide-zinc-100 dark:divide-zinc-800`}>
          {corrected.map((c, i) => (
            <div key={i} className="space-y-1 p-4 text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">{c.guide}</span>
              <p className="text-zinc-500 line-through decoration-rose-400">{c.original}</p>
              <p>{c.corrected}</p>
              <a href={c.source} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                {c.source}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-amber-700 dark:text-amber-400">What remains uncertain</h2>
        <div className={`${card} divide-y divide-zinc-100 dark:divide-zinc-800`}>
          {uncertain.map((u, i) => (
            <div key={i} className="p-4 text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">{u.guide}</span>
              <p className="font-medium">{u.claim}</p>
              <p className="text-zinc-600 dark:text-zinc-400">{u.why}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Manual setup tests</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Hands-on runs of each provider&apos;s setup by a person (creating the app, connecting, submitting for review). Results
          recorded here can upgrade a claim to Tested.
        </p>
        {manualTests.length === 0 ? (
          <div className={`${card} p-5 text-sm text-zinc-500`}>No manual tests recorded yet.</div>
        ) : (
          <div className={`${card} divide-y divide-zinc-100 dark:divide-zinc-800`}>
            {manualTests.map((t, i) => (
              <div key={i} className="space-y-1 p-4 text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  {t.guide} · {t.date}
                </span>
                <p className="font-medium">{t.test}</p>
                <p className="text-zinc-600 dark:text-zinc-400">{t.result}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${card} space-y-2 p-5 text-sm`}>
        <h2 className="font-semibold">How generated guides are checked</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Our code fetches the official pages, and the model only sees their trimmed text. Every extracted fact must come
          with a verbatim quote, and the server checks that the quote actually appears on the page. A “Docs” label
          survives only if it points at a page with at least one verified quote; anything else becomes Uncertain. The
          model can&apos;t label anything “Tested”: that label comes only from checks our code ran live (the Composio API, or
          a public app-creation form). Nothing signs in, creates accounts or submits forms.
        </p>
      </section>
    </div>
  );
}
