import { signEs256Jws } from "../../../src/lib/crypto/sign-es256";

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const receipt = await request.json();

    const privateKeyPem = env.PRIVATE_KEY;
    if (!privateKeyPem) {
      return new Response("Missing PRIVATE_KEY", { status: 500 });
    }

    const payload = {
      iss: "https://myezverse.xyz",
      iat: Math.floor(Date.now() / 1000),
      receipt,
    };

    const jws = signEs256Jws({
      header: {
        alg: "ES256",
        kid: "ezlabs-key-1",
        typ: "JWT",
      },
      payload,
      privateKeyPem,
    });

    return new Response(JSON.stringify({ signed_receipt: jws }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("x402 receipt handler error:", err);
    return new Response("Invalid receipt", { status: 400 });
  }
};
import { signEs256Jws } from "../../../src/lib/crypto/sign-es256";

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const receipt = await request.json();

    const privateKeyPem = env.PRIVATE_KEY;
    if (!privateKeyPem) {
      return new Response("Missing PRIVATE_KEY", { status: 500 });
    }

    const payload = {
      iss: "https://myezverse.xyz",
      iat: Math.floor(Date.now() / 1000),
      receipt,
    };

    const jws = signEs256Jws({
      header: {
        alg: "ES256",
        kid: "ezlabs-key-1",
        typ: "JWT",
      },
      payload,
      privateKeyPem,
    });

    return new Response(JSON.stringify({ signed_receipt: jws }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("x402 receipt handler error:", err);
    return new Response("Invalid receipt", { status: 400 });
  }
};
