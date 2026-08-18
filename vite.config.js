import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built site works from a GitHub Pages subpath.
  base: "./",
  // CSVs live in public/data/ and are copied verbatim into the build.
  publicDir: "public",
  build: { outDir: "dist" },
  test: { environment: "node" },
});
