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
    '@sparticuz/chromium',
    'puppeteer-core',
  ],

  // Security headers (security review #5). Bewust conservatief: de CSP beperkt
  // alleen framing/object/base (clickjacking) zodat de app niet breekt. Het verder
  // aanscherpen van script-src/default-src tegen XSS is een aparte follow-up (P2),
  // omdat dat zorgvuldig getest moet worden met Next.js' inline scripts/styles.
  async headers() {
    return [
      // /addin wordt geladen in een Outlook iframe — framing toestaan voor Office origins
      {
        source: '/addin',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' https://outlook.office.com https://outlook.office365.com https://outlook.live.com https://*.microsoft.com; object-src 'none'; base-uri 'self'",
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
