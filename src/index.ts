import { handleQuote } from "./quote-router";
import { AGENT_JSON, BITTE_AI_PLUGIN_JSON, OPENAPI_JSON, WELL_KNOWN_AGENT_JSON, EZPATH_MANIFEST_JSONLD } from "./discovery";
import { LLMS_MD } from "./llms";
import { LANDING_HTML } from "./landing";
import { OG_WEBP_B64 } from "./og";
import { handleETL } from "./etl";

declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: Array<{ name: string }>; cursor: string }>;
  }
  interface ExecutionContext {
    waitUntil(promise: Promise<any>): void;
  }
  interface ScheduledEvent {
    cron: string;
    noRetry(): void;
  }
}

interface Env {
  ZERO_EX_API_KEY: string;
  PARASWAP_API_KEY?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  METERING: KVNamespace;
  RELAYER_PRIVATE_KEY?: string;
  ADMIN_API_KEY?: string;
  BASE_RPC_URL?: string;
  CDP_FACILITATOR_URL?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function corsify(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err);
      console.error("[unhandled]", msg);
      return corsify(Response.json({ status: "internal_error", detail: msg }, { status: 500 }));
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const result = await handleETL(env, { waitUntil: (p: Promise<void>) => ctx.waitUntil(p) });
    console.log(`[scheduled] ETL pipeline completed:`, result);
  },
};

