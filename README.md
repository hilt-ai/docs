# Hilt Documentation Monorepo

This repository contains three Mintlify documentation sites:

| Directory | Domain | Purpose |
|-----------|--------|---------|
| `customer/` | docs.hilt.ai | Customer-facing product documentation |
| `prospect/` | hilt.ai/docs | Prospect-facing product overview |
| `dev/` | info.hilt.ai | Internal developer documentation |

## Local Development

To preview a site locally, cd into its directory and run:

```bash
npx mintlify@latest dev
```

## Deployment

Each site is a separate Mintlify project configured with the monorepo path pointing to its subdirectory.

After pushing changes:

1. **docs.hilt.ai** — Existing Mintlify project: Git Settings → enable monorepo → path `/customer`
2. **hilt.ai/docs** — New Mintlify project: same repo, monorepo path `/prospect`, custom domain as supported by Mintlify
3. **info.hilt.ai** — New Mintlify project: same repo, monorepo path `/dev`, CNAME to Mintlify hosting
