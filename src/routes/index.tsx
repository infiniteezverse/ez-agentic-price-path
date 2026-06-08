import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HubPage,
});

function HubPage() {
  return (
    <div style={containerStyle}>
      <style>{hubStyles}</style>
      <header style={headerStyle}>
        <div style={badgeStyle}>✓ Live · Production Ready</div>
        <h1 style={h1Style}>EZ-Path</h1>
        <p style={subtitleStyle}>DEX meta-router for autonomous agents on Base</p>
      </header>

      <div style={featureListStyle}>
        <h2 style={h2Style}>What is EZ-Path?</h2>
        <div style={featuresGridStyle}>
          <Feature icon="🏎️" title="10-Venue Racing" desc="Simultaneously queries 0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, and Synthetix" />
          <Feature icon="💰" title="Best Price Guaranteed" desc="Returns the highest buyAmount across all venues in 195-280ms" />
          <Feature icon="🔐" title="X402 Micro-Payments" desc="EIP-3009 USDC signing. No API keys. No subscriptions. Fully cryptographic." />
          <Feature icon="📍" title="Agent Native" desc="Discoverable via .well-known/agent.json and OpenAPI 3.1 schema" />
          <Feature icon="💸" title="Three Tiers" desc="Basic ($0.03), Resilient ($0.10), Institutional ($0.50)" />
          <Feature icon="⚡" title="Zero Gas Overhead" desc="Relayer absorbs settlement costs. Agents only pay the quote fee." />
        </div>
      </div>

      <h2 style={h2Style}>Four Ways to Access EZ-Path</h2>

      <div style={hubGridStyle}>
        <Card href="https://monad.myezverse.xyz/" label="📖 Product Overview" title="monad.myezverse.xyz" desc="Marketing landing page. Explains the product, problem & solution, integration methods, and pricing." url="monad.myezverse.xyz" />
        <Card href="https://api.myezverse.xyz/" label="⚙️ Technical API Docs" title="api.myezverse.xyz" desc="Full API reference with interactive quote form, curl examples, OpenAPI spec, and agent manifest." url="api.myezverse.xyz/api/v1/quote" />
        <Card href="https://github.com/infiniteezverse/ez-agentic-price-path" label="📚 Core Repository" title="ez-agentic-price-path" desc="Main source code, documentation, and integration examples. Open source (BSD-2-Clause)." url="github.com/infiniteezverse/ez-agentic-price-path" />
        <Card href="https://github.com/infiniteezverse/monskills-ezpath" label="📦 Integrations" title="monskills-ezpath" desc="TypeScript npm package for MONSKILLS agents and other frameworks. MIT licensed." url="npm install @infiniteezverse/monskills-ezpath" />
      </div>

      <div style={featureListStyle}>
        <h2 style={h2Style}>Agent Discovery</h2>
        <div style={featuresGridStyle}>
          <Feature icon="🔗" title="Agent Manifest" desc="https://api.myezverse.xyz/.well-known/agent.json" />
          <Feature icon="📄" title="OpenAPI Schema" desc="https://api.myezverse.xyz/openapi.json" />
          <Feature icon="🏪" title="Agent Registries" desc="MONSKILLS, AgentX, Agentic Ecosystems" />
          <Feature icon="⚡" title="X402 Protocol" desc="EIP-3009 micro-payments, no API keys, fully cryptographic" />
        </div>
      </div>

      <footer style={footerStyle}>
        <p>EZ-Path by infiniteezverse · X402 Protocol · Base Mainnet (8453)</p>
        <p style={{ marginTop: "10px", fontSize: "12px" }}>USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</p>
      </footer>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={featureStyle}>
      <div style={featureIconStyle}>{icon}</div>
      <div style={featureTextStyle}>
        <strong>{title}</strong>
        {desc}
      </div>
    </div>
  );
}

function Card({ href, label, title, desc, url }: { href: string; label: string; title: string; desc: string; url: string }) {
  return (
    <a href={href} style={hubCardStyle}>
      <div style={labelStyle}>{label}</div>
      <h3 style={h3Style}>{title}</h3>
      <p>{desc}</p>
      <div style={urlStyle}>{url}</div>
      <div style={statusBadgeStyle}>✓ Live</div>
    </a>
  );
}

const hubStyles = `
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
`;

const containerStyle = {
  maxWidth: "1000px",
  margin: "0 auto",
};

const headerStyle = {
  textAlign: "center",
  marginBottom: "60px",
};

const badgeStyle = {
  display: "inline-block",
  background: "#7c3aed",
  color: "white",
  padding: "8px 16px",
  borderRadius: "20px",
  fontSize: "14px",
  fontWeight: "600",
  marginBottom: "20px",
};

const h1Style = {
  fontSize: "48px",
  fontWeight: "800",
  marginBottom: "15px",
  color: "#000",
};

const h3Style = {
  fontSize: "24px",
  marginBottom: "10px",
  color: "#000",
};

const h2Style = {
  fontSize: "32px",
  margin: "30px 0",
  textAlign: "center",
  color: "#000",
};

const subtitleStyle = {
  fontSize: "20px",
  color: "#666",
  marginBottom: "30px",
};

const hubGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "20px",
  marginBottom: "60px",
};

const hubCardStyle = {
  background: "white",
  borderRadius: "12px",
  padding: "30px",
  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.07)",
  border: "2px solid transparent",
  transition: "all 0.3s",
  textDecoration: "none",
  color: "inherit",
  display: "flex",
  flexDirection: "column",
  cursor: "pointer",
};

const labelStyle = {
  fontSize: "12px",
  textTransform: "uppercase",
  color: "#7c3aed",
  fontWeight: "600",
  marginBottom: "15px",
  letterSpacing: "0.5px",
};

const urlStyle = {
  fontFamily: "'Monaco', monospace",
  fontSize: "12px",
  background: "#f9fafb",
  padding: "10px",
  borderRadius: "6px",
  color: "#666",
  wordBreak: "break-all",
  marginBottom: "10px",
};

const statusBadgeStyle = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "11px",
  fontWeight: "600",
  width: "fit-content",
  background: "#d1fae5",
  color: "#065f46",
};

const featureListStyle = {
  background: "white",
  borderRadius: "12px",
  padding: "30px",
  marginBottom: "40px",
  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.07)",
};

const featuresGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "20px",
};

const featureStyle = {
  display: "flex",
  gap: "12px",
};

const featureIconStyle = {
  fontSize: "20px",
  flexShrink: 0,
};

const featureTextStyle = {
  fontSize: "14px",
  color: "#666",
};

const footerStyle = {
  textAlign: "center",
  color: "#999",
  fontSize: "14px",
  borderTop: "1px solid #ddd",
  paddingTop: "30px",
};
