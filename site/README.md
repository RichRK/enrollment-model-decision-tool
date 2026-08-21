# site/

The site's frontend toolchain — separate from the Python/`uv` pipeline in
`pipeline/` at the repo root, which produces `pipeline/data/regions.json`. See
the root [`CLAUDE.md`](../CLAUDE.md) and [`README.md`](../README.md) first; the
rules there (no analytics/tracking, cell suppression, attribution) apply to
whatever this builds.

`src/pages/index.astro` reads `../pipeline/data/regions.json` off disk at build
time and inlines it into the page — there's no client-side fetch, so the page
can't be opened over `file://` and still miss the data the way the old
fetch-based version could.

## Commands

Run from this directory, using [bun](https://bun.sh) rather than npm:

| Command          | Action                                              |
| :---------------- | :-------------------------------------------------- |
| `bun install`      | Install dependencies (once, or after a lockfile change) |
| `bun run dev`       | Dev server at `localhost:8000` (pinned, matching the port the pre-Astro static site used) — needs `pipeline/data/regions.json` to already exist (`make build` from the repo root, or at least `make -C .. fetch` then the pipeline) |
| `bun run build`     | Production build to `./dist/`, then `bun test tests/check-data.test.js` — the build fails if the audit does |
| `bun run preview`   | Serve the production build locally                   |
| `bun run check-data`| Just the audit, against whatever's already in `./dist/`, no rebuild |
| `bun run test:e2e`  | Playwright specs in `e2e/`, against `./dist/` — needs `bun run build` first, and `bunx playwright install chromium` once per machine |

Normally you don't run these directly — `make build`, `make serve` and
`make test-e2e` from the repo root do this after the Python pipeline runs.
`bun.lock` is committed; the version pinned in `package.json`'s
`packageManager` field is what created it.

## Telemetry

Astro's CLI collects anonymous usage telemetry by default. It's disabled for
this checkout (`bunx astro telemetry disable`, a per-machine setting stored
outside this repo) — re-run that after a fresh `bun install` on a new machine.
This is separate from `make check-data`, which audits what the *built site*
ships, not what the build tool phones home.

## Two test runners, and why they cannot see each other

`tests/` belongs to `bun test` — `check-data.test.js`, the data-agreement audit
against `dist/`, which runs as part of `bun run build`. `e2e/` belongs to
Playwright and runs only on demand.

They are separate directories because bun's runner collects `*.spec.ts` as well
as `*.test.ts`, so a bare `bun test` here would try to execute the Playwright
specs and report bootstrap errors that say nothing about this project.
`bunfig.toml` pins `[test] root = "tests"` so that cannot happen, and
`playwright.config.ts` pins `testDir: "./e2e"` for the other direction.

The e2e suite serves `dist/` itself (`e2e/serve-dist.ts`, port 4331) rather than
using `bun run preview`. `astro preview` daemonises: a second invocation prints
"Preview server already running" and exits 0, and the background process
outlives the run — Playwright needs a foreground process it can kill. The
separate port also means the suite and a `make serve` left running cannot
collide.
