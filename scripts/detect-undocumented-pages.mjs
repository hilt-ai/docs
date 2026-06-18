#!/usr/bin/env node
// ---------------------------------------------------------------------------
// detect-undocumented-pages.mjs
//
// Deterministic detector for the "auto-document new dashboard pages" pipeline.
//
// It diffs the Hilt dashboard frontend's sidebar navigation (the source of
// truth for user-facing pages) against this docs repo (page .mdx files + the
// docs.json navigation), in both English and Chinese, and reports:
//
//   - pages in the app with no English doc / not in English nav
//   - pages with no Chinese doc / not in Chinese nav (locale gaps)
//   - doc pages that no longer map to any app page (possible stale docs)
//
// It reads the frontend's src/utils/constants.ts nav config — new pages are
// almost always added there as an inline { label, path } item, which is what
// this detector keys on. It does NOT execute or import any app code.
//
// Usage:
//   node scripts/detect-undocumented-pages.mjs [--json] [--frontend <dir>]
//
//   --json            machine-readable output (for CI / the drafting agent)
//   --frontend <dir>  path to the dag-frontend checkout
//                     (default: $HILT_FRONTEND_DIR or ../dag-frontend)
//
// Exit code: 0 when every app page has EN+ZH docs and nav entries; 1 when
// there are missing docs/nav entries (i.e. drafting work to do). Possible
// stale docs are reported as warnings and do not affect the exit code.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- CLI args --------------------------------------------------------------
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const frontendArgIdx = argv.indexOf("--frontend");
const frontendDir = resolve(
  DOCS_ROOT,
  frontendArgIdx !== -1 && argv[frontendArgIdx + 1]
    ? argv[frontendArgIdx + 1]
    : process.env.HILT_FRONTEND_DIR || "../dag-frontend",
);

// ---------------------------------------------------------------------------
// Configuration: how app routes map to doc files.
//
// Most pages follow the default rule (slug = last path segment, under
// dashboard/ unless the route is an /admin/ page). The ALIASES map records the
// intentional exceptions where the doc filename differs from the route. Add an
// entry here only when a NEW page is deliberately documented under a different
// slug or folder than its route implies — new pages usually need no entry.
// ---------------------------------------------------------------------------

const ALIASES = {
  "/admin/users": "administration/user-management",
  "/admin/teams": "administration/teams",
  "/reports": "administration/reports",
  "/admin/behavioral-suppression": "dashboard/anomaly-windows",
  "/admin/status": "administration/system-status",
  "/admin/audit": "administration/audit-log",
};

// App routes that are intentionally NOT documented (so the check stays green
// instead of flagging them forever). Add a route here with a short reason when
// a page is internal/experimental and deliberately has no client-facing doc.
const IGNORE = new Set([
  "/admin/billing", // demo-only preview with placeholder pricing, not a shipped feature
]);

// Doc pages that exist on purpose without a 1:1 app route (feature pages,
// section index pages). These are never reported as stale.
const DOC_ONLY = new Set([
  "dashboard/layout",
  "dashboard/mcp-server",
  "administration/layout",
]);

// Section label for the standalone NavItem consts that are referenced by
// identifier inside NAV_SECTIONS (so positional section detection can't see
// them). New pages added as inline items don't need entries here.
const STANDALONE_SECTIONS = {
  OVERVIEW_NAV: "Overview",
  COLLECTORS_NAV: "Collectors",
  REPORTS_NAV: "Security",
  BILLING_NAV: "Admin",
};

// ---------------------------------------------------------------------------
// Parse the frontend sidebar nav config.
// ---------------------------------------------------------------------------

