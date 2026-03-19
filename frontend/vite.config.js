import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
  server: {
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
  build: {
    // Each build gets unique hashed filenames — browsers always fetch fresh JS/CSS
    // The only file without a hash is index.html, handled by rollupOptions below
    rollupOptions: {
      output: {
        // Ensure assets always have content hashes in filenames
        entryFileNames:  "assets/[name]-[hash].js",
        chunkFileNames:  "assets/[name]-[hash].js",
        assetFileNames:  "assets/[name]-[hash][extname]",
      },
    },
  },
});
