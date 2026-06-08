import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stagehand + Playwright zijn native Node modules; webpack moet ze niet bundelen.
  // pino/pino-pretty MOETEN extern blijven, anders kan pino's transport-worker
  // 'pino-pretty' niet resolven → "unable to determine transport target for pino-pretty"
  // bij stagehand.init() in de API-route.
  serverExternalPackages: [
    '@browserbasehq/stagehand',
    'playwright',
    'playwright-core',
    'pino',
    'pino-pretty',
  ],
};

export default nextConfig;
