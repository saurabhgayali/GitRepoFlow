export type ThemeId = "dark" | "light" | "sundown" | "neon" | "matrix" | "print";

export const NODE_CATEGORIES = [
  "trigger",
  "job",
  "infra",
  "service",
  "step",
  "queue",
  "database",
  "storage",
  "external",
] as const;

export type NodeCategory = (typeof NODE_CATEGORIES)[number];

export interface CanvasTheme {
  id: ThemeId;
  label: string;
  bg: string;
  swatch: string;
  fg: string;
  muted: string;
  shadow: string;
  connector: string;
  glow: boolean;
  /** base (top face) color per node category */
  base: Record<NodeCategory, string>;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toHex(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/** amount < 1 darkens, > 1 lightens */
export function shade(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  return `#${toHex(r * amount)}${toHex(g * amount)}${toHex(b * amount)}`;
}

function palette(map: Record<NodeCategory, string>) {
  return map;
}

export const THEMES: Record<ThemeId, CanvasTheme> = {
  dark: {
    id: "dark",
    label: "Dark",
    bg: "#0b0f16",
    swatch: "#0b0f16",
    fg: "#e9edf6",
    muted: "#98a5bb",
    shadow: "rgba(0,0,0,0.45)",
    connector: "#64748b",
    glow: false,
    base: palette({
      trigger: "#f7c873",
      job: "#7dd3fc",
      infra: "#c4b5fd",
      service: "#67e8f9",
      step: "#bae6fd",
      queue: "#fcd34d",
      database: "#86efac",
      storage: "#fda4af",
      external: "#e2e8f0",
    }),
  },
  light: {
    id: "light",
    label: "Light",
    bg: "#ffffff",
    swatch: "#ffffff",
    fg: "#1e2532",
    muted: "#5c6880",
    shadow: "rgba(15,23,42,0.16)",
    connector: "#64748b",
    glow: false,
    base: palette({
      trigger: "#f7c873",
      job: "#7dd3fc",
      infra: "#c4b5fd",
      service: "#67e8f9",
      step: "#bae6fd",
      queue: "#fcd34d",
      database: "#86efac",
      storage: "#fda4af",
      external: "#cbd5e1",
    }),
  },
  sundown: {
    id: "sundown",
    label: "Sundown",
    bg: "#f4e7d3",
    swatch: "#f4e7d3",
    fg: "#3b2412",
    muted: "#8a6a4b",
    shadow: "rgba(90,52,22,0.22)",
    connector: "#a4602c",
    glow: false,
    base: palette({
      trigger: "#f4a13c",
      job: "#e2762f",
      infra: "#c9752f",
      service: "#d98f45",
      step: "#e8a86a",
      queue: "#b96a25",
      database: "#a35c2a",
      storage: "#8a5a34",
      external: "#c9a882",
    }),
  },
  neon: {
    id: "neon",
    label: "Neon glow",
    bg: "#05060f",
    swatch: "#05060f",
    fg: "#f2f7ff",
    muted: "#8ea0d8",
    shadow: "rgba(0,0,0,0.6)",
    connector: "#22d3ee",
    glow: true,
    base: palette({
      trigger: "#ffb300",
      job: "#00e5ff",
      infra: "#b026ff",
      service: "#00ffc6",
      step: "#5ce1ff",
      queue: "#ffe600",
      database: "#39ff14",
      storage: "#ff2e88",
      external: "#c8d6ff",
    }),
  },
  matrix: {
    id: "matrix",
    label: "Matrix",
    bg: "#000000",
    swatch: "#000000",
    fg: "#b6ffb6",
    muted: "#4caf50",
    shadow: "rgba(0,0,0,0.7)",
    connector: "#1fbf46",
    glow: true,
    base: palette({
      trigger: "#d4ffd4",
      job: "#7cff7c",
      infra: "#4ade80",
      service: "#39ff14",
      step: "#9dfc9d",
      queue: "#2fe06a",
      database: "#16a34a",
      storage: "#0f7a35",
      external: "#83c98f",
    }),
  },
  print: {
    id: "print",
    label: "Print friendly",
    bg: "#ffffff",
    swatch: "#ffffff",
    fg: "#111111",
    muted: "#555555",
    shadow: "rgba(0,0,0,0.14)",
    connector: "#555555",
    glow: false,
    base: palette({
      trigger: "#f2f2f2",
      job: "#dcdcdc",
      infra: "#c8c8c8",
      service: "#d2d2d2",
      step: "#e6e6e6",
      queue: "#bebebe",
      database: "#aaaaaa",
      storage: "#969696",
      external: "#828282",
    }),
  },
};

export function faces(theme: CanvasTheme, category: string) {
  const base = theme.base[(category as NodeCategory) in theme.base ? (category as NodeCategory) : "external"];
  return { top: base, left: shade(base, 0.62), right: shade(base, 0.44) };
}

export const THEME_LIST = Object.values(THEMES);
