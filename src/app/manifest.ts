import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PEPE Flow',
    short_name: 'PEPE',
    description: 'PEPE Wagenparkbeheer — Innameformulier',
    start_url: '/inname',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#921939',
    icons: [
      { src: '/apple-touch-icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
