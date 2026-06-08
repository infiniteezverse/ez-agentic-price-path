import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HubPage,
});

function HubPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HUB_STYLES }} />
      <div dangerouslySetInnerHTML={{ __html: HUB_CONTENT }} />
    </>
  );
}

const HUB_STYLES = `
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
    background: linear-gradient(135deg, #f3f0ff 0%, #fef5ff 100%);
    min-height: 100vh;
    padding: 40px 20px;
}

.container {
    max-width: 1000px;
    margin: 0 auto;
}

header {
    text-align: center;
    margin-bottom: 60px;
}

h1 {
    font-size: 48px;
    font-weight: 800;
    margin-bottom: 15px;
    color: #000;
}

.subtitle {
    font-size: 20px;
    color: #666;
    margin-bottom: 30px;
}

.badge {
    display: inline-block;
    background: #7c3aed;
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 20px;
}

.hub-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    margin-bottom: 60px;
}

.hub-card {
    background: white;
    border-radius: 12px;
    padding: 30px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
    border: 2px solid transparent;
    transition: all 0.3s;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
}

.hub-card:hover {
    border-color: #7c3aed;
    box-shadow: 0 10px 20px rgba(124, 58, 237, 0.15);
    transform: translateY(-4px);
}

.hub-card h3 {
    font-size: 24px;
    margin-bottom: 10px;
    color: #000;
}

.hub-card .label {
    font-size: 12px;
    text-transform: uppercase;
    color: #7c3aed;
    font-weight: 600;
    margin-bottom: 15px;
    letter-spacing: 0.5px;
}

.hub-card p {
    font-size: 14px;
    color: #666;
    margin-bottom: 20px;
    flex-grow: 1;
}

.hub-card .url {
    font-family: 'Monaco', monospace;
    font-size: 12px;
    background: #f9fafb;
    padding: 10px;
    border-radius: 6px;
    color: #666;
    word-break: break-all;
}

.status-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    margin-top: 10px;
    width: fit-content;
}

.status-live {
    background: #d1fae5;
    color: #065f46;
}

footer {
    text-align: center;
    color: #999;
    font-size: 14px;
    border-top: 1px solid #ddd;
    padding-top: 30px;
}

.feature-list {
    background: white;
    border-radius: 12px;
    padding: 30px;
    margin-bottom: 40px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
}

.feature-list h2 {
    font-size: 24px;
    margin-bottom: 20px;
    color: #000;
}

.features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
}

.feature {
    display: flex;
    gap: 12px;
}

.feature-icon {
    font-size: 20px;
    flex-shrink: 0;
}

.feature-text {
    font-size: 14px;
    color: #666;
}

.feature-text strong {
    color: #000;
    display: block;
    margin-bottom: 4px;
}

h2 {
    font-size: 32px;
    margin: 30px 0;
    text-align: center;
    color: #000;
}
`;

