import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Tudo que o service worker precacheia precisa passar livre por aqui: o SW
  // se instala na tela de login (sem sessão) e, se o middleware redirecionar
  // um arquivo pro /login, o HTML do login fica salvo no lugar do arquivo.
  // scripts/check-pwa.mjs valida isso no build.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|brand/|fonts/|sw.js|swe-worker-|workbox-|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|ttf|otf|woff|woff2)$).*)',
  ],
};
