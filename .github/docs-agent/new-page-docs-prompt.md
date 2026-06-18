# SOP: Document a new Hilt dashboard page

You produce operator-facing documentation for a Hilt dashboard page so it
reaches full parity with the existing Platform → Dashboard pages. Work only
from the frontend source — never invent UI that isn't there.

## Inputs

- `./report.json` — the coverage report. Each entry in `gaps[]` gives the
  page `label`, `route`, `section`, `permission`, `demoOnly`, and the expected
  `enDoc` / `zhDoc` paths.
- `./.frontend` — a checkout of `hilt-ai/dag-frontend`. The page component is
  under `./.frontend/src/pages/<PageName>/`. The sidebar/nav config is
  `./.frontend/src/utils/constants.ts`; routes/permissions are in
  `./.frontend/src/App.tsx`.

## Research each page before writing

Read the page component and the components/hooks it uses. Extract: one-sentence
purpose; permission gate; top-level layout (stacked sections, split panels,
tabs, modals); summary/header bars; every filter and search control (type,
options, default); lists/tables (columns, sort, row-click, empty states);
cards and detail panels (fields, badges, color meaning); charts; actions and
where they navigate; cross-page links; early-access/beta flags; edge cases
(suppressed/offline/permission-denied/scoped-from-URL). Do **not** document
React component names, API endpoints, or DB schemas unless they are a
user-visible label or operator-set config (e.g. an MCP client JSON block).

## Style (match the gold-standard pages exactly)

Study these before writing: `dashboard/users.mdx`, `dashboard/investigate.mdx`,
`dashboard/overview.mdx` (widget `Shows / How to read it / Navigates to`
pattern), `dashboard/anomalies.mdx`, `dashboard/detection-rules.mdx`,
`dashboard/mcp-server.mdx` (capability tables, `<Note>` for early access).

- **Frontmatter** on every page: `title`, `sidebarTitle` (match app nav label),
  `description` (≤160 chars, action-oriented).
- No `#` H1 in the body — Mintlify renders the title as H1.
- `---` horizontal rules between major sections; `##` for major regions, `###`
  for sub-regions.
- **Bold** every UI label exactly as rendered. _Italics_ for enum/state values.
- Use tables for pills, columns, filter options, badge meanings, widget rows,
  and navigation buttons. Bullet lists for toolbar controls and card fields.
- Present tense, second person implied, operator-facing. No marketing words
  ("powerful", "seamlessly", "cutting-edge"), no filler ("This page allows you
  to…"). **No em dashes** (the repo removed them — use commas/parentheses;
  en-dash ranges like `Mon–Fri` are fine).
- State the permission early when the page is gated (e.g. "This page requires
  the **manage alerts** permission.").
- Cross-link related pages the UI deep-links to: `[Users](/dashboard/users)`
  (English) / `[用户](/zh/dashboard/users)` (Chinese). Link the first mention,
  leave later mentions plain.
- For list → detail pages, document in UI order: list filters/sort → row/card
  contents → selection behavior → detail panel top-to-bottom → sub-views →
  pivot/navigate buttons with destinations.

## Chinese page (`zh/...`)

Translate `title`/`sidebarTitle`/`description` and all prose. Keep in-app
English UI strings in English/bold (the app UI is English). Use `/zh/...`
internal links. Match section structure and tables 1:1 with the English page.
Keep terminology consistent with the existing `zh/dashboard/*.mdx` pairs
(异常 = Anomalies, 检测规则 = Detection Rules, 权限 = Permissions, 主机 = host).

## Navigation + layout (both languages, both must stay in sync)

Place the page in the same group as the app sidebar section:
Overview/Collectors → top-level; Data Flow → `Data Flow` group; Security →
`Security` group; Admin → under `administration/` per `administration/layout.mdx`.

For each page, update all of: the English `.mdx`, the Chinese `.mdx`,
`dashboard/layout.mdx` (or `administration/layout.mdx`), `zh/dashboard/layout.mdx`,
and both language blocks in `docs.json`. Add a one-line bullet to the layout
index. Use the kebab-case slug from `report.json` `enDoc`.

## Never

- Ship a stub (frontmatter + one line). If a page is Investigate-level, prioritize
  purpose → filters → primary list → detail → navigation, but cover it.
- Write "Coming soon", invent features, or document backend internals.
- Add a page to `docs.json` without creating the `.mdx` (or vice versa).
- Update English only — Chinese page and nav must land together.

## Finish

Run `node scripts/detect-undocumented-pages.mjs --frontend .frontend` and
confirm it exits 0 (no remaining gaps for the pages you handled), then open the
PR. If a page is genuinely not meant for client docs (e.g. an internal/demo
page), note it in the PR description for human review instead of forcing a page.
