import { createServerFn } from "@tanstack/react-start";
import { fetchGasPrices, fetchTopRoutes } from "./liquidity.server";

export const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  const [gas, routes] = await Promise.all([
    fetchGasPrices().catch(() => ({ ethereum: null, base: null })),
    fetchTopRoutes().catch(() => []),
  ]);
  return {
    gas,
    routes,
    paymentWallet: process.env.PAYMENT_WALLET_ADDRESS ?? null,
    timestamp: Date.now(),
  };
});

export const bazaarExtension = {
  info: {
    input: { type: "http", method: "GET", queryParams: {} },
    output: {
      type: "json",
      example: {
        status: "ok",
        buyAmount: "1000000",
        price: "1.25",
        routingEngine: "0x",
      },
    },
  },
  schema: {
    type: "object" as const,
    properties: {
      status: { type: "string", enum: ["ok"] },
      buyAmount: { type: "string" },
      price: { type: "string" },
      routingEngine: { type: "string" },
    },
  },
};
