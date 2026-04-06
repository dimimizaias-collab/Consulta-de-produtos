// =============================================================
// api/sync-saidas.js
// Cron Job: sincroniza saídas do Retaguarda → Supabase
// Roda automaticamente a cada 15 minutos via Vercel Cron
// =============================================================

import { createClient } from '@supabase/supabase-js';

// --- Configuração ---
const RETAGUARDA_BASE = process.env.RETAGUARDA_URL;       // https://sudeste01.retaguarda.app/casteloreal
const RETAGUARDA_USER = process.env.RETAGUARDA_USER;      // usuário de leitura criado
const RETAGUARDA_PASS = process.env.RETAGUARDA_PASS;      // senha do usuário de leitura

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Empresas cadastradas no Retaguarda
const LOJAS = [
  { id: 1, nome: 'Castelo Real' },
  { id: 2, nome: 'Universo do 1,99' },
];

// =============================================================
// PASSO 1: Login no Retaguarda
// =============================================================
async function loginRetaguarda() {
  // Busca a página de login para obter o VIEWSTATE (necessário para o ASP.NET)
  const loginPageRes = await fetch(`${RETAGUARDA_BASE}/sistema`, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const loginPageHtml = await loginPageRes.text();
  const cookies = loginPageRes.headers.get('set-cookie') || '';

  // Extrai campos ocultos do ASP.NET
  const viewstate = extrairCampo(loginPageHtml, '__VIEWSTATE');
  const viewstateGen = extrairCampo(loginPageHtml, '__VIEWSTATEGENERATOR');
  const eventVal = extrairCampo(loginPageHtml, '__EVENTVALIDATION');

  // Envia credenciais
  const formData = new URLSearchParams({
    __VIEWSTATE: viewstate,
    __VIEWSTATEGENERATOR: viewstateGen,
    __EVENTVALIDATION: eventVal,
    'ctl00$contentBody$txtLogin': RETAGUARDA_USER,
    'ctl00$contentBody$txtSenha': RETAGUARDA_PASS,
    'ctl00$contentBody$btnEntrar': 'Entrar',
  });

  const loginRes = await fetch(`${RETAGUARDA_BASE}/sistema`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0',
    },
    body: formData.toString(),
    redirect: 'manual',
  });

  // Retorna os cookies de sessão autenticada
  const sessionCookies = [cookies, loginRes.headers.get('set-cookie')]
    .filter(Boolean)
    .join('; ');

  return sessionCookies;
}

// =============================================================
// PASSO 2: Buscar saídas do dia no Retaguarda
// =============================================================
async function buscarSaidas(sessionCookies, lojaId) {
  const hoje = new Date().toLocaleDateString('pt-BR').split('/').reverse().join('-'); // YYYY-MM-DD

  // Busca a página de saídas primeiro (para obter VIEWSTATE atualizado)
  const paginaRes = await fetch(`${RETAGUARDA_BASE}/movcentral/saidas`, {
    method: 'GET',
    headers: {
      'Cookie': sessionCookies,
      'User-Agent': 'Mozilla/5.0',
    },
  });

  const paginaHtml = await paginaRes.text();
  const viewstate = extrairCampo(paginaHtml, '__VIEWSTATE');
  const viewstateGen = extrairCampo(paginaHtml, '__VIEWSTATEGENERATOR');
  const eventVal = extrairCampo(paginaHtml, '__EVENTVALIDATION');

  // Faz o POST para filtrar por data e loja
  const formData = new URLSearchParams({
    __VIEWSTATE: viewstate,
    __VIEWSTATEGENERATOR: viewstateGen,
    __EVENTVALIDATION: eventVal,
    'ctl00$contentBody$txtDInicial': hoje,
    'ctl00$contentBody$txtHInicial': '00:00',
    'ctl00$contentBody$txtDFinal': hoje,
    'ctl00$contentBody$txtHFinal': '23:59',
    'ctl00$contentBody$ddlOrderBy': '0',
    'ctl00$contentBody$btnAtualizarMovimento': 'Atualizar',
    '__ASYNCPOST': 'true',
    '__EVENTTARGET': '',
    '__EVENTARGUMENT': '',
  });

  const saidasRes = await fetch(`${RETAGUARDA_BASE}/movcentral/saidas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': sessionCookies,
      'User-Agent': 'Mozilla/5.0',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: formData.toString(),
  });

  const saidasHtml = await saidasRes.text();
  return parsearSaidas(saidasHtml, lojaId, hoje);
}

// =============================================================
// PASSO 3: Extrair dados do HTML retornado
// =============================================================
function parsearSaidas(html, lojaId, data) {
  const saidas = [];

  // Extrai blocos de categoria da loja específica
  // Pattern: lblDescCategoria{lojaId}|{catId} e lblVProdAut{lojaId}|{catId} e lblQtdItensAut{lojaId}|{catId}
  const categoriaRegex = new RegExp(
    `lblDescCategoria${lojaId}\\|(\\d+)[^>]*>([^<]+)<.*?` +
    `lblVProdAut${lojaId}\\|\\1[^>]*title="[^"]*"[^>]*>R\\$\\s*([\\d,\\.]+)<.*?` +
    `lblQtdItensAut${lojaId}\\|\\1[^>]*title="[^"]*"[^>]*>([\\d,\\.]+)`,
    'gs'
  );

  // Nome da loja
  const lojas = { 1: 'Castelo Real', 2: 'Universo do 1,99' };
  const lojaNome = lojas[lojaId] || `Loja ${lojaId}`;

  let match;
  while ((match = categoriaRegex.exec(html)) !== null) {
    const [, catId, categoria, valorStr, qtdStr] = match;
    saidas.push({
      loja_id: lojaId,
      loja_nome: lojaNome,
      produto_sku: null,
      produto_ean: null,
      produto_nome: categoria.trim(),
      categoria: categoria.trim(),
      quantidade: parseFloat(qtdStr.replace(',', '.')) || 0,
      valor_total: parseFloat(valorStr.replace('.', '').replace(',', '.')) || 0,
      data_venda: data,
    });
  }

  return saidas;
}

