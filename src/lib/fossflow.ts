import type { Analysis, AnalyzedComponent, IconName, NodeKind } from "./repo-analyzer";

export interface FossflowNode {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  category: NodeKind;
  position: { x: number; y: number; z: number };
}

export interface FossflowConnector {
  id: string;
  from: string;
  to: string;
  label: string;
  color: string;
}

export interface FossflowDocument {
  title: string;
  version: string;
  generator: string;
  source: string;
  icons: { id: string; name: string; collection: string }[];
  nodes: FossflowNode[];
  connectors: FossflowConnector[];
}

const LANE: Record<NodeKind, { x: number; z: number }> = {
  trigger: { x: 0, z: 0 },
  job: { x: 4, z: 2 },
  infra: { x: 4, z: 2 },
  service: { x: 4, z: 2 },
  step: { x: 4, z: 2 },
  queue: { x: 8, z: 4 },
  database: { x: 8, z: 4 },
  storage: { x: 8, z: 4 },
  external: { x: 8, z: 4 },
};

const LANE_ORDER: NodeKind[][] = [
  ["trigger"],
  ["job"],
  ["infra"],
  ["service"],
  ["database", "storage", "queue", "external"],
];

/** Compute non-overlapping isometric grid positions, lane by lane. */
export function layoutNodes(components: AnalyzedComponent[]): FossflowNode[] {
  const nodes: FossflowNode[] = [];
  let laneIndex = 0;
  for (const kinds of LANE_ORDER) {
    const group = components.filter((c) => kinds.includes(c.kind));
    if (group.length === 0) continue;
    const base = LANE[kinds[0]!]!;
    const offsetX = base.x + laneIndex * 3;
    const offsetZ = base.z + laneIndex * 1;
    group.forEach((c, i) => {
      nodes.push({
        id: c.id,
        name: c.label,
        description: c.description,
        icon: c.icon,
        category: c.kind,
        position: {
          x: Math.round(offsetX),
          y: i * 2 - (group.length - 1),
          z: Math.round(offsetZ),
        },
      });
    });
    laneIndex += 1;
  }
  return nodes;
}

const CONNECTOR_COLORS: Record<string, string> = {
  push: "#f5a524",
  "on: push": "#f5a524",
  deploys: "#22d3ee",
  provisions: "#a78bfa",
  "reads/writes": "#4ade80",
  builds: "#22d3ee",
  contains: "#94a3b8",
};

export function buildFossflowDocument(analysis: Analysis): FossflowDocument {
  const nodes = layoutNodes(analysis.components);
  const present = new Set(nodes.map((n) => n.id));
  const connectors: FossflowConnector[] = analysis.links
    .filter((l) => present.has(l.from) && present.has(l.to))
    .map((l, i) => ({
      id: `conn-${i}`,
      from: l.from,
      to: l.to,
      label: l.label ?? "",
      color: CONNECTOR_COLORS[l.label ?? ""] ?? "#64748b",
    }));

  return {
    title: `${analysis.meta.fullName} architecture`,
    version: "1.0",
    generator: "GitRepoFlow",
    source: analysis.meta.htmlUrl,
    icons: Array.from(new Set(nodes.map((n) => n.icon))).map((icon) => ({
      id: icon,
      name: icon,
      collection: "isoflow-basic",
    })),
    nodes,
    connectors,
  };
}