function parseNavItems(source) {
  // Section objects look like:  { label: "Data Flow", items: [ ... ] }
  const sectionRe = /label:\s*"([^"]+)",\s*items:\s*\[/g;
  const sections = [];
  for (let m; (m = sectionRe.exec(source)); ) {
    sections.push({ label: m[1], index: m.index });
  }
  const sectionAt = (index) => {
    let label = null;
    for (const s of sections) {
      if (s.index < index) label = s.label;
      else break;
    }
    return label;
  };

  // Standalone consts:  export const OVERVIEW_NAV: NavItem = { label: ..., path: ... }
  const constRe = /export const (\w+):\s*NavItem\s*=\s*{/g;
  const constNames = [];
  for (let m; (m = constRe.exec(source)); ) {
    constNames.push({ name: m[1], index: m.index });
  }
  const constNameAt = (index) => {
    // The nearest preceding `export const X: NavItem = {` within a short window.
    let best = null;
    for (const c of constNames) {
      if (c.index < index && index - c.index < 120) best = c.name;
    }
    return best;
  };

  // Nav items:  { label: "X", path: "/y", icon: Z, requiredPermission?, ... }
  const itemRe = /label:\s*"([^"]+)",\s*path:\s*"([^"]+)"/g;
  const items = [];
  const seen = new Set();
  for (let m; (m = itemRe.exec(source)); ) {
    const [, label, path] = m;
    if (seen.has(path)) continue;
    seen.add(path);

    // Look at the object body following the match for flags.
    const tail = source.slice(m.index, m.index + 260);
    const requiredPermission = (tail.match(/requiredPermission:\s*"([^"]+)"/) || [])[1] || null;
    const demoOnly = /demoOnly:\s*true/.test(tail);
    const disabled = /disabled:\s*true/.test(tail);

    const constName = constNameAt(m.index);
    const section = constName
      ? STANDALONE_SECTIONS[constName] || sectionAt(m.index)
      : sectionAt(m.index);

    items.push({ label, path, section, requiredPermission, demoOnly, disabled });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Map an app route to its expected doc base path (without .mdx / locale prefix).
// ---------------------------------------------------------------------------

function expectedDocBase(path) {
  if (ALIASES[path]) return ALIASES[path];
  const slug = path.replace(/^\//, "").split("/").filter(Boolean).pop();
  const folder = path.startsWith("/admin/") ? "administration" : "dashboard";
  return `${folder}/${slug}`;
}

// ---------------------------------------------------------------------------
// Collect every page slug referenced in docs.json navigation, per language.
// ---------------------------------------------------------------------------

function collectNavPages(node, out) {
  if (typeof node === "string") {
    out.add(node);
  } else if (Array.isArray(node)) {
    for (const n of node) collectNavPages(n, out);
  } else if (node && typeof node === "object") {
    if (node.pages) collectNavPages(node.pages, out);
  }
}

function loadDocsNav() {
  const docsJson = JSON.parse(readFileSync(join(DOCS_ROOT, "docs.json"), "utf-8"));
  const langs = docsJson.navigation?.languages || [];
  const byLang = {};
  for (const lang of langs) {
    const set = new Set();
    collectNavPages(lang.tabs || [], set);
    byLang[lang.language] = set;
  }
  return byLang;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const constantsPath = join(frontendDir, "src/utils/constants.ts");
  if (!existsSync(constantsPath)) {
    console.error(
      `ERROR: cannot find frontend nav config at ${constantsPath}\n` +
        `Set --frontend <dir> or $HILT_FRONTEND_DIR to your dag-frontend checkout.`,
    );
    process.exit(2);
  }

  const source = readFileSync(constantsPath, "utf-8");
  const items = parseNavItems(source).filter(
    (it) => !it.disabled && !IGNORE.has(it.path),
  );
  const nav = loadDocsNav();
  const enNav = nav.en || new Set();
  const zhNav = nav.zh || new Set();

  const fileExists = (p) => existsSync(join(DOCS_ROOT, `${p}.mdx`));

  const gaps = [];
  for (const it of items) {
    const enBase = expectedDocBase(it.path);
    const zhBase = `zh/${enBase}`;
    const issues = [];
    if (!fileExists(enBase)) issues.push("en-doc-missing");
    else if (!enNav.has(enBase)) issues.push("en-nav-missing");
    if (!fileExists(zhBase)) issues.push("zh-doc-missing");
    else if (!zhNav.has(zhBase)) issues.push("zh-nav-missing");
    if (issues.length) {
      gaps.push({
        label: it.label,
        route: it.path,
        section: it.section,
        permission: it.requiredPermission,
        demoOnly: it.demoOnly,
        enDoc: `${enBase}.mdx`,
        zhDoc: `${zhBase}.mdx`,
        issues,
      });
    }
  }

  // Possible stale docs: .mdx files not mapped from any app page.
  const expectedBases = new Set(items.map((it) => expectedDocBase(it.path)));
  const stale = [];
  for (const folder of ["dashboard", "administration"]) {
    const dir = join(DOCS_ROOT, folder);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".mdx")) continue;
      const base = `${folder}/${f.replace(/\.mdx$/, "")}`;
      if (!expectedBases.has(base) && !DOC_ONLY.has(base)) {
        stale.push(base);
      }
    }
  }

  const report = {
    scannedAt: new Date().toISOString(),
    frontend: frontendDir,
    appPageCount: items.length,
    gapCount: gaps.length,
    gaps,
    possiblyStale: stale,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  process.exit(gaps.length ? 1 : 0);
}

function printHuman(r) {
  const line = "-".repeat(64);
  console.log(line);
  console.log(`Hilt docs coverage check  (${r.appPageCount} app pages scanned)`);
  console.log(`frontend: ${r.frontend}`);
  console.log(line);
  if (!r.gaps.length) {
    console.log("OK: every app page has English + Chinese docs and nav entries.");
  } else {
    console.log(`${r.gaps.length} page(s) need documentation work:\n`);
    for (const g of r.gaps) {
      const flags = [
        g.permission ? `requires "${g.permission}"` : null,
        g.demoOnly ? "demo-only" : null,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`  • ${g.label}  (${g.route})${flags ? `  [${flags}]` : ""}`);
      console.log(`      section: ${g.section || "?"}`);
      console.log(`      gaps:    ${g.issues.join(", ")}`);
      console.log(`      en:      ${g.enDoc}`);
      console.log(`      zh:      ${g.zhDoc}`);
    }
  }
  if (r.possiblyStale.length) {
    console.log(`\nPossible stale docs (in repo, no matching app page — review, do not auto-delete):`);
    for (const s of r.possiblyStale) console.log(`  • ${s}.mdx`);
  }
  console.log(line);
}

main();
