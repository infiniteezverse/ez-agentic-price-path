import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HubPage,
});

function HubPage() {
  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 20px" }}>
      <h1>EZ-Path</h1>
      <p>DEX meta-router for autonomous agents on Base</p>
    </div>
  );
}
