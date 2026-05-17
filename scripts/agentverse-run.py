from uagents_core.crypto import Identity
from uagents_core.config import AgentverseConfig
from uagents_core.registration import AgentverseConnectRequest, AgentUpdates
from uagents_core.utils.registration import register_in_agentverse

API_KEY = "eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE3Nzg5MDA1NzksImlhdCI6MTc3ODg5Njk3OSwiaXNzIjoiZmV0Y2guYWkiLCJqdGkiOiIyMmE3OWFhYTkwOTNiYjA4NzEyMzU1ZDkiLCJwayI6IkE2OWV1M3RPcjhBUGVZaTR4SjdaWnBBbEJjdFh6dWhQb3VuZ1gzRFppYUY3Iiwic2NvcGUiOiIiLCJzdWIiOiIzZDhjYmMwNDA0N2RhMTlkMzQwMDM5OGZkNWNjOTk4ZTE0ZTM4NjU2ZGIzNGU4YzYifQ.XmhE6vQYldOJtsX9e8-9tX4KoJs0Qw2ed0AtMEN1ZT-Z9DB9uCjjIBjToLItDYcAtSDRKi_10q6HCIzjpkJhuJlbi9Oy6ACcWAiAbQ8AQszkGKh7q7bY-HwBVRjm7QZvYmLhrXrxf7Zn6hg3zEcaUE1StO1dLjy4UVGEUdOYgO7fB0Sd0ZPDnNgH0MFcwy47vBNu08KP30giOKpM3GXVfMyK-oM3vvhTTt50W5YVi39Z-dBm-Xy-ItIgjzq2xPBx6HzMK4RaupDQScgz1A1D6B7klCURG4oQ_Skwhjc12e6Bq8cYnj77at2FgaaYq1Fdraaqf2v-FU1oXCw91MgXPA"

identity = Identity.from_seed("Nervouseasy007!", 0)
print("Agent address:", identity.address)

request = AgentverseConnectRequest(
    user_token=API_KEY,
    agent_type="proxy",
    endpoint="https://ezpath.myezverse.xyz/",
)

details = AgentUpdates(
    name="EZpath",
    readme="Pay-per-request DEX meta-router on Base mainnet. Races 0x, ParaSwap, Aerodrome and Uniswap V3. No API key. No subscription.",
)

register_in_agentverse(
    request=request,
    identity=identity,
    agent_details=details,
    agentverse_config=AgentverseConfig(api_key=API_KEY),
)

print("Registration complete")
