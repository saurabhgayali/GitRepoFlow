import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Download,
  Github,
  Info,
  KeyRound,
  Loader2,
  Search,
  Star,
  GitFork,
  Workflow,
} from "lucide-react";
import { analyzeRepository, parseRepoUrl, type Analysis } from "@/lib/repo-analyzer";
import { buildFossflowDocument } from "@/lib/fossflow";
import { IsometricCanvas } from "@/components/IsometricCanvas";
import { synthesizeArchitecture } from "@/lib/ai.functions";
import appConfig from "../../gitrepoflow.config.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GitRepoFlow — GitHub Repo to 3D Isometric Architecture Diagrams" },
      {
        name: "description",
        content:
          "Paste any public GitHub repository URL and GitRepoFlow maps its CI/CD workflows, services and data stores into an interactive FossFLOW isometric diagram.",
      },
      { property: "og:title", content: "GitRepoFlow — Repo to Isometric Architecture" },
      {
        property: "og:description",
        content:
          "Analyze public GitHub repos and generate interactive FossFLOW-compatible 3D isometric architecture diagrams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GitRepoFlowPage,
});

const PRESETS = [
  { label: "FossFLOW", url: "https://github.com/victortassinari/FossFLOW", hint: "CI/CD + services" },
  { label: "expressjs/express", url: "https://github.com/expressjs/express", hint: "Node library stack" },
];

type ViewMode = "diagram" | "json" | "summary";

