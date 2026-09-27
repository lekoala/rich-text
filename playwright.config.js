import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.spec.js",
  timeout: 10_000,
  expect: { timeout: 3_000 },
  fullyParallel: true,
  workers: 4,
  reporter: "list",
  webServer: {
    command: "node test/server.js",
    port: 4174,
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://127.0.0.1:4174",
    headless: true,
    trace: {
      mode: "retain-on-failure",
      snapshots: { dom: true, aria: true, screen: true },
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
