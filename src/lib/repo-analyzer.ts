export type NodeKind =
  | "trigger"
  | "job"
  | "step"
  | "service"
  | "queue"
  | "database"
  | "storage"
  | "external"
  | "infra";

export type IconName =
  | "server"
  | "database"
  | "sql"
  | "nosql"
  | "cache"
  | "queue"
  | "storage"
  | "lock"
  | "code"
  | "cloud"
  | "container"
  | "kubernetes"
  | "test"
  | "build"
  | "deploy"
  | "package"
  | "api"
  | "web"
  | "user"
  | "clock"
  | "branch";

export interface AnalyzedComponent {
  id: string;
  label: string;
  description: string;
  kind: NodeKind;
  icon: IconName;
}

export interface AnalyzedLink {
  from: string;
  to: string;
  label?: string;
}

export interface RepoMeta {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  defaultBranch: string;
  htmlUrl: string;
}

export interface ParsedWorkflow {
  file: string;
  name: string;
  events: string[];
  jobs: { id: string; name: string; needs: string[]; runsOn: string; uses: string[]; summary: string }[];
}

export interface Analysis {
  meta: RepoMeta;
  components: AnalyzedComponent[];
  links: AnalyzedLink[];
  workflows: ParsedWorkflow[];
  infraFiles: string[];
  composeServices: { name: string; image: string }[];
  serviceDirs: string[];
  languages: string[];
  languageMix: { lang: string; files: number }[];
  tree: string[];
  manifestExcerpts: { path: string; excerpt: string }[];
  qualityScore: number;
  inferred: boolean;
  warning: string | null;
}

export interface GhEntry {
  name: string;
  path: string;
  type: "file" | "dir" | string;
}

const API = "https://api.github.com";

export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m =
    trimmed.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)/i) ??
    trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m || !m[1] || !m[2]) return null;
  return { owner: m[1], repo: m[2] };
}

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function ghJson<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Repository not found or not public.");
    if (res.status === 403)
      throw new Error("GitHub API rate limit reached. Add a personal access token in settings.");
    throw new Error(`GitHub API error (${res.status}).`);
  }
  return (await res.json()) as T;
}

async function raw(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
    );
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 200_000 ? text.slice(0, 200_000) : text;
  } catch {
    return null;
  }
}

/* ------------------------------- YAML-lite -------------------------------- */

function indentOf(line: string) {
  return line.length - line.trimStart().length;
}

function stripComment(line: string) {
  return line.replace(/\s+#.*$/, "");
}

/** Collect the raw lines of a top-level block (`jobs:`, `on:`, `services:`). */
function topBlock(text: string, key: string): { inline: string; lines: string[] } {
  const lines = text.split(/\r?\n/).map(stripComment);
  const start = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
  if (start === -1) return { inline: "", lines: [] };
  const inline = lines[start]!.slice(lines[start]!.indexOf(":") + 1).trim();
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.trim() === "") {
      body.push(l);
      continue;
    }
    if (indentOf(l) === 0) break;
    body.push(l);
  }
  return { inline, lines: body };
}

/** Keys of a mapping block at its shallowest indentation. */
function blockKeys(lines: string[]): { key: string; lines: string[] }[] {
  const meaningful = lines.filter((l) => l.trim() !== "");
  if (meaningful.length === 0) return [];
  const base = Math.min(...meaningful.map(indentOf));
  const out: { key: string; lines: string[] }[] = [];
  let current: { key: string; lines: string[] } | null = null;
  for (const l of lines) {
    if (l.trim() === "") continue;
    const m = l.match(/^\s*([A-Za-z0-9_.$-]+)\s*:/);
    if (indentOf(l) === base && m) {
      current = { key: m[1]!, lines: [] };
      out.push(current);
    } else if (current) {
      current.lines.push(l);
    }
  }
  return out;
}

