// Public seed fixtures, isolated storage and mocked network only.
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const {chromium} = require('./browser-helper.cjs');
const E = require('../www/engine.js'), ethers = require('../www/assets/ethers.umd.min.js');
const recipe = E.recipe(ethers, 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
(async () => {
  const browser = await chromium.launch();
  try {
    for (const scenario of ['fresh', 'cached', 'receive', 'security', 'retry', 'protected']) {
      const password = 'Public-fixture-password';
      const vault = scenario === 'protected' ? await E.encrypt(webcrypto, recipe, password) : E.unprotected(webcrypto, recipe);
      const context = await browser.newContext(), page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.addInitScript(({vault, scenario}) => {
        localStorage.setItem('whippet.dev.encrypted.v1', JSON.stringify(vault));
        window.fetch = async () => new Response(JSON.stringify({error: [], result: {}}));
        window.WebSocket = class { constructor() { throw Error('Live network forbidden'); } };
        window.__scans = [];
        Object.defineProperty(window, 'WalletNetwork', {configurable: true, set(N) {
          Object.defineProperty(window, 'WalletNetwork', {value: N});
          N.scan = async (coin, accounts, previous, options) => {
            __scans.push({coin, count: accounts.length, full: options.full, cached: !!previous?.cached});
            if (scenario === 'retry' && coin === 'wht' && __scans.filter(s => s.coin === coin).length === 1) throw Error('Temporary fixture outage');
            return {coin, at: Date.now(), tip: 500, everUsed: [], confirmed: 0n, unconfirmed: 0n, feeRate: 1000000n,
              rows: accounts.map(account => ({account, checked: true, confirmed: 0n, unconfirmed: 0n, history: [], utxos: []}))};
          };
          if (scenario === 'cached') queueMicrotask(() => {
            const pools = WalletEngine.receivePool(ethers, vault.recipe, 20);
            for (const [coin, accounts] of Object.entries(pools)) {
              // A changed cached balance exercises the display-stabilization timer too.
              const rows = accounts.map((account, i) => ({account, confirmed: i ? 0n : 100000000n, unconfirmed: 0n, history: [], utxos: []}));
              localStorage.setItem('corevault.balance.' + WalletLibrary.id(vault) + '.' + coin,
                N.encode({coin, rows, tip: 500, everUsed: [], at: Date.now(), confirmed: 100000000n, unconfirmed: 0n, feeRate: 1000000n}));
            }
          });
        }});
      }, {vault, scenario});
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      const route = ['receive', 'security', 'retry'].includes(scenario) ? (scenario === 'retry' ? 'security' : scenario) : 'wallet';
      await page.goto('http://localhost:8787/#' + route);
      const unlock = async () => {
        await page.locator('#lock').click();
        await page.locator('#unlock-password').fill(password);
        await page.locator('#unlock-submit').click();
      };
      if (scenario === 'protected') {
        assert.equal(await page.evaluate(() => __scans.length), 0);
        await unlock();
      }
      await page.waitForFunction(() => __scans.length === 2);
      let calls = await page.evaluate(() => __scans);
      assert.deepEqual(calls.map(c => c.coin).sort(), ['pep', 'wht']);
      assert.ok(calls.every(c => c.full && c.count === 200));
      if (scenario === 'cached') assert.ok(calls.every(c => c.cached));
      await page.clock.runFor(4100);
      calls = await page.evaluate(() => __scans);
      if (scenario === 'retry') {
        assert.deepEqual(calls.map(c => [c.coin, c.full]), [['pep', true], ['wht', true], ['wht', true]]);
        await page.clock.runFor(4100);
        assert.equal(await page.evaluate(() => __scans.length), 3);
      } else {
        assert.equal(calls.filter(c => c.full).length, 2, 'No repeated full scan on routine update');
        if (['fresh', 'cached', 'protected'].includes(scenario)) assert.ok(calls.some(c => !c.full));
      }
      await page.locator('[data-nav=wallet]').click();
      if(scenario==='fresh'){
        for(const width of [320,390,1280]){
          await page.setViewportSize({width,height:844});
          const box=await page.locator('#rescan').boundingBox(),nav=await page.locator('.bottom-navigation').boundingBox();
          assert.ok(box.y+box.height<=nav.y-8,'Rescan clears navigation');
          assert.ok(Math.abs(box.x+box.width-(nav.x+nav.width-20))<2,'Rescan sits at wallet lower-right');
          assert.ok(box.height>=44);
          assert.equal(await page.locator('#rescan').evaluate(el=>getComputedStyle(el).backgroundColor), 'rgb(87, 186, 255)');
        }
        await page.evaluate(()=>{document.getElementById('toast').textContent='Fixture notice';document.getElementById('toast').classList.add('visible');});
        const notice=await page.locator('#toast').boundingBox(),button=await page.locator('#rescan').boundingBox();
        assert.ok(notice.y+notice.height<button.y,'Notices must not cover Rescan');
      }
      await page.locator('#rescan').click();
      const expectedFull = scenario === 'retry' ? 5 : 4;
      await page.waitForFunction(n => __scans.filter(c => c.full).length === n, expectedFull);
      await page.waitForFunction(() => !document.getElementById('rescan').disabled);
      if (scenario === 'protected') {
        await page.locator('#lock').click();
        await unlock();
        await page.waitForFunction(() => __scans.filter(c => c.full).length === 6);
      } else if (scenario === 'fresh') {
        // Opening another saved wallet must not inherit the completed-scan flag.
        const other = E.unprotected(webcrypto, recipe);
        await page.evaluate(v => {
          localStorage.setItem('whippet.dev.encrypted.v1', JSON.stringify(v));
          dispatchEvent(new StorageEvent('storage', {key: 'whippet.dev.encrypted.v1'}));
        }, other);
        await page.waitForFunction(() => __scans.filter(c => c.full).length === 6);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: initial full 200-address scan per asset, cached startup, all routes, retry, lightweight follow-ups, Rescan, wallet switch and re-unlock.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
