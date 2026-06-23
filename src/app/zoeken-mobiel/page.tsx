import type { Metadata } from 'next';
import ZoekenMobielPage from '@/components/zoeken/ZoekenMobielPage';

export const metadata: Metadata = {
  title: 'Zoeken — PEPE Flow',
  icons: {
    icon: '/pepe-beeldmerk-rgb.svg',
    shortcut: '/pepe-beeldmerk-rgb.svg',
    apple: '/apple-touch-icon.png',
  },
};

export default function ZoekenMobielRoute() {
  return <ZoekenMobielPage />;
}