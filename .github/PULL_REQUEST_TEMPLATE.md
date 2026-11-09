## Summary

- 

## Workflow checklist

- [ ] Branched from latest `staging` (not `main`)
- [ ] Branch name matches `feat|fix|chore|docs|…` (or `cursor/*` for Cloud Agents)
- [ ] This PR targets **`staging`** (only release PRs may target `main`, and only from `staging`)
- [ ] Title uses Conventional Commits (`feat: …`, `fix: …`, `chore: …`)
- [ ] CI green: `quality` and `branch-flow`

## Test plan

- [ ] 

## Note

App runtimes remain **`local`** and **`production` only** (`docs/ENVIRONMENTS.md`).
The Git branch named `staging` is an integration lane, not an application environment.
Do not confuse it with `npm run check:staging` (production-like acceptance check).
