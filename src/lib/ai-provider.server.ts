import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import config from "../../gitrepoflow.config.json";

export type ProviderId =
  | "lovable"
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "openrouter"
  | "compatible";

interface ProviderPreset {
  baseURL: string;
  keyEnv: string[];
  defaultModel: string;
  headers?: (key: string) => Record<string, string>;
}

const PRESETS: Record<ProviderId, ProviderPreset> = {
  lovable: {
    baseURL: "https://ai.gateway.lovable.dev/v1",
    keyEnv: ["LOVABLE_API_KEY"],
    defaultModel: "google/gemini-3.7-flash",
    headers: (key) => ({ "Lovable-API-Key": key }),
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    keyEnv: ["OPENAI_API_KEY", "AI_API_KEY"],
    defaultModel: "gpt-4o-mini",
  },
  anthropic: {
    // Anthropic exposes an OpenAI-compatible endpoint
    baseURL: "https://api.anthropic.com/v1",
    keyEnv: ["ANTHROPIC_API_KEY", "AI_API_KEY"],
    defaultModel: "claude-sonnet-4-5",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
  google: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: ["GOOGLE_API_KEY", "GEMINI_API_KEY", "AI_API_KEY"],
    defaultModel: "gemini-2.0-flash",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    keyEnv: ["GROQ_API_KEY", "AI_API_KEY"],
    defaultModel: "llama-3.3-70b-versatile",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    keyEnv: ["OPENROUTER_API_KEY", "AI_API_KEY"],
    defaultModel: "google/gemini-2.0-flash-001",
  },
  compatible: {
    baseURL: "",
    keyEnv: ["AI_API_KEY"],
    defaultModel: "",
  },
};

const AUTO_ORDER: ProviderId[] = [
  "lovable",
  "openai",
  "anthropic",
  "google",
  "groq",
  "openrouter",
  "compatible",
];

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function keyFor(id: ProviderId) {
  for (const name of PRESETS[id].keyEnv) {
    const v = env(name);
    if (v) return v;
  }
  return undefined;
}

export interface ResolvedAi {
  provider: ProviderId;
  model: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model_factory: any;
}

/**
 * Resolves an AI provider from configuration + environment.
 * Returns null when no key is configured — the app then falls back to the
 * fully deterministic (non-AI) repository analysis.
 */
export function resolveAiProvider(): ResolvedAi | null {
  const cfg = config.ai as { enabled?: boolean; provider?: string; model?: string };
  if (cfg.enabled === false) return null;

  const requested = (env("AI_PROVIDER") ?? cfg.provider ?? "auto").toLowerCase();
  if (requested === "none") return null;

  const candidates: ProviderId[] =
    requested === "auto" ? AUTO_ORDER : ([requested] as ProviderId[]).filter((p) => p in PRESETS);

  for (const id of candidates) {
    const preset = PRESETS[id];
    const key = keyFor(id);
    const baseURL = env("AI_BASE_URL") ?? preset.baseURL;
    if (!key || !baseURL) continue;
    const model = env("AI_MODEL") || cfg.model || preset.defaultModel;
    if (!model) continue;
    const provider = createOpenAICompatible({
      name: `repoflow-${id}`,
      baseURL,
      headers: preset.headers ? preset.headers(key) : { Authorization: `Bearer ${key}` },
    });
    return { provider: id, model, model_factory: provider };
  }
  return null;
}
