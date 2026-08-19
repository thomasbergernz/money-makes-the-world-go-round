import { execSync } from "node:child_process";
import { defineConfig } from "vite";

/**
 * A token that changes exactly once per deploy, appended to every dataset
 * fetch.
 *
 * The JS and CSS bundles carry content hashes in their filenames, so a new
 * build invalidates them automatically. The CSVs do not — they are static
 * files at stable URLs, so a returning visitor keeps seeing whatever their
 * browser cached until it expires. Stamping the build into the query string
 * gives them the same guarantee: cached hard between deploys, refetched once
 * when a deploy changes the stamp.
 *
 * A timestamp would also work but would bust on every build, including local
 * rebuilds where nothing changed. The commit is what actually identifies the
 * data.
 */
function buildStamp() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 8);
  try {
    return execSync("git rev-parse --short=8 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  // Relative base so the built site works from a GitHub Pages subpath.
  base: "./",
  // CSVs live in public/data/ and are copied verbatim into the build.
  publicDir: "public",
  build: { outDir: "dist" },
  define: { __DATA_VERSION__: JSON.stringify(buildStamp()) },
  test: { environment: "node" },
});
