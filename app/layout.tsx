import type {Metadata} from 'next';
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

export const metadata: Metadata = {
  title: 'StockFlow Pro | Inventory Matrix',
  description: 'Managing active SKUs with precision and style.',
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
