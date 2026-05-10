import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/playground")({
  head: () => ({
    meta: [
      { title: "Playground — Agentic Liquidity API" },
      { name: "description", content: "Try the pay-per-quote DEX router live. Generate curl, TypeScript, and Python snippets." },
      { property: "og:title", content: "Playground — Agentic Liquidity API" },
      { property: "og:description", content: "Try the pay-per-quote DEX router live. No signup." },
    ],
  }),
  component: Playground,
});

type ChainId = 1 | 8453;
type SnippetLang = "curl" | "ts" | "py";

const TOKENS: Record<ChainId, Record<string, number>> = {
  1: { ETH: 18, WETH: 18, USDC: 6, USDT: 6, DAI: 18, WBTC: 8 },
  8453: { ETH: 18, WETH: 18, USDC: 6, DAI: 18 },
};

function toBaseUnits(amount: string, decimals: number): string {
  const trimmed = amount.trim();
  if (!trimmed || isNaN(Number(trimmed))) return "0";
  const [intPart, fracPartRaw = ""] = trimmed.split(".");
  const fracPart = (fracPartRaw + "0".repeat(decimals)).slice(0, decimals);
  const joined = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "");
  return joined || "0";
}

function Playground() {
  const [chainId, setChainId] = useState<ChainId>(8453);
  const [sellToken, setSellToken] = useState("WETH");
  const [buyToken, setBuyToken] = useState("USDC");
  const [amountHuman, setAmountHuman] = useState("1");
  const [receipt, setReceipt] = useState("");
  const [snippetLang, setSnippetLang] = useState<SnippetLang>("curl");

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string>("");
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<string>("");

  const tokenList = useMemo(() => Object.keys(TOKENS[chainId]), [chainId]);
  const sellDecimals = TOKENS[chainId][sellToken] ?? 18;
  const sellAmountBase = useMemo(
    () => toBaseUnits(amountHuman, sellDecimals),
    [amountHuman, sellDecimals],
  );

  const url = useMemo(() => {
    const params = new URLSearchParams({
      chainId: String(chainId),
      sellToken,
      buyToken,
      sellAmount: sellAmountBase,
    });
    return `/api/v1/quote?${params.toString()}`;
  }, [chainId, sellToken, buyToken, sellAmountBase]);

  const fullUrl = useMemo(() => {
    if (typeof window === "undefined") return url;
    return `${window.location.origin}${url}`;
  }, [url]);

  const snippets = useMemo<Record<SnippetLang, string>>(() => {
    const headerCurl = receipt ? ` \\\n  -H "X-Payment-Receipt: ${receipt}"` : "";
    const headerTs = receipt ? `, headers: { "X-Payment-Receipt": "${receipt}" }` : "";
    const headerPy = receipt ? `, headers={"X-Payment-Receipt": "${receipt}"}` : "";
    return {
      curl: `curl -sS "${fullUrl}"${headerCurl}`,
      ts: `const res = await fetch("${fullUrl}"${headerTs});\nconst data = await res.json();\nconsole.log(data);`,
      py: `import requests\nr = requests.get("${fullUrl}"${headerPy})\nprint(r.status_code, r.json())`,
    };
  }, [fullUrl, receipt]);

  async function runQuote() {
    setLoading(true);
    setResponse("");
    setStatusCode(null);
    setLatency(null);
    const started = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (receipt) headers["X-Payment-Receipt"] = receipt;
      const res = await fetch(url, { headers });
      const elapsed = Math.round(performance.now() - started);
      setStatusCode(res.status);
      setLatency(elapsed);
      const text = await res.text();
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
    } catch (err) {
      setResponse(`// Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState(label);
      setTimeout(() => setCopyState(""), 1200);
    } catch {
      /* ignore */
    }
  }

  const statusColor =
    statusCode == null
      ? "text-muted-foreground"
      : statusCode >= 200 && statusCode < 300
        ? "text-success"
        : statusCode === 402
          ? "text-warning"
          : "text-destructive";

  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/40">
              <span className="text-primary font-mono text-lg font-bold">⌬</span>
            </div>
            <div>
              <div className="font-mono text-sm font-semibold tracking-tight">agentic.liquidity</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">playground</div>
            </div>
          </Link>
          <div className="flex items-center gap-2 font-mono text-xs">
            <a href="/openapi.json" className="rounded-md border border-border bg-card/60 px-3 py-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary">/openapi.json</a>
            <a href="/api/mcp" className="rounded-md border border-border bg-card/60 px-3 py-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary">/api/mcp</a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 pb-20 pt-8">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-primary">// playground</div>
        <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Try the quote endpoint live.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          No signup. Edit params, hit <span className="font-mono text-foreground">Get Quote</span>,
          copy the snippet into your agent. Paste a payment receipt to unlock the full quote.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Form */}
          <section className="rounded-xl border border-border bg-card/70 p-5 lg:col-span-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">request</div>
            <div className="mt-4 space-y-4">
              <Field label="chain">
                <select
                  value={chainId}
                  onChange={(e) => {
                    const next = Number(e.target.value) as ChainId;
                    setChainId(next);
                    const list = Object.keys(TOKENS[next]);
                    if (!list.includes(sellToken)) setSellToken(list[0]);
                    if (!list.includes(buyToken)) setBuyToken(list[1] ?? list[0]);
                  }}
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-sm focus:border-primary/60 focus:outline-none"
                >
                  <option value={8453}>Base (8453)</option>
                  <option value={1}>Ethereum (1)</option>
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="sell token">
                  <TokenSelect tokens={tokenList} value={sellToken} onChange={setSellToken} />
                </Field>
                <Field label="buy token">
                  <TokenSelect tokens={tokenList} value={buyToken} onChange={setBuyToken} />
                </Field>
              </div>

              <Field label={`amount (${sellToken}, ${sellDecimals} decimals)`}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountHuman}
                  onChange={(e) => setAmountHuman(e.target.value)}
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-sm focus:border-primary/60 focus:outline-none"
                />
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">base units → {sellAmountBase}</div>
              </Field>

              <Field label="x-payment-receipt (optional, 0x… 64-hex)">
                <input
                  type="text"
                  value={receipt}
                  onChange={(e) => setReceipt(e.target.value.trim())}
                  placeholder="0x… USDC transfer tx hash"
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs focus:border-primary/60 focus:outline-none"
                />
              </Field>

              <button
                onClick={runQuote}
                disabled={loading}
                className="w-full rounded-md bg-primary px-4 py-2.5 font-mono text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "loading…" : "Get Quote →"}
              </button>
            </div>

            <div className="mt-6 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">snippet</div>
                <div className="flex gap-1">
                  {(["curl", "ts", "py"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSnippetLang(lang)}
                      className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
                        snippetLang === lang
                          ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
              <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
                {snippets[snippetLang]}
              </pre>
              <button
                onClick={() => copy(snippets[snippetLang], snippetLang)}
                className="mt-2 rounded-md border border-border bg-card/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:border-primary/60 hover:text-primary"
              >
                {copyState === snippetLang ? "copied ✓" : "copy"}
              </button>
            </div>
          </section>

          {/* Response */}
          <section className="rounded-xl border border-border bg-card/70 p-5 lg:col-span-7">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">response</div>
              <div className={`font-mono text-xs ${statusColor}`}>
                {statusCode != null ? `status ${statusCode}` : "—"}
                {latency != null ? ` · ${latency} ms` : ""}
              </div>
            </div>
            <pre className="mt-3 min-h-[420px] overflow-auto rounded-md border border-border bg-background/70 p-4 font-mono text-xs leading-relaxed text-foreground/90">
              {response || "// hit Get Quote to see the JSON response here"}
            </pre>
            <div className="mt-4 grid grid-cols-1 gap-2 font-mono text-[11px] text-muted-foreground sm:grid-cols-3">
              <a href="/openapi.json" className="rounded-md border border-border bg-background/40 px-3 py-2 hover:border-primary/60 hover:text-primary">openapi.json →</a>
              <a href="/api/mcp" className="rounded-md border border-border bg-background/40 px-3 py-2 hover:border-primary/60 hover:text-primary">mcp endpoint →</a>
              <a href="/.well-known/agent.json" className="rounded-md border border-border bg-background/40 px-3 py-2 hover:border-primary/60 hover:text-primary">agent card →</a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function TokenSelect({ tokens, value, onChange }: { tokens: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-sm focus:border-primary/60 focus:outline-none"
    >
      {tokens.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}
