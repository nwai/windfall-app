import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      babel: {
        compact: false,
      },
    }),
  ],
  // Allow JSX in .js during dependency scanning (if any .js contain JSX)
  optimizeDeps: {
    esbuildOptions: {
      loader: { ".js": "jsx" }
    }
  }
});