export async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);

  // ── GET|HEAD / — human landing page
  if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
    const response = new Response(request.method === "HEAD" ? null : LANDING_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    return corsify(response);
  }

  // ── GET|POST|PUT /api/v1/quote — Delegate to unified router
  if (url.pathname === "/api/v1/quote" && (request.method === "GET" || request.method === "POST" || request.method === "PUT")) {
    try {
      return corsify(await handleQuote(request, env, ctx));
    } catch (err) {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error("[index.ts] handleQuote error:", detail);
      return corsify(Response.json({ status: "handler_error", detail, error_source: "quote_handler" }, { status: 500 }));
    }
  }

  // ── Facilitator endpoints (Bazaar indexing support)
  if (url.pathname === "/facilitator/supported" && request.method === "GET") {
    return corsify(
      Response.json({
        kinds: [
          {
            x402Version: 1,
            scheme: "exact",
            network: "base",
            networkId: "eip155:8453",
          },
          {
            x402Version: 1,
            scheme: "exact",
            network: "arbitrum",
            networkId: "eip155:42161",
          },
          {
            x402Version: 1,
            scheme: "exact",
            network: "optimism",
            networkId: "eip155:10",
          },
          {
            x402Version: 1,
            scheme: "exact",
            network: "polygon",
            networkId: "eip155:137",
          },
        ],
      })
    );
  }

  if (url.pathname === "/facilitator/verify" && request.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return corsify(Response.json({ isValid: false, invalidReason: "bad_request" }, { status: 400 }));
    }

    const paymentPayload = body.paymentPayload as Record<string, unknown> | undefined;
    if (!paymentPayload) {
      return corsify(Response.json({ isValid: false, invalidReason: "missing_payment_payload" }, { status: 400 }));
    }

    // Delegate to router for verification (reuse same logic)
    // For now, return a placeholder that the router will handle in future iterations
    return corsify(Response.json({ isValid: false, invalidReason: "not_yet_implemented" }));
  }

  if (url.pathname === "/facilitator/settle" && request.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return corsify(Response.json({ success: false, error: "bad_request" }, { status: 400 }));
    }

    const paymentPayload = body.paymentPayload as Record<string, unknown> | undefined;
    if (!paymentPayload) {
      return corsify(Response.json({ success: false, error: "missing_payment_payload" }, { status: 400 }));
    }

    // Delegate to router for settlement
    return corsify(Response.json({ success: false, error: "not_yet_implemented" }, { status: 501 }));
  }

  // ── Discovery endpoints
  if (url.pathname === "/.well-known/agent.json" && request.method === "GET") {
    return corsify(Response.json(WELL_KNOWN_AGENT_JSON));
  }

  if (url.pathname === "/agent.json" && request.method === "GET") {
    return corsify(Response.json(AGENT_JSON));
  }

  if (url.pathname === "/openapi.json" && request.method === "GET") {
    return corsify(Response.json(OPENAPI_JSON));
  }

  if (url.pathname === "/.well-known/ai-plugin.json" && request.method === "GET") {
    return corsify(Response.json(BITTE_AI_PLUGIN_JSON));
  }

  if (url.pathname === "/.well-known/ezpath-manifest.json" && request.method === "GET") {
    return corsify(Response.json(EZPATH_MANIFEST_JSONLD, { headers: { "Content-Type": "application/ld+json" } }));
  }

  if (url.pathname === "/llms.md" && request.method === "GET") {
    return corsify(new Response(LLMS_MD, { headers: { "Content-Type": "text/markdown; charset=utf-8" } }));
  }

  // ── Crawler / browser housekeeping
  if (url.pathname === "/robots.txt") {
    return new Response("User-agent: *\nAllow: /\nSitemap: https://ezpath.myezverse.xyz/sitemap.xml\n", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (url.pathname === "/sitemap.xml") {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://ezpath.myezverse.xyz/</loc></url>
  <url><loc>https://ezpath.myezverse.xyz/.well-known/agent.json</loc></url>
  <url><loc>https://ezpath.myezverse.xyz/openapi.json</loc></url>
</urlset>`,
      { headers: { "Content-Type": "application/xml" } }
    );
  }

  // ── Fetch.ai uAgents chat protocol endpoint
  if (url.pathname === "/submit" && request.method === "POST") {
    try {
      const envelope = (await request.json()) as {
        version: number;
        sender: string;
        target: string;
        session: string;
        schema_digest: string;
        payload?: string;
      };

      let messageText = "";
      if (envelope.payload) {
        try {
          const decoded = JSON.parse(atob(envelope.payload)) as {
            content?: Array<{ type: string; text?: string }>;
            msg_id?: string;
          };
          messageText = decoded.content?.filter(c => c.type === "text").map(c => c.text ?? "").join(" ") ?? "";
        } catch {
          messageText = "";
        }
      }

      const msgId = crypto.randomUUID();
      const now = new Date().toISOString();

      const responseText = messageText.trim()
        ? [
            "EZ-Path DEX Meta-Router on Base mainnet.",
            "",
            "I race 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) to return the best swap quote.",
            "Payment is per-request via X402 USDC (no API key, no subscription).",
            "",
            "Execution tiers:",
            "  basic         $0.03 - direct 0x route",
            "  resilient     $0.10 - dual-lane race (0x/ParaSwap vs Aerodrome)",
            "  institutional $0.50 - race + Uniswap V3 safety net",
            "",
            "To get a quote, call GET https://ezpath.myezverse.xyz/api/v1/quote",
            "  ?sellToken=<address>&buyToken=<address>&sellAmount=<atomic>",
            "",
            "Full docs: https://ezpath.myezverse.xyz",
          ].join("\n")
        : "EZ-Path ready. Send a swap query to get started.";

      const responseJson = JSON.stringify({
        timestamp: now,
        msg_id: msgId,
        content: [{ type: "text", text: responseText }, { type: "end-session" }],
      });
      const responsePayload = btoa(String.fromCharCode(...new TextEncoder().encode(responseJson)));

      const responseEnvelope = {
        version: 1,
        sender: "agent1qdwrzdmt8kfhenk38u00wsg897ztm8mgwg68wn3d2gsqw0ftp04222e47wt",
        target: envelope.sender,
        session: envelope.session,
        schema_digest: envelope.schema_digest,
        payload: responsePayload,
        expires: Math.floor(Date.now() / 1000) + 300,
      };

      return corsify(Response.json(responseEnvelope));
    } catch (err) {
      return corsify(
        Response.json(
          { error: "invalid envelope", detail: err instanceof Error ? err.message : String(err) },
          { status: 400 }
        )
      );
    }
  }

  // ── Static assets
  if (url.pathname === "/og.png" || url.pathname === "/og.webp") {
    const bytes = Uint8Array.from(atob(OG_WEBP_B64), c => c.charCodeAt(0));
    return new Response(bytes, {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=2592000" },
    });
  }

  if (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg") {
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0d1117"/>
  <text x="4" y="23" font-family="monospace" font-size="18" font-weight="bold" fill="#3fb950">EZ</text>
</svg>`,
      { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } }
    );
  }

  // ── Admin analytics endpoint
  if (url.pathname === "/admin/analytics" && request.method === "GET") {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!env.ADMIN_API_KEY || token !== env.ADMIN_API_KEY) {
      return new Response(JSON.stringify({ status: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const fromDate = url.searchParams.get("from") ?? today;
    const toDate = url.searchParams.get("to") ?? today;

    const dates: string[] = [];
    const cursor = new Date(fromDate);
    const end = new Date(toDate);
    while (cursor <= end) {
      dates.push(cursor.toISOString().split("T")[0]);
      cursor.setDate(cursor.getDate() + 1);
    }

    const perDay: Record<string, any> = {};
    let totalRequests = 0;
    let totalRevenueAtomic = 0;

    await Promise.all(
      dates.map(async (date: string) => {
        const { keys } = await env.METERING.list({ prefix: `usage:` });
        const dayKeys = keys.filter((k: any) => k.name.endsWith(`:${date}`));

        const dayRequests = (perDay[date] ??= { requests: 0, revenue_atomic: 0, payers: {} });

        await Promise.all(
          dayKeys.map(async (k: any) => {
            const payer = k.name.split(":")[2]; // usage:${chain}:${payer}:${date}
            const usageVal = parseInt((await env.METERING.get(k.name)) ?? "0");
            const revVal = parseInt((await env.METERING.get(`revenue:${k.name.split(":").slice(1, 3).join(":")}:${date}`)) ?? "0");

            dayRequests.requests += usageVal;
            dayRequests.revenue_atomic += revVal;
            dayRequests.payers[payer] ??= { requests: 0, revenue_atomic: 0 };
            dayRequests.payers[payer].requests += usageVal;
            dayRequests.payers[payer].revenue_atomic += revVal;
            totalRequests += usageVal;
            totalRevenueAtomic += revVal;
          })
        );
      })
    );

    return new Response(
      JSON.stringify(
        {
          from: fromDate,
          to: toDate,
          total: {
            requests: totalRequests,
            revenue_atomic: totalRevenueAtomic,
            revenue_usdc: (totalRevenueAtomic / 1000000).toFixed(6),
          },
          by_day: Object.fromEntries(
            Object.entries(perDay)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, d]) => [
                date,
                {
                  requests: d.requests,
                  revenue_atomic: d.revenue_atomic,
                  revenue_usdc: (d.revenue_atomic / 1000000).toFixed(6),
                  top_payers: Object.entries(d.payers)
                    .sort(([, a]: any, [, b]: any) => b.revenue_atomic - a.revenue_atomic)
                    .slice(0, 10)
                    .map(([payer, s]: any) => ({
                      payer,
                      requests: s.requests,
                      revenue_usdc: (s.revenue_atomic / 1000000).toFixed(6),
                    })),
                },
              ])
          ),
        },
        null,
        2
      ),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Metrics API Endpoints (dashboard support)

  // GET /api/v1/metrics/operator/:chain/:date
  if (url.pathname.match(/^\/api\/v1\/metrics\/operator\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/) && request.method === "GET") {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!env.ADMIN_API_KEY || token !== env.ADMIN_API_KEY) {
      return corsify(new Response(JSON.stringify({ status: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }));
    }

    const match = url.pathname.match(/^\/api\/v1\/metrics\/operator\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/);
    const chain = match?.[1] as any;
    const date = match?.[2];

    const key = `metrics:operator:${chain}:${date}`;
    const data = await env.METERING.get(key);

    return corsify(Response.json(data ? JSON.parse(data) : { request_count: 0 }));
  }

  // GET /api/v1/metrics/operator/venue/:chain/:venue/:date
  if (url.pathname.match(/^\/api\/v1\/metrics\/operator\/venue\/([^/]+)\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/) && request.method === "GET") {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!env.ADMIN_API_KEY || token !== env.ADMIN_API_KEY) {
      return corsify(new Response(JSON.stringify({ status: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }));
    }

    const match = url.pathname.match(/^\/api\/v1\/metrics\/operator\/venue\/([^/]+)\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/);
    const chain = match?.[1];
    const venue = match?.[2];
    const date = match?.[3];

    const key = `metrics:operator:venue:${chain}:${venue}:${date}`;
    const data = await env.METERING.get(key);

    return corsify(Response.json(data ? JSON.parse(data) : { request_count: 0 }));
  }

  // GET /api/v1/metrics/agent/:chain/:payer/:date
  if (url.pathname.match(/^\/api\/v1\/metrics\/agent\/([^/]+)\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/) && request.method === "GET") {
    const match = url.pathname.match(/^\/api\/v1\/metrics\/agent\/([^/]+)\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/);
    const chain = match?.[1];
    const payer = match?.[2];
    const date = match?.[3];

    // TODO: Add authentication to verify payer can only access own metrics
    // For now, require ADMIN_API_KEY
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!env.ADMIN_API_KEY || token !== env.ADMIN_API_KEY) {
      return corsify(new Response(JSON.stringify({ status: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }));
    }

    const key = `metrics:agent:${chain}:${payer}:${date}`;
    const data = await env.METERING.get(key);

    return corsify(Response.json(data ? JSON.parse(data) : { request_count: 0 }));
  }

  // ── POST /admin/etl — Manual ETL trigger (for testing)
  if (url.pathname === "/admin/etl" && request.method === "POST") {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!env.ADMIN_API_KEY || token !== env.ADMIN_API_KEY) {
      return new Response(JSON.stringify({ status: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Run ETL pipeline (non-blocking for fetch, but blocking for this response)
    const result = await handleETL(env);
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return corsify(new Response("Not Found", { status: 404 }));
}
