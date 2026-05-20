import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stagehand + Playwright zijn native Node modules; webpack moet ze niet bundelen
  serverExternalPackages: ['@browserbasehq/stagehand', 'playwright', 'playwright-core'],
};

export default nextConfig;
