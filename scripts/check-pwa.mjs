// Trava de build: garante que o service worker (next-pwa) não volte a quebrar o login.
//
// Histórico: o SW se instala na tela de login, sem sessão. Tudo que ele precacheia
// e que passa pelo middleware é redirecionado pro /login — e o HTML do login fica
// salvo no lugar do arquivo, servido cache-first pra sempre. Foi assim que "/" virou
// a tela de login (login "voltando vazio" em todo dispositivo) e a fonte Arimo das
// etiquetas virou HTML. Ver commit 9ab2e52.
//
// Roda depois do `next build` (script "build" do package.json). Se falhar, o build
// falha e o deploy no Coolify não sobe — a versão antiga continua no ar.
import { readFileSync, existsSync } from 'node:fs';

const errors = [];

const swPath = 'public/sw.js';
if (!existsSync(swPath)) {
  console.error(`[check-pwa] ${swPath} não encontrado — o next-pwa não gerou o service worker.`);
  process.exit(1);
}
const sw = readFileSync(swPath, 'utf-8');

// Mesmo regex que o Next monta a partir do `matcher` do middleware.
const mwSource = readFileSync('middleware.ts', 'utf-8');
const literal = mwSource.match(/matcher:\s*\[\s*('(?:[^'\\]|\\.)*')/)?.[1];
if (!literal) {
  console.error('[check-pwa] não achei o matcher em middleware.ts — atualize este script.');
  process.exit(1);
}
const matcher = new RegExp(`^${new Function(`return ${literal}`)()}$`);
const passesMiddleware = path => matcher.test(path);

// Sanidade: o middleware tem que continuar protegendo o app.
for (const path of ['/', '/login', '/api/usuarios']) {
  if (!passesMiddleware(path)) errors.push(`middleware deixou de rodar em "${path}" — o login não estaria mais protegendo o app.`);
}

// 1. Nada de página (HTML dependente de sessão) no precache — em especial "/".
const precacheUrls = [...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map(m => m[1]);
if (precacheUrls.length === 0) errors.push('não encontrei a lista de precache no sw.js — atualize este script.');
if (precacheUrls.includes('/')) errors.push('"/" está no precache. Mantenha `cacheStartUrl: false` no next.config.ts.');

// 2. Todo arquivo precacheado precisa passar livre pelo middleware.
for (const url of precacheUrls) {
  const path = url.split('?')[0];
  if (path.startsWith('/_next/')) continue; // excluído pelo matcher
  if (passesMiddleware(path)) {
    errors.push(`"${path}" está no precache mas passa pelo middleware (seria salvo como a tela de login). Exclua-o do matcher em middleware.ts ou do precache via publicExcludes no next.config.ts.`);
  }
}

// 3. Respostas de /api nunca podem vir do cache do SW.
if (sw.includes('cacheName:"apis"')) errors.push('regra de cache "apis" voltou ao sw.js — /api não pode ser cacheado.');
if (sw.includes('cacheName:"start-url"')) errors.push('regra "start-url" voltou ao sw.js — "/" não pode ser cacheado.');

if (errors.length) {
  console.error('\n[check-pwa] Service worker com risco de quebrar o login:\n');
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}
console.log(`[check-pwa] ok — ${precacheUrls.length} arquivos no precache, nenhum dependente de sessão.`);
