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
import { signEs256Jws } from "../../../src/lib/crypto/sign-es256";

export const onRequestPost: PagesFunction = async ({ request, env, ctx }) => {
  const start = Date.now();

  try {
    const receipt = await request.json();

    // Log the incoming request
    console.log(
      JSON.stringify({
        event: "x402.receipt.request",
        timestamp: new Date().toISOString(),
        receipt,
      })
    );

    const privateKeyPem = env.PRIVATE_KEY;
    if (!privateKeyPem) {
      console.error(
        JSON.stringify({
          event: "x402.receipt.error",
          error: "Missing PRIVATE_KEY",
        })
      );
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

    // Log the successful signing
    ctx.waitUntil(
      Promise.resolve(
        console.log(
          JSON.stringify({
            event: "x402.receipt.signed",
            timestamp: new Date().toISOString(),
            duration_ms: Date.now() - start,
            receipt_id: receipt.receipt_id,
            signer: "ezlabs-key-1",
          })
        )
      )
    );

    return new Response(JSON.stringify({ signed_receipt: jws }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(
      JSON.stringify({
        event: "x402.receipt.exception",
        timestamp: new Date().toISOString(),
        error: err?.message ?? String(err),
      })
    );

    return new Response("Invalid receipt", { status: 400 });
  }
};
