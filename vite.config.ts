import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from GitHub Pages at /tessera/; override with BASE=/ for other hosts.
export default defineConfig({
  base: process.env.BASE ?? "/tessera/",
  plugins: [react()],
  worker: { format: "es" },
});
