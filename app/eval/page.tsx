import evalData from "@/data/eval.json";

export const metadata = { title: "Eval · OAuth Pathfinder" };

type Verdict = "match" | "wrong" | "missed";

interface EvalRow {
  claim: string;
  library: string;
  agent: string;
  verdict: Verdict;
}

interface EvalRun {
  /** e.g. "v1 (before prompt fixes)" */
  label: string;
  /** Date of the agent run, e.g. "2026-10-28". */
  agentRun: string;
  note?: string | null;
  rows: EvalRow[];
}

interface EvalApp {
  slug: string;
  name: string;
  runs: EvalRun[];
}

const VERDICT_STYLE: Record<Verdict, string> = {
  match: "text-emerald-700 dark:text-emerald-400",
  wrong: "text-rose-700 dark:text-rose-400",
  missed: "text-amber-700 dark:text-amber-400",
};

const card = "overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";

function tally(rows: EvalRow[]) {
  const counts = { match: 0, wrong: 0, missed: 0 };
  for (const r of rows) counts[r.verdict]++;
  return counts;
}

export default function EvalPage() {
  // Runs are filled in by hand in data/eval.json.
  const apps = evalData.apps as EvalApp[];
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Eval: library vs agent</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{evalData.method}</p>
      </header>

      {apps.map((app) => (
        <section key={app.slug} className="space-y-4">
          <h2 className="text-lg font-semibold">{app.name}</h2>

          {app.runs.length === 0 && (
            <div className={card}>
              <table className="w-full min-w-[640px] text-left text-sm">
                <TableHead />
                <tbody>
                  <tr>
                    <td colSpan={4} className="p-3 text-zinc-500">
                      No agent run yet.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {app.runs.length > 1 && <RunSummary runs={app.runs} />}

          {app.runs.map((run) => {
            const counts = tally(run.rows);
            return (
              <div key={run.label} className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h3 className="font-medium">{run.label}</h3>
                  <span className="text-xs text-zinc-500">
                    Agent run {run.agentRun} · {counts.match} match · {counts.wrong} wrong · {counts.missed} missed
                  </span>
                </div>
                {run.note && <p className="text-sm text-zinc-600 dark:text-zinc-400">{run.note}</p>}
                <div className={card}>
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <TableHead />
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {run.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="p-3 font-medium">{r.claim}</td>
                          <td className="p-3 text-zinc-600 dark:text-zinc-400">{r.library}</td>
                          <td className="p-3 text-zinc-600 dark:text-zinc-400">{r.agent}</td>
                          <td className={`p-3 font-medium capitalize ${VERDICT_STYLE[r.verdict]}`}>{r.verdict}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function TableHead() {
  return (
    <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
      <tr>
        <th className="p-3 font-medium">Claim</th>
        <th className="p-3 font-medium">Library says</th>
        <th className="p-3 font-medium">Agent says</th>
        <th className="p-3 font-medium">Match / wrong / missed</th>
      </tr>
    </thead>
  );
}

function RunSummary({ runs }: { runs: EvalRun[] }) {
  return (
    <div className={`${card} max-w-md`}>
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
          <tr>
            <th className="p-3 font-medium">Run</th>
            <th className={`p-3 text-right font-medium ${VERDICT_STYLE.match}`}>Matched</th>
            <th className={`p-3 text-right font-medium ${VERDICT_STYLE.wrong}`}>Wrong</th>
            <th className={`p-3 text-right font-medium ${VERDICT_STYLE.missed}`}>Missed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {runs.map((run) => {
            const c = tally(run.rows);
            return (
              <tr key={run.label}>
                <td className="p-3">{run.label}</td>
                <td className="p-3 text-right">{c.match}</td>
                <td className="p-3 text-right">{c.wrong}</td>
                <td className="p-3 text-right">{c.missed}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
