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

Normally you don't run these directly — `make build` and `make serve` from the
repo root do this after the Python pipeline runs. `bun.lock` is committed; the
version pinned in `package.json`'s `packageManager` field is what created it.

## Telemetry

Astro's CLI collects anonymous usage telemetry by default. It's disabled for
this checkout (`bunx astro telemetry disable`, a per-machine setting stored
outside this repo) — re-run that after a fresh `bun install` on a new machine.
This is separate from `make check-data`, which audits what the *built site*
ships, not what the build tool phones home.
