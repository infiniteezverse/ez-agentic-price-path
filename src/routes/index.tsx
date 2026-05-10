import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getDashboardData } from "@/lib/dashboard.functions";
import { getRecentTolls, type FeedRow } from "@/lib/feed.functions";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

type FeedItem = {
  id: string;
  txHash: string;
  amount: string;
  chain: "Base" | "Ethereum";
  pair: string;
  ts: number;
  agent: string;
};

function rowToFeedItem(r: FeedRow): FeedItem {
  return {
    id: r.id,
    txHash: r.receipt_tx_hash ?? "0x",
    amount: (r.payment_amount_usdc ?? 0.05).toString(),
    chain: r.payment_chain === "ethereum" ? "Ethereum" : "Base",
    pair: r.pair,
    ts: new Date(r.created_at).getTime(),
    agent: r.payer_short ?? "anon",
  };
}

function Dashboard() {
  const fetcher = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetcher(),
    refetchInterval: 12_000,
  });

  // Real X402 toll feed from on-chain-verified, persisted call log
  const feedFetcher = useServerFn(getRecentTolls);
  const { data: feedData } = useQuery({
    queryKey: ["toll-feed"],
    queryFn: () => feedFetcher(),
    refetchInterval: 6_000,
  });
  const feed = useMemo<FeedItem[]>(
    () => (feedData?.rows ?? []).map(rowToFeedItem),
    [feedData],
  );

  const totalUnlocks = feedData?.total24h ?? 0;
  const wallet = data?.paymentWallet;

  return (
    <div className="min-h-screen text-foreground">
      <Header wallet={wallet} loading={isLoading} />
      <main className="mx-auto w-full max-w-7xl px-6 pb-20 pt-8">
        <Hero totalUnlocks={totalUnlocks} feedCount={feed.length} />

        <section className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <GasCard chain="Ethereum" data={data?.gas?.ethereum ?? null} accent="primary" />
          <GasCard chain="Base" data={data?.gas?.base ?? null} accent="accent" />
          <ApiSnippetCard />
        </section>

        <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <RoutesPanel routes={data?.routes ?? []} loading={isLoading} />
          <FeedPanel feed={feed} />
        </section>

        <X402Panel wallet={wallet} />

        <Footer />
      </main>
    </div>
  );
}

