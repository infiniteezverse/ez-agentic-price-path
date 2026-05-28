"""
EZ-Path Composio Tool
Best DEX swap quote on Base mainnet. Pays $0.03 USDC per call via X402 automatically.

Requirements:
    pip install composio-core eth-account requests pydantic

Usage:
    from ezpath_tool import ezpath_quote
    from composio import Composio
    from composio_openai import ComposioToolSet
    from openai import OpenAI

    toolset = ComposioToolSet()
    tools = toolset.get_tools(actions=["EZPATH_QUOTE"])
"""

import os, json, time, secrets, requests, base64
from pydantic import BaseModel, Field
from composio import Composio
from eth_account import Account

USDC_BASE    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad"
EZPATH_URL   = "https://ezpath.myezverse.xyz/api/v1/quote"

TIER_ATOMIC = {
    "basic":         30_000,
    "resilient":     100_000,
    "institutional": 500_000,
}


def build_x_payment_header(private_key: str, value: int = 30_000) -> str:
    acct = Account.from_key(private_key)
    nonce = "0x" + secrets.token_hex(32)
    valid_before = int(time.time()) + 300
    signed = acct.sign_typed_data({
        "domain": {
            "name": "USD Coin", "version": "2",
            "chainId": 8453, "verifyingContract": USDC_BASE,
        },
        "types": {
            "EIP712Domain": [
                {"name": "name",              "type": "string"},
                {"name": "version",           "type": "string"},
                {"name": "chainId",           "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "TransferWithAuthorization": [
                {"name": "from",        "type": "address"},
                {"name": "to",          "type": "address"},
                {"name": "value",       "type": "uint256"},
                {"name": "validAfter",  "type": "uint256"},
                {"name": "validBefore", "type": "uint256"},
                {"name": "nonce",       "type": "bytes32"},
            ],
        },
        "primaryType": "TransferWithAuthorization",
        "message": {
            "from": acct.address, "to": TOLL_ADDRESS,
            "value": value, "validAfter": 0,
            "validBefore": valid_before, "nonce": nonce,
        },
    })
    payload = {
        "payload": {
            "authorization": {
                "from": acct.address, "to": TOLL_ADDRESS,
                "value": str(value), "validAfter": "0",
                "validBefore": str(valid_before), "nonce": nonce,
            },
            "signature": signed.signature.hex(),
        }
    }
    return base64.b64encode(json.dumps(payload).encode()).decode()


# ── Composio tool definition ──────────────────────────────────────────────────

composio = Composio()


class EZPathQuoteInput(BaseModel):
    sell_token:          str   = Field(..., description="ERC-20 token address to sell on Base mainnet")
    buy_token:           str   = Field(..., description="ERC-20 token address to buy on Base mainnet")
    sell_amount:         str   = Field(..., description="Amount to sell in base decimals (e.g. 1000000 = 1 USDC)")
    tier:                str   = Field("basic", description="Execution tier: basic ($0.03), resilient ($0.10), institutional ($0.50)")
    slippage_percentage: float = Field(None,    description="Max slippage as decimal, e.g. 0.01 = 1%")


@composio.tools.custom_tool
def ezpath_quote(request: EZPathQuoteInput) -> dict:
    """
    Get the best DEX swap quote on Base mainnet.
    Races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) simultaneously.
    Returns highest buyAmount. Payment ($0.03 USDC) handled automatically via X402.

    Common token addresses on Base:
      USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimals)
      WETH: 0x4200000000000000000000000000000000000006 (18 decimals)
    """
    wallet_key = os.environ.get("EZPATH_WALLET_KEY")
    if not wallet_key:
        return {"error": "EZPATH_WALLET_KEY environment variable not set"}

    atomic  = TIER_ATOMIC.get(request.tier, TIER_ATOMIC["basic"])
    header  = build_x_payment_header(wallet_key, atomic)
    params  = {
        "sellToken":  request.sell_token,
        "buyToken":   request.buy_token,
        "sellAmount": request.sell_amount,
    }
    if request.slippage_percentage:
        params["slippagePercentage"] = str(request.slippage_percentage)

    r = requests.get(EZPATH_URL, params=params, headers={"X-Payment": header}, timeout=10)
    return r.json()


# ── Example with OpenAI ───────────────────────────────────────────────────────
#
# from composio_openai import ComposioToolSet
# from openai import OpenAI
#
# client  = OpenAI()
# toolset = ComposioToolSet()
# tools   = toolset.get_tools(actions=["EZPATH_QUOTE"])
#
# response = client.chat.completions.create(
#     model="gpt-4o",
#     tools=tools,
#     messages=[{
#         "role": "user",
#         "content": "What is the best rate to swap 1 USDC for WETH on Base?"
#     }],
# )
