// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
//
// Static output (the default) is deliberate -- there is nothing here that needs
// a server. `src/pages/index.astro` reads pipeline/data/regions.json off disk
// at build time and inlines it; the only thing that runs after that is
// src/scripts/app.ts recomputing the cost comparison as the user types.
//
// compressHTML is off, and that is not a preference. Astro's compressor does not
// collapse inter-element whitespace the way HTML does -- it DELETES any run of
// whitespace that contains a newline. Prose written across several source lines
// therefore loses the space at each wrap, which shipped "clears50.0%" and
// "&middot;23 DHS 2021 survey regions" on the first build of the v2 page. The
// alternative is scattering {" "} through every component and remembering to do
// it forever; the saving was a few hundred bytes against a page that inlines a
// 1.2 MB JSON payload.
export default defineConfig({
  compressHTML: false,
});
