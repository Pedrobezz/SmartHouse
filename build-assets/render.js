const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  const svg = require('fs').readFileSync(process.argv[2], 'utf8');
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`);
  await p.screenshot({ path: process.argv[3], omitBackground: true });
  await b.close();
})();
