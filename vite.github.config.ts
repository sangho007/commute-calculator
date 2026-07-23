import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  root: "github-pages",
  publicDir: "../public",
  build: {
    emptyOutDir: true,
    outDir: "../dist-github",
  },
});
