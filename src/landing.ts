export const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EZ-Path — DEX Meta-Router on Base</title>
  <meta name="description" content="Pay-per-request DEX meta-router on Base mainnet. Races 10 venues simultaneously to return the best swap quote. No API key. No subscription." />
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="https://ezpath.myezverse.xyz/" />
  <meta property="og:title"       content="EZ-Path — DEX Meta-Router on Base" />
  <meta property="og:description" content="Pay-per-request DEX meta-router on Base mainnet. Races 10 venues simultaneously. No API key. No subscription." />
  <meta property="og:image"       content="https://ezpath.myezverse.xyz/og.webp" />
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="EZ-Path — DEX Meta-Router on Base" />
  <meta name="twitter:description" content="Pay-per-request DEX meta-router on Base mainnet. Races 10 venues simultaneously. No API key. No subscription." />
  <meta name="twitter:image"       content="https://ezpath.myezverse.xyz/og.webp" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      padding: 3rem 1.5rem;
      max-width: 860px;
      margin: 0 auto;
      line-height: 1.6;
    }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: #1f6feb22;
      border: 1px solid #1f6feb55;
      color: #58a6ff;
      padding: 0.2rem 0.65rem;
      border-radius: 20px;
      font-size: 0.75rem;
      margin-bottom: 1.25rem;
    }
    .dot { width: 6px; height: 6px; background: #3fb950; border-radius: 50%; display: inline-block; }

    h1 { font-size: 2rem; color: #ffffff; letter-spacing: -0.02em; margin-bottom: 0.4rem; }
    .tagline { color: #8b949e; font-size: 0.9rem; margin-bottom: 2.5rem; }

    .price-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2.5rem;
      flex-wrap: wrap;
    }
    .price-pill {
      background: #1a7f3722;
      border: 1px solid #3fb95066;
      color: #3fb950;
      padding: 0.4rem 1rem;
      border-radius: 6px;
      font-size: 1.1rem;
      font-weight: 700;
    }
    .price-meta { color: #8b949e; font-size: 0.8rem; }

    h2 {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #8b949e;
      margin: 2rem 0 0.75rem;
    }

    .steps { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem; }
    .step {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      color: #c9d1d9;
      font-size: 0.85rem;
    }
    .step-num {
      flex-shrink: 0;
      width: 1.4rem;
      height: 1.4rem;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      color: #58a6ff;
      margin-top: 0.1rem;
    }

    pre {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 1.1rem 1.25rem;
      overflow-x: auto;
      font-size: 0.78rem;
      line-height: 1.75;
      tab-size: 2;
      color: #e6edf3;
    }
    .c { color: #8b949e; }   /* comment */
    .k { color: #ff7b72; }   /* keyword / method */
    .s { color: #a5d6ff; }   /* string / url */
    .f { color: #d2a8ff; }   /* flag */
    .h { color: #79c0ff; }   /* header name */
    .v { color: #3fb950; }   /* value */

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      margin-top: 0.5rem;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 0.75rem 1rem;
      font-size: 0.8rem;
    }
    .card-label { color: #8b949e; font-size: 0.7rem; margin-bottom: 0.2rem; }

    .caps { display: flex; flex-direction: column; gap: 0.4rem; }
    .cap {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 0.6rem 0.9rem;
      font-size: 0.82rem;
    }
    .cap-id { color: #58a6ff; margin-bottom: 0.15rem; }
    .cap-desc { color: #8b949e; font-size: 0.76rem; }

    .quote-form {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 1.5rem;
      margin: 1.5rem 0;
    }
    .form-group {
      margin-bottom: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .form-group label {
      font-size: 0.8rem;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .form-group input {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 0.6rem 0.8rem;
      color: #e6edf3;
      font-family: inherit;
      font-size: 0.9rem;
    }
    .form-group input:focus {
      outline: none;
      border-color: #58a6ff;
      box-shadow: 0 0 0 3px #58a6ff22;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .btn {
      background: #238636;
      border: 1px solid #2ea043;
      border-radius: 6px;
      padding: 0.6rem 1.2rem;
      color: #ffffff;
      font-family: inherit;
      font-size: 0.9rem;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }
    .btn:hover { background: #2ea043; }
    .btn:active { transform: scale(0.98); }
    .btn.loading { opacity: 0.6; cursor: not-allowed; }

    .response {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 1rem;
      margin-top: 1rem;
      font-size: 0.8rem;
      max-height: 300px;
      overflow-y: auto;
    }
    .response-label { color: #8b949e; font-size: 0.7rem; margin-bottom: 0.5rem; }
    .response-json { color: #79c0ff; }
    .status-402 { color: #f85149; }
    .status-200 { color: #3fb950; }

    footer {
      margin-top: 3rem;
      padding-top: 1.25rem;
      border-top: 1px solid #21262d;
      color: #484f58;
      font-size: 0.72rem;
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
    }
  </style>
</head>
<body>

  <div class="badge"><span class="dot"></span> Live · Base Mainnet</div>
  <h1>EZ-Path</h1>
  <p class="tagline">Pay-per-request DEX meta-router. Races 10 venues simultaneously. Best route wins. No subscription. No API key.</p>

  <div class="price-row">
    <div class="price-pill">from 0.03 USDC / request</div>
    <div class="price-meta">Paid via X402 · USDC on Base · EIP-3009 authorization</div>
  </div>

  <h2>How it works</h2>
  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <div>Call <code>/api/v1/quote</code> without payment → receive <code>402</code> with toll address and price</div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div>Sign an EIP-3009 <code>TransferWithAuthorization</code> for 0.03 USDC to <code>0x13dDE…600e2ad</code> on Base</div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div>Base64-encode the payload → retry with <code>X-Payment: &lt;payload&gt;</code> → receive normalized quote</div>
    </div>
  </div>

  <h2>Try It</h2>
  <div class="quote-form">
    <div class="form-row">
      <div class="form-group">
        <label>Sell Token</label>
        <input type="text" id="sellToken" value="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" placeholder="Token address (USDC on Base)">
      </div>
      <div class="form-group">
        <label>Buy Token</label>
        <input type="text" id="buyToken" value="0x4200000000000000000000000000000000000006" placeholder="Token address (WETH on Base)">
      </div>
    </div>
    <div class="form-group">
      <label>Sell Amount (atomic units)</label>
      <input type="text" id="sellAmount" value="1000000" placeholder="1000000 (1 USDC)">
    </div>
    <button class="btn" onclick="getQuote()">Get Quote (402 Probe)</button>
    <div id="quoteResult"></div>
  </div>

  <script>
    async function getQuote() {
      const sellToken = document.getElementById('sellToken').value;
      const buyToken = document.getElementById('buyToken').value;
      const sellAmount = document.getElementById('sellAmount').value;
      const resultDiv = document.getElementById('quoteResult');
      const btn = event.target;

      if (!sellToken || !buyToken || !sellAmount) {
        resultDiv.innerHTML = '<div class="response"><span style="color:#f85149;">All fields required</span></div>';
        return;
      }

      btn.classList.add('loading');
      btn.textContent = 'Loading...';

      try {
        const url = new URL('/api/v1/quote', window.location.origin);
        url.searchParams.set('chain', 'base');
        url.searchParams.set('sellToken', sellToken);
        url.searchParams.set('buyToken', buyToken);
        url.searchParams.set('sellAmount', sellAmount);

        const response = await fetch(url, { method: 'GET' });
        const data = await response.json();

        const statusClass = response.status === 402 ? 'status-402' : 'status-200';
        resultDiv.innerHTML = \`
          <div class="response">
            <div class="response-label">HTTP \${response.status} <span class="\${statusClass}">\${response.statusText}</span></div>
            <pre style="margin:0;font-size:0.75rem">\${JSON.stringify(data, null, 2)}</pre>
          </div>
        \`;

        if (response.status === 402) {
          resultDiv.innerHTML += \`
            <div style="background:#f8544422;border:1px solid #f8544466;border-radius:6px;padding:0.8rem;margin-top:1rem;font-size:0.8rem">
              <div style="color:#f85149;font-weight:600;margin-bottom:0.5rem">✓ Payment Required (X402 Flow)</div>
              <div style="color:#c9d1d9;line-height:1.5">
                To unlock the full quote, sign an EIP-3009 <code>TransferWithAuthorization</code> for <code>\${data.unlock_fee_usd} USDC</code> and retry with the <code>X-Payment</code> header.
              </div>
            </div>
          \`;
        }
      } catch (err) {
        resultDiv.innerHTML = \`<div class="response"><span style="color:#f85149;">Error: \${err.message}</span></div>\`;
      } finally {
        btn.classList.remove('loading');
        btn.textContent = 'Get Quote (402 Probe)';
      }
    }

    document.getElementById('sellAmount').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') getQuote();
    });
  </script>

  <h2>Example</h2>
  <pre><span class="c"># Without payment — learn what's required</span>
<span class="k">curl</span> <span class="s">"https://ezpath.myezverse.xyz/api/v1/quote\
  ?sellToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\
  &amp;buyToken=0x4200000000000000000000000000000000000006\
  &amp;sellAmount=1000000"</span>
<span class="c"># ← 402  { "status": "payment_required", "unlock_fee_usd": 0.03 }</span>

<span class="c"># With payment — receive normalized quote</span>
<span class="k">curl</span> <span class="s">"https://ezpath.myezverse.xyz/api/v1/quote\
  ?sellToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\
  &amp;buyToken=0x4200000000000000000000000000000000000006\
  &amp;sellAmount=1000000"</span> \
  <span class="f">-H</span> <span class="h">"X-Payment:"</span> <span class="v">"&lt;base64-encoded-x402-payload&gt;"</span>
<span class="c"># ← 200  { "price": "0.000443", "buyAmount": "443021...", "sources": [...] }</span></pre>

  <h2>Capabilities</h2>
  <div class="caps">
    <div class="cap">
      <div class="cap-id">price_quote</div>
      <div class="cap-desc">Best available swap quote for any Base ERC-20 pair. Races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) — returns highest buyAmount. Three tiers: basic ($0.03), resilient ($0.10), institutional ($0.50).</div>
    </div>
  </div>

  <h2>Discovery</h2>
  <div class="grid">
    <div class="card">
      <div class="card-label">Agent Manifest</div>
      <a href="/.well-known/agent.json">/.well-known/agent.json</a>
    </div>
    <div class="card">
      <div class="card-label">OpenAPI Schema</div>
      <a href="/openapi.json">/openapi.json</a>
    </div>
    <div class="card">
      <div class="card-label">Quote Endpoint</div>
      <a href="/api/v1/quote">/api/v1/quote</a>
    </div>
    <div class="card">
      <div class="card-label">Toll Address</div>
      <span style="color:#c9d1d9;font-size:0.7rem">0x13dDE704…600e2ad</span>
    </div>
  </div>

  <footer>
    <span>EZ-Path · ezpath.myezverse.xyz</span>
    <span>0x · ParaSwap · Aerodrome · Uniswap V3</span>
    <span>X402 Protocol · Base Mainnet (8453)</span>
  </footer>

</body>
</html>`;
