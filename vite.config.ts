import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // The background remover's worker imports transformers.js, which needs ES module workers.
  worker: { format: "es" },
});