// =============================================================
// PASSO 4: Salvar no Supabase
// =============================================================
async function salvarNoSupabase(saidas, data) {
  if (saidas.length === 0) return 0;

  // Remove registros do dia atual antes de reinserir (evita duplicatas)
  await supabase
    .from('saidas')
    .delete()
    .eq('data_venda', data);

  // Insere os novos dados
  const { error } = await supabase
    .from('saidas')
    .insert(saidas);

  if (error) throw new Error(`Supabase insert error: ${error.message}`);

  return saidas.length;
}

// =============================================================
// PASSO 5: Atualizar o campo `count` na tabela products
// (baixa estoque com base nas saídas por EAN/SKU quando disponível)
// =============================================================
async function atualizarEstoque(saidas) {
  // Esta função será expandida quando tivermos o cruzamento
  // EAN/SKU entre o Retaguarda e o Supabase.
  // Por ora, registra apenas o histórico na tabela saidas.
  console.log(`[sync] Estoque: ${saidas.length} categorias registradas.`);
}

// =============================================================
// UTILITÁRIO: Extrair campo oculto do HTML ASP.NET
// =============================================================
function extrairCampo(html, campo) {
  const match = html.match(
    new RegExp(`id="${campo}"[^>]*value="([^"]*)"`)
  );
  return match ? match[1] : '';
}

// =============================================================
// HANDLER PRINCIPAL (chamado pelo Vercel Cron)
// =============================================================
export default async function handler(req, res) {
  // Segurança: só aceita chamadas autorizadas
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const inicio = Date.now();
  const hoje = new Date().toISOString().split('T')[0];

  try {
    console.log('[sync] Iniciando sincronização de saídas...');

    // Login
    const sessionCookies = await loginRetaguarda();
    console.log('[sync] Login realizado com sucesso.');

    // Busca saídas de todas as lojas
    let todasSaidas = [];
    for (const loja of LOJAS) {
      const saidas = await buscarSaidas(sessionCookies, loja.id);
      console.log(`[sync] Loja ${loja.nome}: ${saidas.length} categorias encontradas.`);
      todasSaidas = todasSaidas.concat(saidas);
    }

    // Salva no Supabase
    const total = await salvarNoSupabase(todasSaidas, hoje);
    await atualizarEstoque(todasSaidas);

    // Registra o log de sucesso
    await supabase.from('sync_log').insert({
      status: 'success',
      registros_processados: total,
      mensagem: `Sincronização concluída em ${Date.now() - inicio}ms`,
    });

    console.log(`[sync] Concluído: ${total} registros salvos.`);
    return res.status(200).json({ success: true, registros: total });

  } catch (err) {
    console.error('[sync] Erro:', err.message);

    // Registra o log de erro
    await supabase.from('sync_log').insert({
      status: 'error',
      registros_processados: 0,
      mensagem: err.message,
    });

    return res.status(500).json({ error: err.message });
  }
}
