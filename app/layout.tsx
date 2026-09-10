import type {Metadata, Viewport} from 'next';
import { Manrope, Inter, DM_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-mono',
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
  icons: {
    icon: [
      { url: '/icons/icon-universo-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-universo-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-universo-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icons/icon-universo-32.png',
    apple: '/icons/icon-universo-180.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Controle de estoque',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${inter.variable} ${dmMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');var m=localStorage.getItem('view-mode');if(m==='mobile'||m==='desktop')document.documentElement.setAttribute('data-view-mode',m);}catch(e){}})();` }} />
        {/* Descarta service workers/caches de builds antigos uma única vez por navegador.
            Sem isso, um SW instalado antes de uma correção de PWA pode ficar servindo
            páginas/caches obsoletos indefinidamente (ex.: pós-login "voltando" pro /login
            sem erro), já que ele nunca chega a se auto-atualizar em alguns navegadores. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var FLAG='sw-cleanup-v1';if(localStorage.getItem(FLAG))return;if(!('serviceWorker' in navigator)){localStorage.setItem(FLAG,'1');return;}navigator.serviceWorker.getRegistrations().then(function(regs){if(!regs.length){localStorage.setItem(FLAG,'1');return;}Promise.all(regs.map(function(r){return r.unregister();})).then(function(){return ('caches' in window)?caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));}):null;}).then(function(){localStorage.setItem(FLAG,'1');window.location.reload();});}).catch(function(){localStorage.setItem(FLAG,'1');});}catch(e){}})();` }} />
      </head>
      <body suppressHydrationWarning className="font-inter">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
