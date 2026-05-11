import type { Metadata } from 'next';
import InnamePage from '@/components/inname/InnamePage';

export const metadata: Metadata = {
  title: 'Inname — PEPE Flow',
  icons: {
    icon: '/pepe-beeldmerk-rgb.svg',
    shortcut: '/pepe-beeldmerk-rgb.svg',
    apple: '/pepe-beeldmerk-rgb.svg',
  },
};

export default function InnameRoute() {
  return <InnamePage />;
}
