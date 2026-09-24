// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
//
// Static output (the default) is deliberate -- there is nothing here that needs
// a server. `src/pages/index.astro` reads pipeline/data/regions.json off disk
// at build time and inlines it; the only thing that runs after that is
// src/scripts/app.ts recomputing the cost comparison as the user types.
//
// compressHTML is off, and that is not a preference. Astro's compressor DELETES
// any run of whitespace that contains a newline, so prose wrapped across source
// lines loses the space at each wrap ("clears50.0%").
export default defineConfig({
  compressHTML: false,
});
