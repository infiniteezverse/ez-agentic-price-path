import { defineConfig } from "@lovable.dev/vite-tanstack-config";
// @ts-ignore - copy-well-known.js is not typed
import { copyWellKnown } from "./scripts/copy-well-known.js";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      copyWellKnown(),
    ],
  },
});

