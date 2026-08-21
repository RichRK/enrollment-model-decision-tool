.PHONY: build fetch rebuild clean venv serve check-data site-install test-e2e browsers

## Audit the working tree against the DHS data agreement, without rebuilding
## either side. Needs `build` to have run at least once -- it audits
## pipeline/data/regions.json and site/dist, not source. Two independent
## halves: pipeline/check_data.py audits the data, site/tests/check-data.test.js
## (bun test) audits the built site. Neither needs to see the other's tree.
## Both also run automatically as the last step of `build` below -- this
## target is the fast path when you want the audit on its own.
check-data:
	@cd pipeline && uv run python check_data.py
	@cd site && bun run check-data

## Fetch every source (reusing anything already cached), recompute
## pipeline/data/regions.json, then build the site from it. Two toolchains, one
## command: the Astro build reads pipeline/data/regions.json off disk, so the
## pipeline must finish first. Each half runs its own check-data audit as the
## last thing it does and fails if that audit fails -- see `check-data` below
## for what each half checks.
build:
	@cd pipeline && uv run python run_all.py
	@cd site && bun run build

## Install the site's dependencies (bun). Not a hard prerequisite for `build`/
## `serve` -- bun installs on demand -- but useful to provision explicitly, the
## same way `venv` is for the Python side.
site-install:
	@cd site && bun install

## Fetch only, into pipeline/data/raw/
fetch:
	@cd pipeline && uv run python run_all.py --fetch

## Genuine cold run: discard pipeline/data/raw and refetch ~60 MB before building
rebuild:
	@cd pipeline && uv run python run_all.py --clean
	@cd site && bun run build

## Discard derived output and the refetchable cache. Leaves the DHS recode
## directories alone -- they cannot be refetched and re-obtaining them means
## another approval from DHS. That rule is NOT restated here: run_all.py's
## clean() is the only implementation of it, and this target calls it rather
## than reimplementing the policy in a second language. Leaves pipeline/.venv
## and site/node_modules alone too, same reason `venv` below doesn't touch
## them: installed dependencies aren't derived output, they're just slow to
## reproduce.
clean:
	@cd pipeline && uv run python run_all.py --clean-only
	@uv run python -c "import shutil; shutil.rmtree('site/dist', ignore_errors=True); print('removed site/dist')"

## Create/refresh the pipeline's environment from pipeline/pyproject.toml and
## pipeline/uv.lock, installing a matching Python interpreter automatically if
## one isn't already available. Not a hard prerequisite for the targets above
## -- `uv run` syncs on demand -- but useful to provision the environment
## explicitly up front.
venv:
	@cd pipeline && uv sync

## Serve the production build (site/dist) -- what `make build` just produced and
## what check-data audits, so this is what to screenshot when verifying a change.
## Needs `make build` to have run at least once. For iterative editing instead,
## run `bun run dev` in site/ -- it re-reads pipeline/data/regions.json on every
## request rather than needing a rebuild, but serves from source, not dist/.
serve:
	@cd site && bun run preview

## Browser tests (site/e2e/), against the production build in site/dist. Needs
## `make build` to have run, and `make browsers` once per machine. Deliberately
## NOT part of `build`: it needs a browser binary and a running server, and the
## build has to stay the fast, hermetic path. It guards interaction behaviour
## and data rendering only -- it is not a substitute for looking at a rendered
## image, which `serve` above is for.
test-e2e:
	@cd site && bun run test:e2e

## Install the Chromium build Playwright drives. A per-machine provisioning
## step, in the same spirit as `venv` and `site-install`.
browsers:
	@cd site && bunx playwright install chromium
