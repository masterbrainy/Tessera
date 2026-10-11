import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from GitHub Pages at /Tessera/; override with BASE=/ for other hosts.
export default defineConfig({
  base: process.env.BASE ?? "/Tessera/",
  plugins: [react()],
  worker: { format: "es" },
});
