# Auto-documentation for new dashboard pages

This repo keeps itself in sync with the Hilt dashboard frontend
(`hilt-ai/dag-frontend`). When a new page is added to the app sidebar, the
pipeline detects it and opens a PR with the English + Chinese docs and the
navigation wired up — so docs no longer have to be written by hand each time.

## How it works

```
 frontend merge / nightly cron / manual run
        │
        ▼
 [ detect ]  node scripts/detect-undocumented-pages.mjs
        │     diffs the app sidebar nav (constants.ts) against this repo's
        │     .mdx files + docs.json, in English and Chinese
        │
        ├─ no gaps ──▶ exit 0, nothing to do
        │
        ▼ gaps found (exit 1)
 [ draft ]   Claude (anthropics/claude-code-action) reads the report + the
        │    page's frontend source, follows .github/docs-agent/new-page-docs-prompt.md,
        │    writes EN + ZH .mdx, updates layout.mdx files and docs.json
        │
        ▼
 [ PR ]  "docs: add documentation for new dashboard pages"  → human review
```

The detection step is fully deterministic; the drafting step is an LLM (writing
prose + a faithful translation needs one). A human reviews every PR before merge
— nothing is auto-merged.

## The detector (run it anytime, locally)

```bash
# uses ../dag-frontend by default
node scripts/detect-undocumented-pages.mjs

# or point at a checkout / pass --json for tooling
HILT_FRONTEND_DIR=/path/to/dag-frontend node scripts/detect-undocumented-pages.mjs --json
```

Exit code `0` = every app page has EN + ZH docs and nav entries; `1` = work to
do (it lists each page, its route, permission, and which artifacts are missing).
Possible stale docs (in the repo but with no matching app page) are reported as
warnings for human review and never auto-deleted.

It is config-driven via the top of the script:

- `ALIASES` — routes whose doc filename intentionally differs from the route
  (e.g. `/admin/users` → `administration/user-management`). New pages usually
  need no entry.
- `IGNORE` — routes that are intentionally never documented (internal/demo
  pages). Add one to keep the check green instead of flagging it forever.
- `DOC_ONLY` — doc pages that exist on purpose without an app route (e.g.
  `dashboard/mcp-server`, the `layout` index pages).

## One-time setup (GitHub)

In **`hilt-ai/docs` → Settings → Secrets and variables → Actions**, add:

| Secret | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Drafting step (the Claude action) |
| `FRONTEND_REPO_TOKEN` | Read access to `hilt-ai/dag-frontend` so CI can check it out (PAT with `repo:read`, or a GitHub App token) |

The workflow [`.github/workflows/docs-sync.yml`](.github/workflows/docs-sync.yml)
then runs on a weekly cron and on manual dispatch. Verify the
`anthropics/claude-code-action@v1` input names against the version you pin.

## Trigger immediately on a frontend merge (optional)

Add this to **`hilt-ai/dag-frontend`** so a change to the nav config pings the
docs repo right away instead of waiting for the nightly run. Requires a
`DOCS_REPO_TOKEN` secret in the frontend repo with `repo` scope on `hilt-ai/docs`.

```yaml
# .github/workflows/notify-docs.yml  (in dag-frontend)
name: Notify docs of nav changes
on:
  push:
    branches: [main]
    paths:
      - "src/utils/constants.ts"
      - "src/App.tsx"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsSL -X POST \
            -H "Authorization: token ${{ secrets.DOCS_REPO_TOKEN }}" \
            -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/hilt-ai/docs/dispatches \
            -d '{"event_type":"frontend-page-added"}'
```

## Alternative: a scheduled Claude Code routine

If you'd rather not run the LLM step inside GitHub Actions, the same detect →
draft → PR flow can run as a scheduled Claude Code cloud agent (`/schedule`)
that has both repos available. The detector and SOP prompt are reused as-is.

## When the app changes shape

The detector keys on `{ label, path }` items in the frontend's
`src/utils/constants.ts`. New pages added there as normal sidebar items are
picked up automatically. If the nav config is restructured substantially,
update the small parser / `ALIASES` in `scripts/detect-undocumented-pages.mjs`.