const HUB_CONTENT = `
<div class="container">
    <header>
        <div class="badge">✓ Live · Production Ready</div>
        <h1>EZ-Path</h1>
        <p class="subtitle">DEX meta-router for autonomous agents on Base</p>
    </header>

    <div class="feature-list">
        <h2>What is EZ-Path?</h2>
        <div class="features">
            <div class="feature">
                <div class="feature-icon">🏎️</div>
                <div class="feature-text">
                    <strong>10-Venue Racing</strong>
                    Simultaneously queries 0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, and Synthetix
                </div>
            </div>
            <div class="feature">
                <div class="feature-icon">💰</div>
                <div class="feature-text">
                    <strong>Best Price Guaranteed</strong>
                    Returns the highest buyAmount across all venues in 195-280ms
                </div>
            </div>
            <div class="feature">
                <div class="feature-icon">🔐</div>
                <div class="feature-text">
                    <strong>X402 Micro-Payments</strong>
                    EIP-3009 USDC signing. No API keys. No subscriptions. Fully cryptographic.
                </div>
            </div>
            <div class="feature">
                <div class="feature-icon">📍</div>
                <div class="feature-text">
                    <strong>Agent Native</strong>
                    Discoverable via .well-known/agent.json and OpenAPI 3.1 schema
                </div>
            </div>
            <div class="feature">
                <div class="feature-icon">💸</div>
                <div class="feature-text">
                    <strong>Three Tiers</strong>
                    Basic ($0.03), Resilient ($0.10), Institutional ($0.50)
                </div>
            </div>
            <div class="feature">
                <div class="feature-icon">⚡</div>
                <div class="feature-text">
                    <strong>Zero Gas Overhead</strong>
                    Relayer absorbs settlement costs. Agents only pay the quote fee.
                </div>
            </div>
        </div>
    </div>

    <h2>Four Ways to Access EZ-Path</h2>

    <div class="hub-grid">
        <a href="https://monad.myezverse.xyz/" class="hub-card">
            <div class="label">📖 Product Overview</div>
            <h3>monad.myezverse.xyz</h3>
            <p>Marketing landing page. Explains the product, problem & solution, integration methods, and pricing.</p>
            <div class="url">monad.myezverse.xyz</div>
            <div class="status-badge status-live">✓ Live</div>
        </a>

        <a href="https://api.myezverse.xyz/" class="hub-card">
            <div class="label">⚙️ Technical API Docs</div>
            <h3>api.myezverse.xyz</h3>
            <p>Full API reference with interactive quote form, curl examples, OpenAPI spec, and agent manifest.</p>
            <div class="url">api.myezverse.xyz/api/v1/quote</div>
            <div class="status-badge status-live">✓ Live</div>
        </a>

        <a href="https://github.com/infiniteezverse/ez-agentic-price-path" class="hub-card">
            <div class="label">📚 Core Repository</div>
            <h3>ez-agentic-price-path</h3>
            <p>Main source code, documentation, and integration examples. Open source (BSD-2-Clause).</p>
            <div class="url">github.com/infiniteezverse/ez-agentic-price-path</div>
            <div class="status-badge status-live">✓ Live</div>
        </a>

        <a href="https://github.com/infiniteezverse/monskills-ezpath" class="hub-card">
            <div class="label">📦 Integrations</div>
            <h3>monskills-ezpath</h3>
            <p>TypeScript npm package for MONSKILLS agents and other frameworks. MIT licensed.</p>
            <div class="url">npm install @infiniteezverse/monskills-ezpath</div>
            <div class="status-badge status-live">✓ Live</div>
        </a>
    </div>

    <div class="feature-list">
        <h2>Agent Discovery</h2>
        <div class="features">
            <div class="feature">
                <div class="feature-icon">🔗</div>
                <div class="feature-text">
                    <strong>Agent Manifest</strong>
                    <code style="font-size: 12px;">https://api.myezverse.xyz/.well-known/agent.json</code>
                </div>
            </div>
            <div class="feature">
                <div class="feature-icon">📄</div>
                <div class="feature-text">
                    <strong>OpenAPI Schema</strong>
                    <code style="font-size: 12px;">https://api.myezverse.xyz/openapi.json</code>
                </div>
            </div>
            <div class="feature">
                <div class="feature-icon">🏪</div>
                <div class="feature-text">
                    <strong>Agent Registries</strong>
                    MONSKILLS, AgentX, Agentic Ecosystems
                </div>
            </div>
            <div class="feature">
                <div class="feature-icon">⚡</div>
                <div class="feature-text">
                    <strong>X402 Protocol</strong>
                    EIP-3009 micro-payments, no API keys, fully cryptographic
                </div>
            </div>
        </div>
    </div>

    <footer>
        <p>EZ-Path by infiniteezverse · X402 Protocol · Base Mainnet (8453)</p>
        <p style="margin-top: 10px; font-size: 12px;">USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</p>
    </footer>
</div>
`;
