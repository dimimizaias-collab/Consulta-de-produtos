import type {Metadata, Viewport} from 'next';
import { Manrope, Inter } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const viewport: Viewport = {
  themeColor: '#B5000B',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'Controle de estoque',
  description: 'Controle de estoque de produtos',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Controle de estoque',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable}`}>
      <body suppressHydrationWarning className="font-inter bg-[#fffef0] text-[#1c1c0f]">
        {children}
      </body>
    </html>
  );
}
