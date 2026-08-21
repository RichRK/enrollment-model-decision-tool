/* Fail early and legibly when dist/ has not been built.
 *
 * Without this the missing build surfaces as 23 assertion failures against an
 * empty page, or as a webServer timeout -- neither of which says what to do.
 * check-data.test.js gives the same courtesy on the same condition.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export default function globalSetup(): void {
  const index = join(import.meta.dirname, "..", "dist", "index.html");
  if (!existsSync(index)) {
    throw new Error(
      "site/dist/index.html is missing -- these tests run against the production " +
      "build, not the dev server. Run `make build` from the repository root first.",
    );
  }
}
