import { copyFileSync, mkdirSync } from "fs";

export function copyWellKnown() {
  return {
    name: "copy-well-known",
    closeBundle() {
      mkdirSync("dist/client/.well-known", { recursive: true });
      copyFileSync(
        "public/.well-known/jwks.json",
        "dist/client/.well-known/jwks.json"
      );
    },
  };
}