function Header({ wallet, loading }: { wallet?: string | null; loading: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/40">
            <span className="text-primary font-mono text-lg font-bold text-glow-primary">⌬</span>
          </div>
          <div>
            <div className="font-mono text-sm font-semibold tracking-tight">agentic.liquidity</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">x402 quote api · v1</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 md:flex">
            <span className={`relative inline-block h-1.5 w-1.5 rounded-full ${loading ? "bg-warning" : "bg-success"} pulse-dot text-success`} />
            <span className="font-mono text-xs text-muted-foreground">{loading ? "syncing" : "live · mainnet + base"}</span>
          </div>
          <a
            href="/playground"
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary hover:bg-primary/15"
          >
            playground →
          </a>
          <a
            href="/openapi.json"
            className="hidden rounded-md border border-border bg-card/60 px-3 py-1.5 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary md:inline-block"
          >
            /openapi.json
          </a>
          <a
            href="/.well-known/agent.json"
            className="hidden rounded-md border border-border bg-card/60 px-3 py-1.5 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary md:inline-block"
          >
            /.well-known/agent.json
          </a>
        </div>
      </div>
      {wallet && (
        <div className="border-t border-border/40 bg-card/30">
          <div className="mx-auto max-w-7xl px-6 py-1.5 font-mono text-[10px] text-muted-foreground">
            tollbooth wallet · <span className="text-foreground/80">{wallet}</span>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero({ totalUnlocks, feedCount }: { totalUnlocks: number; feedCount: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-primary">// agentic liquidity</div>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          A pay-per-quote DEX router <br />
          built for <span className="text-primary text-glow-primary">autonomous agents</span>.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          One HTTP endpoint. Best-execution across 0x liquidity sources on Ethereum and Base.
          Locked behind <span className="font-mono text-foreground">HTTP&nbsp;402</span> — agents pay
          a 0.05 USDC toll per unlock, no API keys, no accounts.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:col-span-4">
        <Stat label="unlocks · 24h" value={totalUnlocks.toLocaleString()} sub="paid quote requests" />
        <Stat label="live tolls" value={feedCount.toString()} sub="rolling window" accent />
        <Stat label="unlock fee" value="0.05" sub="USDC · base/eth" />
        <Stat label="chains" value="2" sub="ethereum · base" />
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-lg border ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card/60"} p-3`}>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${accent ? "text-primary text-glow-primary" : "text-foreground"}`}>{value}</div>
      <div className="font-mono text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function GasCard({ chain, data, accent }: { chain: string; data: { gwei: number; blockNumber: number } | null; accent: "primary" | "accent" }) {
  const color = accent === "primary" ? "text-primary" : "text-accent";
  const ring = accent === "primary" ? "ring-primary/30" : "ring-accent/30";
  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-card/70 p-5 lg:col-span-3 ring-1 ${ring}`}>
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">gas · {chain.toLowerCase()}</div>
        <span className={`pulse-dot inline-block h-1.5 w-1.5 rounded-full ${accent === "primary" ? "bg-primary text-primary" : "bg-accent text-accent"}`} />
      </div>
      <div className={`mt-3 font-mono text-3xl font-semibold ${color}`}>
        {data ? data.gwei.toFixed(2) : "—"}<span className="ml-1 text-sm font-normal text-muted-foreground">gwei</span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-muted-foreground">
        block #{data ? data.blockNumber.toLocaleString() : "—"}
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full ${accent === "primary" ? "bg-primary" : "bg-accent"}`}
          style={{ width: `${Math.min(100, (data?.gwei ?? 0) * 2)}%` }}
        />
      </div>
    </div>
  );
}

function ApiSnippetCard() {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-5 lg:col-span-6">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">try it · curl</div>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
          HTTP 402 · X402
        </span>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
{`curl "/api/v1/quote?sellToken=WETH&buyToken=USDC&sellAmount=1000000000000000000&chainId=8453"
# → 402 Payment Required (preview JSON + payment instructions)

curl -H "X-Payment-Receipt: 0x<txhash>" \\
  "/api/v1/quote?sellToken=WETH&buyToken=USDC&sellAmount=1000000000000000000&chainId=8453"
# → 200 OK (full 0x route, gas, sources)`}
      </pre>
    </div>
  );
}

function RoutesPanel({ routes, loading }: { routes: any[]; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 lg:col-span-7">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">top liquidity routes · 0x</div>
          <div className="text-sm font-medium">Best-execution by pair</div>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">refresh · 12s</span>
      </div>
      <div className="divide-y divide-border/60">
        {(loading && routes.length === 0) && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex animate-pulse items-center justify-between px-5 py-3">
            <div className="h-3 w-32 rounded bg-secondary" />
            <div className="h-3 w-20 rounded bg-secondary" />
          </div>
        ))}
        {routes.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-secondary/30">
            <div className="flex items-center gap-3">
              <span className={`rounded px-2 py-0.5 font-mono text-[10px] ${r.chain === "Base" ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}`}>
                {r.chain}
              </span>
              <span className="font-mono text-sm">{r.pair}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-1.5 md:flex">
                {r.sources.slice(0, 3).map((s: any, j: number) => (
                  <span key={j} className="rounded-full border border-border bg-background/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {s.name} · {(Number(s.proportion) * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
              <div className="text-right">
                <div className="font-mono text-sm">{Number(r.price).toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{r.topSource}</div>
              </div>
            </div>
          </div>
        ))}
        {!loading && routes.length === 0 && (
          <div className="px-5 py-8 text-center font-mono text-sm text-muted-foreground">
            No live routes — check ZEROX_API_KEY.
          </div>
        )}
      </div>
    </div>
  );
}

function FeedPanel({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 lg:col-span-5">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">live toll feed · x402</div>
          <div className="text-sm font-medium">Recent micro-payments</div>
        </div>
        <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-success text-success" />
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {feed.length === 0 && (
          <div className="px-5 py-10 text-center font-mono text-xs text-muted-foreground">
            No verified tolls yet — first on-chain X402 unlock will appear here.
          </div>
        )}
        {feed.map((f) => (
          <div key={f.id} className="animate-feed-in border-b border-border/40 px-5 py-2.5 last:border-b-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${f.chain === "Base" ? "bg-accent" : "bg-primary"}`} />
                <span className="font-mono text-xs">{f.agent}</span>
                <span className="font-mono text-[10px] text-muted-foreground">paid for</span>
                <span className="font-mono text-xs text-foreground">{f.pair}</span>
              </div>
              <div className="font-mono text-xs text-success">+{f.amount} USDC</div>
            </div>
            <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span className="truncate">{f.txHash.slice(0, 18)}…{f.txHash.slice(-6)}</span>
              <span>{timeAgo(f.ts)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function X402Panel({ wallet }: { wallet?: string | null }) {
  return (
    <section className="mt-5 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="font-mono text-[10px] uppercase tracking-widest text-primary">x402 protocol</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Pay-per-call, not per-month.</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Every quote request without a valid <code className="rounded bg-card px-1 py-0.5 font-mono text-xs">X-Payment-Receipt</code> header
            returns <span className="font-mono text-foreground">HTTP 402</span> with a preview body and on-chain payment instructions.
            Resend with the receipt to unlock the full quote.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Tag>0.05 USDC / unlock</Tag>
            <Tag>Base · Ethereum</Tag>
            <Tag>No accounts</Tag>
            <Tag>Agent-discoverable</Tag>
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="rounded-lg border border-border bg-background/60 p-4 font-mono text-xs">
            <div className="text-muted-foreground">// 402 response · preview body</div>
            <pre className="mt-2 leading-relaxed text-foreground/90">{`{
  "estimated_savings_usd": "12.40",
  "status": "Locked",
  "unlock_fee": "0.05 USDC",
  "payment": {
    "scheme": "x402",
    "payTo": "${wallet ? wallet.slice(0, 10) + "…" : "0x…"}",
    "asset": "USDC",
    "networks": ["base", "ethereum"]
  }
}`}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-card/70 px-3 py-1 font-mono text-[11px] text-foreground/80">
      {children}
    </span>
  );
}

function Footer() {
  return (
    <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 font-mono text-[11px] text-muted-foreground">
      <span>© agentic.liquidity · powered by 0x aggregator</span>
      <div className="flex gap-4">
        <a href="/api/v1/quote?sellToken=WETH&buyToken=USDC&sellAmount=1000000000000000000&chainId=8453" className="hover:text-primary">/api/v1/quote</a>
        <a href="/.well-known/agent.json" className="hover:text-primary">/.well-known/agent.json</a>
      </div>
    </footer>
  );
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

