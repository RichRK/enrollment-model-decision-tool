// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
//
// Static output (the default) is deliberate -- there is nothing here that needs
// a server. `src/pages/index.astro` reads pipeline/data/regions.json off disk
// at build time and inlines it; the only thing that runs after that is the
// existing client-side app.js recomputing the cost comparison as the user types.
export default defineConfig({});
