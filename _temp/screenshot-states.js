const { chromium } = require('C:\\Users\\dimit\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto('http://localhost:4445/supplier-dictionary-mockup.html');
  await page.waitForSelector('.state-switcher');

  // State 2 — Fornecedor Selecionado
  await page.evaluate(() => document.querySelectorAll('.state-switcher button')[1].click());
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'C:\\Users\\dimit\\Documents\\App Consulta de Produtos\\_temp\\mockup-state2-new.png' });

  // State 3 — Produto Vinculado
  await page.evaluate(() => document.querySelectorAll('.state-switcher button')[2].click());
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'C:\\Users\\dimit\\Documents\\App Consulta de Produtos\\_temp\\mockup-state3-new.png' });

  await browser.close();
  console.log('done');
})().catch(e => { console.error(e.message); process.exit(1); });
