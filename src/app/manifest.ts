import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PEPE Flow',
    short_name: 'PEPE Inname',
    description: 'PEPE Wagenparkbeheer — Innameformulier',
    start_url: '/inname',
    display: 'standalone',
    background_color: '#0f1117',
    theme_color: '#0f1117',
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
