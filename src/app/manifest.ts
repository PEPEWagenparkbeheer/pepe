import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PEPE Flow',
    short_name: 'PEPE',
    description: 'PEPE Wagenparkbeheer — Fleet management tool',
    start_url: '/zoeken-mobiel',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#921939',
    icons: [
      { src: '/apple-touch-icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
