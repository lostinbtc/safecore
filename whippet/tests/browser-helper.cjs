const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium: original} = require('playwright');
const root = path.resolve(__dirname, '../www');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml'};
exports.chromium = {
  async launch(options = {}) {
    // Use Playwright's bundled Chromium unless explicitly overridden.
    delete options.executablePath;
    if (process.env.CHROME_BIN) options.executablePath = process.env.CHROME_BIN;
    const browser = await original.launch(options);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async ({acceptRiskNotice = true, ...options} = {}) => {
      const context = await newContext(options);
      // Unrelated suites represent returning users. Dedicated disclaimer tests
      // opt out to exercise the real first-run gate; no production test bypass.
      if (acceptRiskNotice) await context.addInitScript(() => localStorage.setItem('corevault.risk-ack.v1', 'acknowledged'));
      await context.route('http://localhost:8787/**', async route => {
        const requestPath = decodeURIComponent(new URL(route.request().url()).pathname);
        const target = path.resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
        if (!target.startsWith(root + path.sep)) return route.fulfill({status:403});
        try {
          await route.fulfill({status:200, contentType:types[path.extname(target)] || 'text/plain', body:await fs.readFile(target)});
        } catch { await route.fulfill({status:404}); }
      });
      return context;
    };
    // Playwright's browser.newPage creates its own context internally.
    browser.newPage = async options => (await browser.newContext(options)).newPage();
    return browser;
  }
};
