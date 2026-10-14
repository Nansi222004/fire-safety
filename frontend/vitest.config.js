import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Unit / component tests (jsdom). Browser end-to-end tests live in tests/e2e and run with Playwright.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@modules": path.resolve(__dirname, "./src/modules"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup/vitest.setup.js"],
    include: ["tests/unit/**/*.test.{js,jsx}"],
    css: false,
    restoreMocks: true,
  },
});
