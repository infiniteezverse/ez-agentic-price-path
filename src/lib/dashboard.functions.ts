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