function GitRepoFlowPage() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Analysis | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [view, setView] = useState<ViewMode>("diagram");
  const [infoOpen, setInfoOpen] = useState(false);

  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const synthesize = useServerFn(synthesizeArchitecture);

  const busy = stage !== null;

  const doc = useMemo(() => (analysis ? buildFossflowDocument(analysis) : null), [analysis]);

  async function withAiArchitecture(result: Analysis): Promise<Analysis> {
    setStage("AI is reading the repository tree and manifests…");
    setProgress(65);
    const tick = setInterval(() => setProgress((p) => Math.min(95, p + 2)), 700);
    try {
      const res = await synthesize({
        data: {
          repo: result.meta.fullName,
          language: result.meta.language ?? "unknown",
          languageMix: result.languageMix,
          workflows: result.workflows.map((w) => ({
            file: w.file,
            events: w.events,
            jobs: w.jobs.map((j) => ({ id: j.id, needs: j.needs, summary: j.summary })),
          })),
          tree: result.tree.slice(0, 400),
          manifests: result.manifestExcerpts.map((m) => ({
            path: m.path,
            excerpt: m.excerpt.slice(0, 1800),
          })),
        },
      });
      if (res.nodes.length < 3) return result;
      return {
        ...result,
        components: res.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          description: n.description,
          kind: n.kind as Analysis["components"][number]["kind"],
          icon: n.icon as Analysis["components"][number]["icon"],
        })),
        links: res.edges.map((e) => ({ from: e.from, to: e.to, label: e.label })),
      };
    } catch {
      return result;
    } finally {
      clearInterval(tick);
    }
  }

  async function finish(result: Analysis) {
    const refined = await withAiArchitecture(result);
    setProgress(100);
    setAnalysis(refined);
    setView("diagram");
    setTimeout(() => {
      setStage(null);
      setProgress(0);
    }, 350);
  }

  async function run(target: string) {
    const parsed = parseRepoUrl(target);
    setError(null);
    setPending(null);
    if (!parsed) {
      setError("Enter a valid public GitHub repository URL, e.g. https://github.com/user/repo");
      return;
    }
    setLoading(true);
    setAnalysis(null);
    setStage("Fetching repository tree, workflows and manifests…");
    setProgress(15);
    try {
      const result = await analyzeRepository(parsed.owner, parsed.repo, token.trim() || undefined);
      setProgress(55);
      if (result.inferred) {
        setPending(result);
        setStage(null);
        setProgress(0);
      } else {
        await finish(result);
      }
    } catch (e) {
      setAnalysis(null);
      setStage(null);
      setProgress(0);
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }



  function download() {
    if (!doc || !analysis) return;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${analysis.meta.owner}-${analysis.meta.repo}-fossflow.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="min-h-screen bg-background bg-aurora">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <Boxes className="size-5" />
            </div>
            <div>
              <p className="font-mono text-base font-bold tracking-tight text-foreground">
                {appConfig.app.name}
              </p>
              <p className="text-[11px] text-muted-foreground">{appConfig.app.tagline}</p>
            </div>
            <button
              type="button"
              aria-label="About GitRepoFlow"
              title="About"
              onClick={() => setInfoOpen(true)}
              className="grid size-6 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
            >
              <Info className="size-3.5" />
            </button>
          </div>

          <form
            className="flex flex-1 flex-wrap items-center gap-2 lg:pl-8"
            onSubmit={(e) => {
              e.preventDefault();
              void run(url);
            }}
          >
            <div className="relative min-w-[260px] flex-1">
              <Github className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Analyze &amp; Diagram
            </button>
            <button
              type="button"
              onClick={() => setShowToken((s) => !s)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <KeyRound className="size-4" />
              Token
            </button>
          </form>
        </div>
        {showToken ? (
          <div className="border-t border-border bg-card/60">
            <div className="mx-auto max-w-[1600px] px-5 py-3">
              <label className="mb-1 block text-xs text-muted-foreground">
                GitHub Personal Access Token (optional, stored only in this browser tab)
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_…"
                className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring"
              />
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Quick try</span>
          {PRESETS.map((p) => (
            <button
              key={p.url}
              onClick={() => {
                setUrl(p.url);
                void run(p.url);
              }}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:border-ring"
            >
              {p.label} <span className="text-muted-foreground">· {p.hint}</span>
            </button>
          ))}
        </div>

        {busy ? (
          <div className="mb-4 rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              {stage}
              <span className="ml-auto font-mono text-xs text-muted-foreground">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {error}
          </div>
        ) : null}


        {pending ? (
          <div className="mb-4 rounded-xl border border-warning/50 bg-warning/10 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 text-warning" />
              <div className="flex-1">
                <p className="font-semibold text-foreground">Low workflow signal (quality score {pending.qualityScore}/100)</p>
                <p className="mt-1 text-sm text-muted-foreground">{pending.warning}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const p = pending;
                      setPending(null);
                      void finish(p);
                    }}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Proceed with Inferred Diagram
                  </button>
                  <button
                    onClick={() => {
                      setPending(null);
                      setUrl("");
                    }}
                    className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:border-ring"
                  >
                    Cancel &amp; Try Another Repo
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!analysis && !pending && !busy ? (
          <section className="grid min-h-[60vh] place-items-center rounded-xl border border-dashed border-border bg-card/40 px-6 text-center">
            <div className="max-w-xl">
              <h1 className="font-mono text-3xl font-bold tracking-tight text-foreground">
                Turn any public repo into a 3D isometric system map
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                GitRepoFlow reads the repository tree, detects CI/CD workflows, container and
                infrastructure manifests, service directories and data stores, then lays them out on
                an isometric grid you can export as FossFLOW / Isoflow JSON.
              </p>
            </div>
          </section>
        ) : null}

        {analysis && doc ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <section className="flex min-h-[70vh] flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
                {(
                  [
                    ["diagram", "Interactive 3D Isometric"],
                    ["json", "Raw FossFLOW JSON"],
                    ["summary", "Summary Breakdown"],
                  ] as [ViewMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setView(mode)}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      view === mode
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="min-h-[65vh] flex-1">
                {view === "diagram" ? <IsometricCanvas doc={doc} title={analysis.meta.fullName} /> : null}

                {view === "json" ? (
                  <pre className="h-[65vh] overflow-auto rounded-xl border border-border bg-card p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                    {JSON.stringify(doc, null, 2)}
                  </pre>
                ) : null}
                {view === "summary" ? (
                  <div className="h-[65vh] overflow-auto rounded-xl border border-border bg-card p-4">
                    <ul className="space-y-2">
                      {doc.nodes.map((n) => (
                        <li
                          key={n.id}
                          className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/50 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-semibold text-foreground">{n.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">{n.description}</p>
                          </div>
                          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {n.category} · {n.icon}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="font-mono text-sm font-bold text-foreground">{analysis.meta.fullName}</p>
                {analysis.meta.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">{analysis.meta.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3.5 text-primary" /> {analysis.meta.stars.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <GitFork className="size-3.5" /> {analysis.meta.forks.toLocaleString()}
                  </span>
                  <span>{analysis.meta.language ?? "n/a"}</span>
                  <span className="font-mono">#{analysis.meta.defaultBranch}</span>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>Workflow quality</span>
                    <span className="font-mono">{analysis.qualityScore}/100</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${analysis.qualityScore}%` }}
                    />
                  </div>
                </div>
              </div>

              <SidebarList
                title="CI/CD workflows & jobs"
                icon={<Workflow className="size-3.5" />}
                items={
                  analysis.workflows.length
                    ? analysis.workflows.flatMap((w) => [
                        `${w.file} · on: ${w.events.join(", ")}`,
                        ...w.jobs.map((j) => `   └ ${j.id}${j.needs.length ? ` ← ${j.needs.join(",")}` : ""}`),
                      ])
                    : ["none found"]
                }
              />
              <SidebarList
                title="Infrastructure files"
                items={analysis.infraFiles.length ? analysis.infraFiles : ["none found"]}
              />
              <SidebarList
                title="Services & modules"
                items={analysis.components
                  .filter((c) => c.kind === "service")
                  .map((c) => `${c.label} · ${c.icon}`)}
              />
              <SidebarList
                title="Databases, queues, storage & APIs"
                items={analysis.components
                  .filter((c) =>
                    ["database", "storage", "queue", "external"].includes(c.kind),
                  )
                  .map((c) => `${c.label} · ${c.icon}`)}
              />


              <button
                onClick={download}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <Download className="size-4" /> Download Diagram (.json)
              </button>
            </aside>
          </div>
        ) : null}
      </main>

      <footer className="mt-8 border-t border-border bg-background/70">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>
            {appConfig.app.name} · built by{" "}
            <a href={appConfig.author.github} target="_blank" rel="noreferrer" className="text-foreground hover:underline">
              {appConfig.author.name}
            </a>
          </p>
          <div className="flex items-center gap-3 sm:ml-auto">
            <a
              href={appConfig.app.repository}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository"
              className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="size-4" />
              GitHub
            </a>
            <span className="font-mono">License: {appConfig.app.license}</span>
          </div>
        </div>
      </footer>

      {infoOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                <Boxes className="size-5" />
              </div>
              <div className="flex-1">
                <h2 className="font-mono text-lg font-bold text-foreground">
                  {appConfig.app.name}{" "}
                  <span className="font-normal text-muted-foreground">v{appConfig.app.version}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{appConfig.app.tagline}</p>
              </div>
              <button
                onClick={() => setInfoOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {appConfig.app.description}
            </p>
            <dl className="mt-4 space-y-1.5 text-xs">
              <div className="flex gap-2">
                <dt className="w-20 text-muted-foreground">Author</dt>
                <dd className="font-mono text-foreground">{appConfig.author.name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 text-muted-foreground">Contact</dt>
                <dd className="font-mono text-foreground">{appConfig.author.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 text-muted-foreground">License</dt>
                <dd className="font-mono text-foreground">{appConfig.app.license}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 text-muted-foreground">Source</dt>
                <dd>
                  <a
                    href={appConfig.app.repository}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-primary hover:underline"
                  >
                    {appConfig.app.repository}
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarList({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
        {icon}
        {title}
      </p>
      <ul className="space-y-1">
        {items.length === 0 ? (
          <li className="font-mono text-xs text-muted-foreground">none found</li>
        ) : (
          items.map((i) => (
            <li key={i} className="truncate font-mono text-xs text-foreground">
              {i}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
