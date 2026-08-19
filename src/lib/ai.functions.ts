import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const ICONS = [
  "server",
  "database",
  "sql",
  "nosql",
  "cache",
  "queue",
  "storage",
  "lock",
  "code",
  "cloud",
  "container",
  "kubernetes",
  "test",
  "build",
  "deploy",
  "package",
  "api",
  "web",
  "user",
  "clock",
  "branch",
] as const;

const KINDS = [
  "trigger",
  "job",
  "service",
  "queue",
  "database",
  "storage",
  "external",
  "infra",
] as const;

const InputSchema = z.object({
  repo: z.string(),
  language: z.string(),
  languageMix: z.array(z.object({ lang: z.string(), files: z.number() })),
  workflows: z.array(
    z.object({
      file: z.string(),
      events: z.array(z.string()),
      jobs: z.array(z.object({ id: z.string(), needs: z.array(z.string()), summary: z.string() })),
    }),
  ),
  tree: z.array(z.string()).max(400),
  manifests: z.array(z.object({ path: z.string(), excerpt: z.string() })).max(8),
});

export interface AiNode {
  id: string;
  label: string;
  description: string;
  kind: string;
  icon: string;
}
export interface AiEdge {
  from: string;
  to: string;
  label: string;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

const ResultSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string().default(""),
        kind: z.string(),
        icon: z.string(),
      }),
    )
    .max(40),
  edges: z
    .array(z.object({ from: z.string(), to: z.string(), label: z.string().default("") }))
    .max(80),
  notes: z.string().default(""),
});

export const synthesizeArchitecture = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { resolveAiProvider } = await import("./ai-provider.server");
    const resolved = resolveAiProvider();
    // No AI key configured anywhere → deterministic analysis only.
    if (!resolved) return { nodes: [] as AiNode[], edges: [] as AiEdge[], notes: "" };

    const { streamText } = await import("ai");
    const gateway = resolved.model_factory;


    const prompt = [
      `Repository: ${data.repo} (primary language: ${data.language})`,
      `Language mix: ${data.languageMix.map((l) => `${l.lang}:${l.files}`).join(", ")}`,
      "",
      "CI/CD workflows:",
      data.workflows.length
        ? data.workflows
            .map(
              (w) =>
                `- ${w.file} on [${w.events.join(", ")}]\n${w.jobs
                  .map((j) => `    job ${j.id}${j.needs.length ? ` needs [${j.needs.join(",")}]` : ""}: ${j.summary}`)
                  .join("\n")}`,
            )
            .join("\n")
        : "- none",
      "",
      "Dependency / build manifests:",
      data.manifests.map((m) => `--- ${m.path} ---\n${m.excerpt}`).join("\n"),
      "",
      "Repository file tree (sample):",
      data.tree.join("\n"),
    ].join("\n");

    try {
      const result = streamText({
        model: gateway(resolved.model),
        system: `You are a software architecture analyst. From a repository's real file tree, manifests (any language: Go, Python, Java, Rust, Ruby, PHP, C#, Node, ...), and CI/CD workflow YAML, produce an architecture + workflow diagram.

Rules:
- Derive components from actual evidence: CI triggers and jobs, build/deploy targets, runtime services and entrypoints, datastores, brokers, and third-party APIs found in manifests or compose/k8s files.
- Never invent generic nodes like "Contributors" or "Build Artifacts" unless the evidence supports them.
- Be language-agnostic: e.g. go.mod requiring gorm/pgx implies a SQL database; requirements.txt with celery implies a queue; pom.xml with spring-boot-starter-web implies an HTTP API service.
- kind must be one of: ${KINDS.join(", ")}.
- icon must be exactly one of: ${ICONS.join(", ")} (use sql/nosql/cache/queue/storage for data, container/kubernetes/cloud for infra, test/lock/build/deploy/package for CI jobs, api/web/server for runtime services, branch/clock/user for triggers).
- ids: short kebab-case, unique. edges reference node ids only, edge label <= 14 chars.
- 8 to 24 nodes. Order flow left-to-right: triggers -> CI jobs -> infra -> services -> data/external.

Respond with ONLY a JSON object: {"nodes":[{"id","label","description","kind","icon"}],"edges":[{"from","to","label"}],"notes":"one sentence"}`,
        prompt,
      });

      const text = await result.text;
      const parsed = ResultSchema.safeParse(extractJson(text));
      if (!parsed.success) {
        console.error("synthesizeArchitecture parse failed", parsed.error.message);
        return { nodes: [] as AiNode[], edges: [] as AiEdge[], notes: "" };
      }
      const allowedIcons = new Set<string>(ICONS);
      const allowedKinds = new Set<string>(KINDS);
      const nodes: AiNode[] = parsed.data.nodes.map((n) => ({
        ...n,
        icon: allowedIcons.has(n.icon) ? n.icon : "code",
        kind: allowedKinds.has(n.kind) ? n.kind : "service",
      }));
      const ids = new Set(nodes.map((n) => n.id));
      const edges = parsed.data.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
      return { nodes, edges, notes: parsed.data.notes };
    } catch (e) {
      console.error("synthesizeArchitecture failed", e);
      return { nodes: [] as AiNode[], edges: [] as AiEdge[], notes: "" };
    }
  });
