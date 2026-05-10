import { defineConfig } from "@lovable.dev/vite-tanstack-config";
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