function listValues(inline: string, lines: string[]): string[] {
  const vals: string[] = [];
  const bracket = inline.match(/^\[(.*)\]$/);
  if (bracket) {
    vals.push(...bracket[1]!.split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean));
  } else if (inline && !inline.startsWith("{")) {
    vals.push(inline.replace(/['"]/g, "").trim());
  }
  for (const l of lines) {
    const dash = l.trim().match(/^-\s*(.+)$/);
    if (dash) vals.push(dash[1]!.replace(/['"]/g, "").trim());
    else {
      const k = l.match(/^\s*([A-Za-z0-9_-]+)\s*:/);
      if (k) vals.push(k[1]!);
    }
  }
  return [...new Set(vals.filter(Boolean))];
}

export function parseWorkflow(file: string, text: string): ParsedWorkflow {
  const nameMatch = text.match(/^name\s*:\s*(.+)$/m);
  const onBlock = topBlock(text, "on");
  const GH_EVENTS = new Set([
    "push",
    "pull_request",
    "pull_request_target",
    "schedule",
    "workflow_dispatch",
    "workflow_call",
    "workflow_run",
    "release",
    "issues",
    "issue_comment",
    "create",
    "deployment",
    "repository_dispatch",
    "merge_group",
    "branch_protection_rule",
  ]);
  const events = listValues(onBlock.inline, onBlock.lines).filter((e) => GH_EVENTS.has(e));

  const jobsBlock = topBlock(text, "jobs");
  const jobs = blockKeys(jobsBlock.lines).map((j) => {
    const body = j.lines.join("\n");
    const needsInline = body.match(/^\s*needs\s*:\s*(.*)$/m)?.[1]?.trim() ?? "";
    const needsList = needsInline
      ? listValues(needsInline, [])
      : listValues(
          "",
          body
            .split("\n")
            .slice(
              body.split("\n").findIndex((l) => /needs\s*:/.test(l)) + 1,
              body.split("\n").findIndex((l) => /needs\s*:/.test(l)) + 6,
            )
            .filter((l) => /^\s*-\s/.test(l)),
        );
    const uses = [...body.matchAll(/^\s*-?\s*uses\s*:\s*(\S+)/gm)].map((m) => m[1]!);
    const runs = [...body.matchAll(/^\s*-?\s*run\s*:\s*(.+)$/gm)].map((m) => m[1]!.trim());
    const runsOn = body.match(/^\s*runs-on\s*:\s*(.+)$/m)?.[1]?.trim() ?? "runner";
    const jobName = body.match(/^\s*name\s*:\s*(.+)$/m)?.[1]?.replace(/['"]/g, "").trim();
    const summary = [...uses.slice(0, 3), ...runs.slice(0, 2)].join(" · ").slice(0, 120);
    return {
      id: j.key,
      name: jobName || j.key,
      needs: needsList,
      runsOn,
      uses,
      summary: summary || `${runsOn} job`,
    };
  });

  const jobIds = new Set(jobs.map((j) => j.id));
  jobs.forEach((j) => {
    j.needs = j.needs.filter((n) => jobIds.has(n) && n !== j.id);
  });

  return {
    file,
    name: nameMatch?.[1]?.replace(/['"]/g, "").trim() || file.replace(/\.ya?ml$/i, ""),
    events: events.length ? events : ["manual"],
    jobs,
  };
}

export function parseCompose(text: string): { name: string; image: string }[] {
  const block = topBlock(text, "services");
  return blockKeys(block.lines).map((s) => ({
    name: s.key,
    image: s.lines.join("\n").match(/^\s*image\s*:\s*(.+)$/m)?.[1]?.replace(/['"]/g, "").trim() ?? "build: .",
  }));
}

/* ------------------------------ classification ---------------------------- */

const IMAGE_ICONS: { re: RegExp; icon: IconName; kind: NodeKind }[] = [
  { re: /postgres|pgvector|supabase|timescale|cockroach/i, icon: "sql", kind: "database" },
  { re: /mysql|mariadb|percona/i, icon: "sql", kind: "database" },
  { re: /mongo|couch|dynamodb/i, icon: "nosql", kind: "database" },
  { re: /redis|memcached|valkey/i, icon: "cache", kind: "database" },
  { re: /rabbitmq|kafka|nats|sqs|pulsar/i, icon: "queue", kind: "queue" },
  { re: /minio|s3|ceph/i, icon: "storage", kind: "storage" },
  { re: /elastic|opensearch|solr|meili/i, icon: "database", kind: "database" },
  { re: /nginx|traefik|caddy|envoy/i, icon: "web", kind: "service" },
  { re: /node|bun|deno|python|golang|ruby|php|java/i, icon: "server", kind: "service" },
];

export function classifyImage(image: string): { icon: IconName; kind: NodeKind } {
  for (const m of IMAGE_ICONS) if (m.re.test(image)) return { icon: m.icon, kind: m.kind };
  return { icon: "container", kind: "service" };
}

function jobIcon(job: ParsedWorkflow["jobs"][number]): IconName {
  const s = `${job.id} ${job.name} ${job.summary}`.toLowerCase();
  if (/codeql|security|scan|audit|trivy|snyk|scorecard/.test(s)) return "lock";
  if (/test|jest|vitest|pytest|spec|lint|coverage/.test(s)) return "test";
  if (/docker|buildx|image|ko-build/.test(s)) return "container";
  if (/kubernetes|kubectl|helm|k8s/.test(s)) return "kubernetes";
  if (/deploy|release|publish|pages|cd\b/.test(s)) return "deploy";
  if (/npm|pypi|crate|package|artifact/.test(s)) return "package";
  if (/build|compile|bundle/.test(s)) return "build";
  return "server";
}

const EVENT_ICON: Record<string, IconName> = {
  push: "branch",
  pull_request: "branch",
  pull_request_target: "branch",
  schedule: "clock",
  workflow_dispatch: "user",
  release: "deploy",
  workflow_call: "api",
  issues: "user",
  manual: "user",
};

const INFRA_MATCHERS: { re: RegExp; label: string; icon: IconName }[] = [
  { re: /^docker-compose(\.\w+)?\.ya?ml$/i, label: "Docker Compose Stack", icon: "container" },
  { re: /^dockerfile/i, label: "Container Image", icon: "container" },
  { re: /^serverless\.ya?ml$/i, label: "Serverless Platform", icon: "cloud" },
  { re: /\.tf$/i, label: "Terraform Infrastructure", icon: "cloud" },
  { re: /^chart\.ya?ml$|^helmfile/i, label: "Helm Release", icon: "kubernetes" },
  { re: /^vercel\.json$|^netlify\.toml$|^fly\.toml$|^procfile$/i, label: "Hosting Platform", icon: "cloud" },
];

const INFRA_DIRS = ["kubernetes", "k8s", "helm", "terraform", "infra", "infrastructure", "deploy", "charts"];
const SERVICE_DIRS = ["packages", "apps", "services", "cmd", "microservices", "functions"];

const MANIFESTS: { name: string; lang: string }[] = [
  { name: "package.json", lang: "JavaScript / Node" },
  { name: "go.mod", lang: "Go" },
  { name: "requirements.txt", lang: "Python" },
  { name: "pyproject.toml", lang: "Python" },
  { name: "cargo.toml", lang: "Rust" },
  { name: "pom.xml", lang: "Java" },
  { name: "build.gradle", lang: "Java / Kotlin" },
  { name: "gemfile", lang: "Ruby" },
  { name: "composer.json", lang: "PHP" },
];

const DEP_HINTS: { re: RegExp; label: string; icon: IconName; kind: NodeKind }[] = [
  { re: /"(pg|postgres|postgresql|@prisma\/client|drizzle-orm|psycopg2|sqlalchemy)"/i, label: "SQL Database", icon: "sql", kind: "database" },
  { re: /"(mysql2?|mariadb)"/i, label: "MySQL", icon: "sql", kind: "database" },
  { re: /"(mongoose|mongodb|pymongo)"/i, label: "MongoDB", icon: "nosql", kind: "database" },
  { re: /"(ioredis|redis)"/i, label: "Redis Cache", icon: "cache", kind: "database" },
  { re: /"(amqplib|kafkajs|bullmq|celery)"/i, label: "Message Queue", icon: "queue", kind: "queue" },
  { re: /"(@aws-sdk\/client-s3|aws-sdk|boto3|minio)"/i, label: "Object Storage", icon: "storage", kind: "storage" },
  { re: /"(stripe)"/i, label: "Stripe API", icon: "api", kind: "external" },
  { re: /"(openai|@anthropic-ai\/sdk)"/i, label: "AI Provider API", icon: "api", kind: "external" },
  { re: /"(@supabase\/supabase-js)"/i, label: "Supabase", icon: "sql", kind: "database" },
  { re: /"(express|fastify|koa|hapi)"/i, label: "HTTP API Server", icon: "api", kind: "service" },
  { re: /"(next|react|vue|svelte)"/i, label: "Web Frontend", icon: "web", kind: "service" },
];

/* --------------------------------- analyze -------------------------------- */

const EXT_LANG: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP",
  cs: "C#", cpp: "C++", cc: "C++", c: "C", h: "C", swift: "Swift", scala: "Scala", ex: "Elixir",
  exs: "Elixir", dart: "Dart", sh: "Shell", sql: "SQL", tf: "Terraform", lua: "Lua", r: "R",
  m: "Objective-C", pl: "Perl", clj: "Clojure", hs: "Haskell", vue: "Vue", svelte: "Svelte",
};

const MANIFEST_NAMES = [
  "package.json", "requirements.txt", "pyproject.toml", "setup.py", "pipfile", "go.mod",
  "cargo.toml", "gemfile", "composer.json", "pom.xml", "build.gradle", "build.gradle.kts",
  "mix.exs", "pubspec.yaml", "build.sbt", "cmakelists.txt", "makefile", "dockerfile",
  "docker-compose.yml", "docker-compose.yaml", "serverless.yml", "fly.toml", "procfile",
];

function isManifestPath(path: string): boolean {
  const base = path.split("/").pop()!.toLowerCase();
  return MANIFEST_NAMES.includes(base) || /\.csproj$/i.test(base) || /^chart\.ya?ml$/i.test(base);
}

async function fetchTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<string[]> {
  try {
    const res = await ghJson<{ tree?: { path: string; type: string }[] }>(
      `${API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      token,
    );
    return (res.tree ?? []).filter((t) => t.type === "blob").map((t) => t.path);
  } catch {
    return [];
  }
}

function languageMixFrom(paths: string[]): { lang: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const p of paths) {
    if (/(^|\/)(node_modules|vendor|dist|build|\.git)\//.test(p)) continue;
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    const lang = EXT_LANG[ext];
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([lang, files]) => ({ lang, files }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 8);
}

export async function analyzeRepository(
  owner: string,
  repo: string,
  token?: string,
): Promise<Analysis> {
  const info = await ghJson<Record<string, unknown>>(`${API}/repos/${owner}/${repo}`, token);
  const branch = (info['default_branch'] as string) || "main";

  const meta: RepoMeta = {
    owner,
    repo,
    fullName: (info['full_name'] as string) ?? `${owner}/${repo}`,
    description: (info['description'] as string) ?? null,
    language: (info['language'] as string) ?? null,
    stars: (info['stargazers_count'] as number) ?? 0,
    forks: (info['forks_count'] as number) ?? 0,
    defaultBranch: branch,
    htmlUrl: (info['html_url'] as string) ?? `https://github.com/${owner}/${repo}`,
  };

  const root = await ghJson<GhEntry[]>(`${API}/repos/${owner}/${repo}/contents`, token);
  const rootFiles = root.filter((e) => e.type === "file").map((e) => e.name);
  const rootDirs = root.filter((e) => e.type === "dir").map((e) => e.name);

  /* --- workflows: fetch and parse real YAML --- */
  let workflowFiles: string[] = [];
  try {
    const wf = await ghJson<GhEntry[]>(
      `${API}/repos/${owner}/${repo}/contents/.github/workflows`,
      token,
    );
    workflowFiles = wf.filter((e) => /\.ya?ml$/i.test(e.name)).map((e) => e.name);
  } catch {
    workflowFiles = [];
  }

  const workflows: ParsedWorkflow[] = [];
  for (const file of workflowFiles.slice(0, 8)) {
    const text = await raw(owner, repo, branch, `.github/workflows/${file}`);
    if (text) workflows.push(parseWorkflow(file, text));
  }

  /* --- infra --- */
  const infraFiles: string[] = [];
  const infraComponents: AnalyzedComponent[] = [];
  for (const f of rootFiles) {
    const hit = INFRA_MATCHERS.find((m) => m.re.test(f));
    if (hit) {
      infraFiles.push(f);
      if (!infraComponents.some((c) => c.label === hit.label)) {
        infraComponents.push({
          id: `infra-${infraComponents.length}`,
          label: hit.label,
          description: f,
          kind: "infra",
          icon: hit.icon,
        });
      }
    }
  }
  for (const d of rootDirs) {
    if (INFRA_DIRS.includes(d.toLowerCase())) {
      infraFiles.push(`${d}/`);
      infraComponents.push({
        id: `infra-dir-${d}`,
        label: ["k8s", "kubernetes"].includes(d.toLowerCase()) ? "Kubernetes Cluster" : `${d}/`,
        description: `${d}/ directory`,
        kind: "infra",
        icon: ["k8s", "kubernetes", "helm", "charts"].includes(d.toLowerCase()) ? "kubernetes" : "cloud",
      });
    }
  }

  /* --- docker-compose services --- */
  let composeServices: { name: string; image: string }[] = [];
  const composeFile = rootFiles.find((f) => /^docker-compose(\.\w+)?\.ya?ml$/i.test(f));
  if (composeFile) {
    const text = await raw(owner, repo, branch, composeFile);
    if (text) composeServices = parseCompose(text).slice(0, 10);
  }

  /* --- full repository tree (all languages) --- */
  const treePaths = await fetchTree(owner, repo, branch, token);
  const cleanTree = treePaths.filter(
    (p) => !/(^|\/)(node_modules|vendor|dist|build|\.git|coverage|fixtures?|testdata)\//.test(p),
  );
  const languageMix = languageMixFrom(cleanTree);
  const manifestPaths = cleanTree
    .filter((p) => isManifestPath(p) && p.split("/").length <= 4)
    .sort((a, b) => a.split("/").length - b.split("/").length)
    .slice(0, 8);

  const manifestExcerpts: { path: string; excerpt: string }[] = [];
  for (const mp of manifestPaths) {
    const text = await raw(owner, repo, branch, mp);
    if (text) manifestExcerpts.push({ path: mp, excerpt: text.slice(0, 2500) });
  }

  /* --- manifests --- */
  const languages = MANIFESTS.filter((m) => rootFiles.some((f) => f.toLowerCase() === m.name)).map(
    (m) => m.lang,
  );
  if (meta.language && !languages.includes(meta.language)) languages.unshift(meta.language);

  let manifestText = manifestExcerpts.map((m) => m.excerpt).join("\n");
  for (const l of languageMix.slice(0, 3)) {
    if (!languages.includes(l.lang)) languages.push(l.lang);
  }

  /* --- services / modules --- */
  const serviceDirs: string[] = [];
  const services: AnalyzedComponent[] = [];
  for (const d of rootDirs) {
    if (!SERVICE_DIRS.includes(d.toLowerCase())) continue;
    serviceDirs.push(d);
    try {
      const children = await ghJson<GhEntry[]>(`${API}/repos/${owner}/${repo}/contents/${d}`, token);
      children
        .filter((c) => c.type === "dir")
        .slice(0, 6)
        .forEach((c) =>
          services.push({
            id: `svc-${d}-${c.name}`,
            label: c.name,
            description: `${d}/${c.name}`,
            kind: "service",
            icon: /api|server|backend/i.test(c.name)
              ? "api"
              : /web|app|ui|front/i.test(c.name)
                ? "web"
                : "server",
          }),
        );
    } catch {
      /* ignore */
    }
  }

  for (const mp of manifestPaths) {
    const dir = mp.split("/").slice(0, -1).join("/");
    if (!dir) continue;
    if (services.some((x) => x.description === dir)) continue;
    const base = dir.split("/").pop()!;
    services.push({
      id: `mod-${dir.replace(/[^a-z0-9]+/gi, "-")}`,
      label: base,
      description: dir,
      kind: "service",
      icon: /api|server|backend|svc|service/i.test(base)
        ? "api"
        : /web|app|ui|front|site/i.test(base)
          ? "web"
          : "server",
    });
    if (!serviceDirs.includes(dir)) serviceDirs.push(dir);
  }

  for (const s of composeServices) {
    const { icon, kind } = classifyImage(s.image);
    services.push({
      id: `compose-${s.name}`,
      label: s.name,
      description: `compose service · ${s.image}`,
      kind,
      icon,
    });
  }

  if (services.length === 0) {
    const srcDir = rootDirs.find((d) =>
      ["src", "lib", "app", "server", "backend"].includes(d.toLowerCase()),
    );
    if (srcDir) {
      try {
        const children = await ghJson<GhEntry[]>(
          `${API}/repos/${owner}/${repo}/contents/${srcDir}`,
          token,
        );
        children
          .filter((c) => c.type === "dir")
          .slice(0, 6)
          .forEach((c) =>
            services.push({
              id: `mod-${c.name}`,
              label: c.name,
              description: `${srcDir}/${c.name} module`,
              kind: "service",
              icon: "code",
            }),
          );
      } catch {
        /* ignore */
      }
    }
    if (services.length === 0) {
      services.push({
        id: "svc-app",
        label: meta.repo,
        description: `Primary ${meta.language ?? "code"} module`,
        kind: "service",
        icon: "code",
      });
    }
  }

  /* --- data stores & external APIs from dependencies + compose --- */
  const dataStores: AnalyzedComponent[] = [];
  for (const hint of DEP_HINTS) {
    if (!hint.re.test(manifestText)) continue;
    if (hint.kind === "service") continue;
    dataStores.push({
      id: `dep-${hint.label.replace(/\W+/g, "-").toLowerCase()}`,
      label: hint.label,
      description: "Detected in dependency manifest",
      kind: hint.kind,
      icon: hint.icon,
    });
  }
  const deployTargets = new Set<string>();
  workflows.forEach((w) =>
    w.jobs.forEach((j) => {
      const s = `${j.summary} ${j.uses.join(" ")}`.toLowerCase();
      if (/docker\/build-push|ghcr|docker push/.test(s)) deployTargets.add("Container Registry");
      if (/npm publish|npm-publish/.test(s)) deployTargets.add("npm Registry");
      if (/pages|gh-pages/.test(s)) deployTargets.add("GitHub Pages");
      if (/aws|ecs|lambda/.test(s)) deployTargets.add("AWS");
      if (/kubectl|helm/.test(s)) deployTargets.add("Kubernetes Cluster");
      if (/codecov|coveralls/.test(s)) deployTargets.add("Coverage Service");
    }),
  );
  deployTargets.forEach((t) =>
    dataStores.push({
      id: `target-${t.replace(/\W+/g, "-").toLowerCase()}`,
      label: t,
      description: "Workflow publish target",
      kind: "external",
      icon: t === "Kubernetes Cluster" ? "kubernetes" : t.includes("Registry") ? "package" : "cloud",
    }),
  );

  /* --- triggers from real workflow events --- */
  const eventSet = new Set<string>();
  workflows.forEach((w) => w.events.forEach((e) => eventSet.add(e)));
  const triggers: AnalyzedComponent[] = [...eventSet].slice(0, 6).map((e) => ({
    id: `evt-${e}`,
    label: e,
    description: `GitHub event trigger: on ${e}`,
    kind: "trigger" as NodeKind,
    icon: EVENT_ICON[e] ?? "branch",
  }));
  if (triggers.length === 0) {
    triggers.push({
      id: "evt-repo",
      label: `${owner}/${repo}`,
      description: "Repository source (no CI events detected)",
      kind: "trigger",
      icon: "code",
    });
  }

  /* --- jobs from real workflow YAML --- */
  const jobs: AnalyzedComponent[] = [];
  const links: AnalyzedLink[] = [];
  workflows.forEach((w, wi) => {
    w.jobs.slice(0, 8).forEach((j) => {
      const id = `job-${wi}-${j.id}`;
      jobs.push({
        id,
        label: jobs.some((x) => x.label === j.name) ? `${j.name} (${w.file.replace(/\.ya?ml$/i, "")})` : j.name,
        description: `${w.file} · ${j.summary}`,
        kind: "job",
        icon: jobIcon(j),
      });
    });
    // event -> entry jobs; needs edges between jobs
    w.jobs.slice(0, 8).forEach((j) => {
      const id = `job-${wi}-${j.id}`;
      const deps = j.needs.filter((n) => w.jobs.some((x) => x.id === n));
      if (deps.length === 0) {
        w.events.slice(0, 3).forEach((e) => {
          if (eventSet.has(e)) links.push({ from: `evt-${e}`, to: id, label: w.name.slice(0, 18) });
        });
      } else {
        deps.forEach((d) => links.push({ from: `job-${wi}-${d}`, to: id, label: "needs" }));
      }
    });
  });

  const components = [...triggers, ...jobs, ...infraComponents, ...services, ...dataStores];

  // job -> infra / services / targets
  const terminalJobs = jobs.filter((j) =>
    /deploy|release|publish|docker|build|pages/i.test(`${j.label} ${j.description}`),
  );
  const emitters = terminalJobs.length ? terminalJobs : jobs;
  emitters.slice(0, 4).forEach((j) => {
    infraComponents.forEach((inf) => links.push({ from: j.id, to: inf.id, label: "builds" }));
    dataStores
      .filter((d) => d.kind === "external")
      .forEach((d) => links.push({ from: j.id, to: d.id, label: "publishes" }));
  });

  if (jobs.length === 0) {
    services.forEach((s) => links.push({ from: triggers[0]!.id, to: s.id, label: "contains" }));
  } else if (infraComponents.length > 0) {
    services.forEach((s) =>
      links.push({ from: infraComponents[0]!.id, to: s.id, label: "runs" }),
    );
  } else {
    services.forEach((s) => links.push({ from: emitters[0]?.id ?? triggers[0]!.id, to: s.id, label: "deploys" }));
  }

  services
    .filter((s) => s.kind === "service")
    .forEach((s) =>
      dataStores
        .filter((d) => d.kind !== "external")
        .forEach((d) => links.push({ from: s.id, to: d.id, label: "reads/writes" })),
    );

  /* --- quality --- */
  let score = 0;
  if (workflows.length > 0) score += 35;
  if (workflows.some((w) => w.jobs.length > 1)) score += 10;
  if (infraFiles.length > 0) score += 20;
  if (composeServices.length > 0) score += 10;
  if (serviceDirs.length > 0) score += 15;
  if (rootDirs.length >= 3) score += 10;
  score = Math.min(100, score);

  const structurallyFlat = infraFiles.length === 0 && serviceDirs.length === 0 && rootDirs.length < 3;
  const inferred = workflows.length === 0 || structurallyFlat;

  return {
    meta,
    components,
    links,
    workflows,
    infraFiles,
    composeServices,
    serviceDirs,
    languages,
    languageMix,
    tree: cleanTree.slice(0, 400),
    manifestExcerpts,
    qualityScore: score,
    inferred,
    warning: inferred
      ? "No explicit deployment or CI/CD workflow found in this repository. Generating diagram based on guessed file/module structural relationships instead."
      : null,
  };
}
