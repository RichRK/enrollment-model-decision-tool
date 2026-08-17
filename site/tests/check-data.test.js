// Audits site/dist against the DHS data agreement -- the site half of
// `make check-data`. The pipeline half (regions.json content: suppression
// floor, disclosive-key scan, cell counts) lives in pipeline/check_data.py
// and needs no visibility into this directory; this file needs none into
// that one. It is a backstop and not a substitute for reading the terms --
// it can see file contents and structure, but it cannot judge intent.
//
// Runs automatically as part of `bun run build` (astro build && bun test
// this file) -- a build that produces dist/ but fails this suite still fails
// the build. Run on its own, against whatever's already in dist/, via
// `bun run check-data` (from site/) or `make check-data` (from the repo
// root, which runs both halves without rebuilding either).

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIST = join(import.meta.dir, "..", "dist");

// Filenames are content-hashed by the Astro/Vite build, so this globs rather
// than hardcoding paths the way a bare index.html + a single app.js could.
const siteFiles = existsSync(DIST)
  ? Array.from(new Bun.Glob("**/*.{html,js,css}").scanSync({ cwd: DIST, absolute: true }))
  : [];

const siteText = siteFiles.map((f) => readFileSync(f, "utf-8")).join("\n");

// Same patterns the Python version of this check used to run, ported as-is --
// they're testing bytes shipped to the browser, not anything Python- or
// JS-specific.
const TRACKING_PATTERNS = [
  [/google-analytics|googletagmanager|gtag\(|\bga\(/, "Google Analytics"],
  [/plausible\.io|fathom|simpleanalytics|matomo|piwik/, "third-party analytics"],
  [/segment\.(com|io)|mixpanel|amplitude|hotjar|fullstory/, "product analytics"],
  [/facebook\.net|fbq\(|doubleclick|adsbygoogle/, "advertising or tracking pixel"],
  [/<form\b/, "a form (lead capture / data collection)"],
  [/type\s*=\s*["']email["']/, "an email input"],
  [/navigator\.sendBeacon|new\s+Image\s*\(/, "a beacon"],
];

describe("published site (site/dist)", () => {
  test("site/dist exists and has been built (run `bun run build`, or `make build` from the repo root)", () => {
    expect(existsSync(DIST) && siteFiles.length > 0).toBe(true);
  });

  test("credits DHS and names the survey year", () => {
    expect(siteText).toContain("DHS");
    expect(siteText).toContain("survey_year");
  });

  test("has no analytics, tracking, advertising or data capture", () => {
    const found = TRACKING_PATTERNS
      .filter(([pattern]) => pattern.test(siteText))
      .map(([, label]) => label);
    expect(found).toEqual([]);
  });

  test("loads no external resource", () => {
    // The site must not talk to anything but its own files.
    const matches = [...siteText.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/g)]
      .map((m) => m[1])
      .filter((u) => !u.startsWith("http://localhost") && !u.startsWith("http://127."));
    expect([...new Set(matches)]).toEqual([]);
  });
});
