import { defineConfig, devices } from "@playwright/test";

// Browser end-to-end tests for every portal (storefront, customer, vendor, admin, delivery, inspector).
// Playwright starts two servers:
//   • the real API on :5055 backed by a seeded in-memory MongoDB (backend/tests/e2e-server/start.mjs)
//   • the Vite dev server on :5174 pointed at that API
// Nothing touches the database or services configured in your .env files.
const API_PORT = 5055;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: "./tests/e2e",
  // One shared seeded backend: run specs one at a time so they never race on the same data.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The delivery app asks for geolocation; grant it so no permission prompt blocks the page.
    permissions: ["geolocation"],
    geolocation: { latitude: 22.7196, longitude: 75.8577 },
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: [
    {
      command: "node tests/e2e-server/start.mjs",
      cwd: "../backend",
      url: `http://localhost:${API_PORT}/health`,
      env: { E2E_API_PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_API_BASE_URL: `http://localhost:${API_PORT}/api` },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
