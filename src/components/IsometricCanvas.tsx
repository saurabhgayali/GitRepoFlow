import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Braces,
  Clock,
  Cloud,
  Container,
  Database,
  FlaskConical,
  GitBranch,
  Globe,
  Hammer,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  type LucideIcon,
  Network,
  Package,
  Rocket,
  Server,
  Table2,
  User,
  Workflow,
  Zap,
} from "lucide-react";
import type { FossflowDocument, FossflowNode } from "@/lib/fossflow";
import { faces, THEMES, THEME_LIST, type ThemeId } from "@/lib/themes";

const TILE_W = 86;
const TILE_H = 44;
const BOX_H = 34;

const ICON_MAP: Record<string, LucideIcon> = {
  server: Server,
  database: Database,
  sql: Table2,
  nosql: Braces,
  cache: Zap,
  queue: Layers,
  storage: HardDrive,
  lock: Lock,
  code: Braces,
  cloud: Cloud,
  container: Container,
  kubernetes: Network,
  test: FlaskConical,
  build: Hammer,
  deploy: Rocket,
  package: Package,
  api: Workflow,
  web: Globe,
  user: User,
  clock: Clock,
  branch: GitBranch,
  key: KeyRound,
};

function project(x: number, y: number) {
  return { sx: (x - y) * TILE_W, sy: (x + y) * TILE_H };
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function IsometricCanvas({ doc, title }: { doc: FossflowDocument; title?: string }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState<string | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>("dark");
  const [transparent, setTransparent] = useState(false);
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const nodeDrag = useRef<{ id: string; x: number; y: number; ox: number; oy: number } | null>(null);

  const theme = THEMES[themeId];

  useEffect(() => setOffsets({}), [doc]);

  const positioned = useMemo(() => {
    const map = new Map<string, { node: FossflowNode; sx: number; sy: number }>();
    doc.nodes.forEach((n) => {
      const { sx, sy } = project(n.position.x, n.position.y);
      const off = offsets[n.id] ?? { x: 0, y: 0 };
      map.set(n.id, { node: n, sx: sx + off.x, sy: sy - n.position.z * 10 + off.y });
    });
    return map;
  }, [doc, offsets]);

  const bounds = useMemo(() => {
    const pts = [...positioned.values()];
    if (pts.length === 0) return { minX: 0, minY: 0, w: 100, h: 100 };
    const minX = Math.min(...pts.map((p) => p.sx)) - TILE_W * 2;
    const maxX = Math.max(...pts.map((p) => p.sx)) + TILE_W * 2;
    const minY = Math.min(...pts.map((p) => p.sy)) - TILE_H * 3;
    const maxY = Math.max(...pts.map((p) => p.sy)) + TILE_H * 3;
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }, [positioned]);

  // --- wheel zoom (non-passive, anchored at cursor) ---
  const stateRef = useRef({ zoom, pan, bounds });
  stateRef.current = { zoom, pan, bounds };

  const handleWheel = useCallback((e: WheelEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const { zoom: z, pan: p, bounds: b } = stateRef.current;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    const next = clamp(z * Math.exp(-dy * 0.0015), MIN_ZOOM, MAX_ZOOM);
    if (next === z) return;
    const rect = el.getBoundingClientRect();
    const scale = Math.max(b.w / rect.width, b.h / rect.height);
    const px = b.minX + (e.clientX - rect.left - (rect.width - b.w / scale) / 2) * scale;
    const py = b.minY + (e.clientY - rect.top - (rect.height - b.h / scale) / 2) * scale;
    const k = next / z;
    setZoom(next);
    setPan({ x: px - (px - p.x) * k, y: py - (py - p.y) * k });
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fn = (e: WheelEvent) => {
      e.preventDefault();
      handleWheel(e);
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [handleWheel]);

  function toUser(clientX: number, clientY: number) {
    const el = wrapRef.current!;
    const rect = el.getBoundingClientRect();
    const scale = Math.max(bounds.w / rect.width, bounds.h / rect.height);
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  }

  function serialize(withBg: boolean) {
    const el = svgRef.current;
    if (!el) return null;
    const clone = el.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(Math.round(bounds.w)));
    clone.setAttribute("height", String(Math.round(bounds.h)));
    clone.setAttribute("viewBox", `${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`);
    const inner = clone.querySelector("g");
    inner?.setAttribute("transform", "translate(0 0) scale(1)");
    if (withBg && !transparent) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(bounds.minX));
      rect.setAttribute("y", String(bounds.minY));
      rect.setAttribute("width", String(bounds.w));
      rect.setAttribute("height", String(bounds.h));
      rect.setAttribute("fill", theme.bg);
      clone.insertBefore(rect, clone.firstChild);
    }
    return {
      markup: new XMLSerializer().serializeToString(clone),
      width: Math.round(bounds.w),
      height: Math.round(bounds.h),
    };
  }

  function downloadSvg() {
    const out = serialize(true);
    if (!out) return;
    const blob = new Blob([out.markup], { type: "image/svg+xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gitrepoflow-diagram.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadPng() {
    const out = serialize(false);
    if (!out) return;
    const scale = 2;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = out.width * scale;
      canvas.height = out.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "gitrepoflow-diagram.png";
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(out.markup)))}`;
  }

  const fg = theme.fg;
  const muted = theme.muted;
  const iconInk = themeId === "matrix" || themeId === "neon" ? "#04120a" : "#0f172a";

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden rounded-xl border border-border"
      style={{
        background: transparent
          ? "repeating-conic-gradient(#9aa4b8 0% 25%, #dfe4ec 0% 50%) 50% / 16px 16px"
          : theme.bg,
        touchAction: "none",
      }}
    >
      {title ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border border-border bg-card/85 px-3 py-1.5 font-mono text-sm font-semibold text-foreground backdrop-blur">
          {title}
        </div>
      ) : null}

      <svg
        ref={svgRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
        onMouseDown={(e) => {
          if (nodeDrag.current) return;
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onMouseMove={(e) => {
          if (nodeDrag.current) {
            const nd = nodeDrag.current;
            const cur = toUser(e.clientX, e.clientY);
            setOffsets((o) => ({
              ...o,
              [nd.id]: { x: nd.ox + (cur.x - nd.x) / zoom, y: nd.oy + (cur.y - nd.y) / zoom },
            }));
            return;
          }
          if (!drag.current) return;
          setPan({
            x: drag.current.px + (e.clientX - drag.current.x),
            y: drag.current.py + (e.clientY - drag.current.y),
          });
        }}
        onMouseUp={() => {
          drag.current = null;
          nodeDrag.current = null;
        }}
        onMouseLeave={() => {
          drag.current = null;
          nodeDrag.current = null;
        }}
      >
        <defs>
          <filter id="iso-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {doc.connectors.map((c) => {
            const a = positioned.get(c.from);
            const b = positioned.get(c.to);
            if (!a || !b) return null;
            const mx = (a.sx + b.sx) / 2;
            const my = (a.sy + b.sy) / 2 - 34;
            const dim = active !== null && active !== c.from && active !== c.to;
            const stroke =
              themeId === "print" || themeId === "matrix" || themeId === "sundown"
                ? theme.connector
                : c.color;
            return (
              <g key={c.id} opacity={dim ? 0.12 : 1} filter={theme.glow ? "url(#iso-glow)" : undefined}>
                <path
                  d={`M ${a.sx} ${a.sy} Q ${mx} ${my} ${b.sx} ${b.sy}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2.5}
                  strokeDasharray="7 6"
                  strokeLinecap="round"
                >
                  <animate attributeName="stroke-dashoffset" from="26" to="0" dur="1.2s" repeatCount="indefinite" />
                </path>
                {c.label ? (
                  <text
                    x={mx}
                    y={my - 4}
                    textAnchor="middle"
                    fill={muted}
                    style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}
                  >
                    {c.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {[...positioned.values()]
            .sort((p, q) => p.sy - q.sy)
            .map(({ node, sx, sy }) => {
              const col = faces(theme, node.category);
              const Icon = ICON_MAP[node.icon] ?? Boxes;
              const dim = active !== null && active !== node.id;
              return (
                <g
                  key={node.id}
                  transform={`translate(${sx} ${sy})`}
                  opacity={dim ? 0.28 : 1}
                  onMouseEnter={() => setActive(node.id)}
                  onMouseLeave={() => setActive(null)}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const cur = toUser(e.clientX, e.clientY);
                    const off = offsets[node.id] ?? { x: 0, y: 0 };
                    nodeDrag.current = { id: node.id, x: cur.x, y: cur.y, ox: off.x, oy: off.y };
                  }}
                  style={{ cursor: "move" }}
                >
                  <polygon
                    points={`0,${BOX_H + 8} ${TILE_W * 0.7},${BOX_H + 8 - TILE_H * 0.7} 0,${BOX_H + 8 - TILE_H * 1.4} ${-TILE_W * 0.7},${BOX_H + 8 - TILE_H * 0.7}`}
                    fill={theme.shadow}
                  />
                  <g filter={theme.glow ? "url(#iso-glow)" : undefined}>
                    <polygon
                      points={`0,0 ${TILE_W * 0.55},${-TILE_H * 0.55} 0,${-TILE_H * 1.1} ${-TILE_W * 0.55},${-TILE_H * 0.55}`}
                      fill={col.top}
                      transform={`translate(0 ${-BOX_H})`}
                    />
                    <polygon
                      points={`${-TILE_W * 0.55},${-TILE_H * 0.55 - BOX_H} 0,${-BOX_H} 0,0 ${-TILE_W * 0.55},${-TILE_H * 0.55}`}
                      fill={col.left}
                    />
                    <polygon
                      points={`${TILE_W * 0.55},${-TILE_H * 0.55 - BOX_H} 0,${-BOX_H} 0,0 ${TILE_W * 0.55},${-TILE_H * 0.55}`}
                      fill={col.right}
                    />
                  </g>
                  {themeId === "print" ? (
                    <polygon
                      points={`0,0 ${TILE_W * 0.55},${-TILE_H * 0.55} 0,${-TILE_H * 1.1} ${-TILE_W * 0.55},${-TILE_H * 0.55}`}
                      fill="none"
                      stroke="#111111"
                      strokeWidth={1}
                      transform={`translate(0 ${-BOX_H})`}
                    />
                  ) : null}
                  <g transform={`translate(-11 ${-BOX_H - TILE_H * 0.55 - 11})`}>
                    <Icon width={22} height={22} color={iconInk} strokeWidth={2.2} />
                  </g>
                  <text x={0} y={34} textAnchor="middle" fill={fg} style={{ fontSize: 15, fontWeight: 600 }}>
                    {node.name.length > 24 ? `${node.name.slice(0, 23)}…` : node.name}
                  </text>
                  <text
                    x={0}
                    y={52}
                    textAnchor="middle"
                    fill={muted}
                    style={{ fontSize: 11.5, fontFamily: "ui-monospace, monospace" }}
                  >
                    {node.icon} · {node.category}
                  </text>
                </g>
              );
            })}
        </g>
      </svg>

      <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/90 p-1 backdrop-blur">
        <span className="px-2 text-xs text-muted-foreground">Theme</span>
        {THEME_LIST.map((t) => (
          <button
            key={t.id}
            onClick={() => setThemeId(t.id)}
            title={t.label}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${
              themeId === t.id
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className="mr-1.5 inline-block size-2.5 translate-y-[1px] rounded-full border border-border"
              style={{ background: t.base.service }}
            />
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setTransparent((v) => !v)}
          title="Transparent background (exports keep transparency)"
          className={`ml-1 rounded-md px-2 py-1 text-xs transition-colors ${
            transparent
              ? "bg-primary font-semibold text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Transparent
        </button>
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg border border-border bg-card/90 p-1 backdrop-blur">
        {[
          { label: "−", fn: () => setZoom((z) => clamp(z / 1.2, MIN_ZOOM, MAX_ZOOM)) },
          { label: "Reset", fn: () => { setZoom(1); setPan({ x: 0, y: 0 }); setOffsets({}); } },
          { label: "+", fn: () => setZoom((z) => clamp(z * 1.2, MIN_ZOOM, MAX_ZOOM)) },
          { label: "SVG", fn: downloadSvg },
          { label: "PNG", fn: downloadPng },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.fn}
            className="rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
        Scroll to zoom · drag canvas to pan · drag a block to move it
      </div>
    </div>
  );
}
