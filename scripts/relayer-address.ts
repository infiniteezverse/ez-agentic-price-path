import { privateKeyToAccount } from "viem/accounts";
const vars = require("fs").readFileSync(".dev.vars", "utf8");
const match = vars.match(/RELAYER_PRIVATE_KEY=(.+)/);
if (match) {
  const key = match[1].trim();
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
  console.log("Relayer address:", account.address);
} else {
  console.log("RELAYER_PRIVATE_KEY not in .dev.vars");
}
