.PHONY: build fetch rebuild clean venv serve check-data site-install test-e2e browsers

## Audit regions.json and site/dist against the DHS data agreement, without rebuilding.
check-data:
	@cd pipeline && uv run python check_data.py
	@cd site && bun run check-data

## Fetch (using the cache), rebuild pipeline/data/regions.json, then build the site. Both halves end with their audit.
build:
	@cd pipeline && uv run python run_all.py
	@cd site && bun run build

## Install the site's dependencies (bun).
site-install:
	@cd site && bun install

## Fetch only, into pipeline/data/raw/
fetch:
	@cd pipeline && uv run python run_all.py --fetch

## Genuine cold run: discard pipeline/data/raw and refetch ~60 MB before building
rebuild:
	@cd pipeline && uv run python run_all.py --clean
	@cd site && bun run build

## Discard derived output and the refetchable cache. Never touches the DHS recodes (see run_all.py's clean()).
clean:
	@cd pipeline && uv run python run_all.py --clean-only
	@uv run python -c "import shutil; shutil.rmtree('site/dist', ignore_errors=True); print('removed site/dist')"

## Create/refresh the pipeline's environment from pipeline/pyproject.toml and uv.lock.
venv:
	@cd pipeline && uv sync

## Serve the production build (site/dist) at localhost:4321 -- what to screenshot when verifying a change.
serve:
	@cd site && bun run preview

## Browser tests (site/e2e/) against site/dist. Needs `make build` and `make browsers`; not part of `build`.
test-e2e:
	@cd site && bun run test:e2e

## Install the Chromium build Playwright drives (once per machine).
browsers:
	@cd site && bunx playwright install chromium
