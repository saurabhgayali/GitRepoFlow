# GitRepoFlow

Turn any public GitHub repository into an interactive 3D isometric architecture &
workflow diagram. GitRepoFlow reads the repository tree, package manifests
(Node, Go, Python, Java, Rust, Ruby, PHP, .NET…), container/infrastructure files
and GitHub Actions workflows, then renders the detected components on an
isometric grid you can export as **FossFLOW JSON**, **SVG** or **PNG**.

- Author: **Saurabh Gayali** <saurabh.gayali@gmail.com>
- License: **MIT**

---

## 1. Clone and run

```bash
git clone https://github.com/saurabhgayali/GitRepoFlow.git
cd GitRepoFlow

# install (bun recommended, npm/pnpm also work)
bun install        # or: npm install

bun run dev        # or: npm run dev
# open http://localhost:8080
```

Production build:

```bash
bun run build
bun run preview
```

## 2. AI configuration (optional — the app works without it)

GitRepoFlow is **AI agnostic**. AI is only used to refine the deterministic
analysis into a richer architecture graph. If no key is present, the app falls
back to the fully deterministic analyzer and still produces a diagram.

Two places control this:

### a) `gitrepoflow.config.json` (checked into the repo, no secrets)

```jsonc
{
  "ai": {
    "enabled": true,       // false => never call an AI provider
    "provider": "auto",    // auto | lovable | openai | anthropic | google | groq | openrouter | compatible | none
    "model": ""            // empty => provider default model
  }
}
```

`auto` detects the first provider that has a key in the environment, in this
order: Lovable → OpenAI → Anthropic → Google → Groq → OpenRouter → custom
OpenAI-compatible. Deployed on Lovable, `LOVABLE_API_KEY` is injected
automatically, so the app runs with AI and **zero configuration**.

### b) `.env` (never committed — holds the keys)

Copy the template and fill in only the provider you use:

```bash
cp github/.env.example .env
```

```ini
# pick one (or set AI_PROVIDER to force a specific one)
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_API_KEY=...
# GROQ_API_KEY=...
# OPENROUTER_API_KEY=...

# optional overrides
AI_PROVIDER=openai          # auto | lovable | openai | anthropic | google | groq | openrouter | compatible | none
AI_MODEL=gpt-4o-mini
# AI_BASE_URL=http://localhost:11434/v1   # any OpenAI-compatible server (Ollama, LM Studio, vLLM)
# AI_API_KEY=...                          # generic key used by "compatible"

# optional: raises the GitHub API rate limit for analysis
GITHUB_TOKEN=ghp_...
```

| Provider     | Env var                          | Default model                  |
| ------------ | -------------------------------- | ------------------------------ |
| `lovable`    | `LOVABLE_API_KEY` (auto on Lovable) | `google/gemini-3.7-flash`   |
| `openai`     | `OPENAI_API_KEY`                 | `gpt-4o-mini`                  |
| `anthropic`  | `ANTHROPIC_API_KEY`              | `claude-sonnet-4-5`            |
| `google`     | `GOOGLE_API_KEY` / `GEMINI_API_KEY` | `gemini-2.0-flash`          |
| `groq`       | `GROQ_API_KEY`                   | `llama-3.3-70b-versatile`      |
| `openrouter` | `OPENROUTER_API_KEY`             | `google/gemini-2.0-flash-001`  |
| `compatible` | `AI_API_KEY` + `AI_BASE_URL`     | set `AI_MODEL`                 |

### Key safety

- Keys are read **only** inside server functions (`process.env`) — they never
  reach the browser bundle and are never rendered in the UI.
- Nothing prefixed `VITE_` is used for AI or GitHub credentials.
- `.env`, `.env.*`, `.dev.vars` and `*.local` are git-ignored.
- The optional GitHub Personal Access Token typed into the header stays in the
  browser tab only and is used solely for GitHub API calls.

## 3. App info / branding

`gitrepoflow.config.json` also drives the in-app `i` info dialog (app name,
description, version, author, repository link). Edit it to rebrand your fork —
no code change required.

## 4. Themes

The canvas ships with six themes that keep the same node classification and the
same node positions: **Dark**, **Light**, **Sundown**, **Neon glow**,
**Matrix** and **Print friendly** (greyscale). A transparent toggle makes SVG
and PNG exports background-free.

## 5. Project layout

```
src/lib/repo-analyzer.ts      GitHub API scan: tree, manifests, workflows, heuristics
src/lib/ai.functions.ts       server function: AI architecture synthesis
src/lib/ai-provider.server.ts provider-agnostic AI resolver (server only)
src/lib/fossflow.ts           FossFLOW/Isoflow JSON schema + isometric layout
src/lib/themes.ts             canvas theme palettes
src/components/IsometricCanvas.tsx  SVG isometric renderer + export
src/routes/index.tsx          UI
gitrepoflow.config.json       app info + AI defaults (no secrets)
```

## License

MIT © Saurabh Gayali
