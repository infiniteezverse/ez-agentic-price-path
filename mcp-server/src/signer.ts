import { privateKeyToAccount } from "viem/accounts";

const USDC_BASE    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad";

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from",        type: "address" },
    { name: "to",          type: "address" },
    { name: "value",       type: "uint256" },
    { name: "validAfter",  type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce",       type: "bytes32" },
  ],
} as const;

export async function buildXPaymentHeader(privateKey: string, value: bigint): Promise<string> {
  const key     = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(key);

  const nonceBytes  = crypto.getRandomValues(new Uint8Array(32));
  const nonce       = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
  const validAfter  = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300); // 5-minute window

  const signature = await account.signTypedData({
    domain: {
      name:              "USD Coin",
      version:           "2",
      chainId:           8453,
      verifyingContract: USDC_BASE as `0x${string}`,
    },
    types:       EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from:        account.address,
      to:          TOLL_ADDRESS as `0x${string}`,
      value,
      validAfter,
      validBefore,
      nonce,
    },
  });

  const payload = {
    payload: {
      authorization: {
        from:        account.address,
        to:          TOLL_ADDRESS,
        value:       value.toString(),
        validAfter:  validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
      signature,
    },
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
