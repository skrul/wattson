import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["xstate/**", "node_modules/**", "test-server/**"],
  },
});
