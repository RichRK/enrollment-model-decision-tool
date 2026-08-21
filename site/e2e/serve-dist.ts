/* A foreground static server over dist/, for Playwright's `webServer`.
 *
 * `astro preview` cannot be used here: it daemonises. A second invocation
 * prints "Preview server already running" and exits 0, and even the first
 * leaves a background process behind that outlives the run. Playwright expects
 * to own a foreground process it can kill on teardown, so the suite brings its
 * own server rather than fighting that lifecycle. It also means the suite
 * always serves what is on disk right now, and never a stale daemon started by
 * an earlier `make serve`.
 *
 * Port 4331 rather than preview's 4321, for the same reason: `make serve` may
 * well be running while the suite is, and the two must not collide.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const DIST = join(import.meta.dir, "..", "dist");
const PORT = Number(process.env.E2E_PORT || 4331);

Bun.serve({
  port: PORT,
  fetch(request) {
    const { pathname } = new URL(request.url);
    // Directory requests resolve to index.html; the site is a single page, so
    // this is the whole of the routing.
    const rel = pathname.endsWith("/") ? pathname + "index.html" : pathname;
    const file = Bun.file(join(DIST, decodeURIComponent(rel)));
    return file.exists().then((ok) =>
      ok ? new Response(file) : new Response("not found", { status: 404 }));
  },
});

if (!existsSync(join(DIST, "index.html"))) {
  // Not fatal here -- globalSetup gives the actionable message. Serving 404s is
  // a clearer failure than refusing to start, which Playwright reports only as
  // a webServer timeout.
  console.error("dist/index.html is missing -- run `make build` first");
}

console.log("serving dist/ on http://localhost:" + PORT + "/");
