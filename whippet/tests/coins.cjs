// Disposable browser context. Public test fixture only; no real wallet data.
const assert = require('node:assert/strict');
const {chromium} = require('./browser-helper.cjs');
const {webcrypto} = require('node:crypto');
const ethers = require('../www/assets/ethers.umd.min.js');
const E = require('../www/engine.js');
const store = 'whippet.dev.encrypted.v1';
(async () => {
  const sealed = JSON.stringify(await E.encrypt(webcrypto, E.recipe(ethers,
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'), 'Public-test-password-123'));
  const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
  try {
    for (const width of [320,390,430]) {
      const context = await browser.newContext({viewport:{width,height:844}});
      await require('./empty_network.cjs')(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://localhost:8787/');
      await page.evaluate(({store,sealed}) => localStorage.setItem(store,sealed), {store,sealed});
      await page.reload();
      await page.locator('.holdings').waitFor();
      assert.equal(await page.getByRole('link',{name:'Add coins'}).count(),1);
      assert.equal(await page.locator('#header-add-coins').evaluate(el=>el.nextElementSibling.matches('.wallets-shortcut')&&el.closest('.topbar')!==null),true,'Add coins sits immediately left of the header wallet icon');
      assert.equal(await page.locator('.home-heading a[href="#coins"]').count(),0);
      assert.equal(await page.locator('.mobile-brand').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'Header brand fits beside protected-wallet controls on narrow screens');
      const addBox=await page.locator('#header-add-coins').boundingBox(),walletBox=await page.locator('.wallets-shortcut').boundingBox();
      assert.ok(addBox.height>=44&&addBox.x+addBox.width<=walletBox.x&&walletBox.x+walletBox.width<=width,'Header controls stay tappable without overlap or overflow');
      assert.equal(await page.locator('[data-overview-coin]').count(),2);
      assert.equal(await page.locator('[data-overview-coin="doge"]').count(),0);
      await page.getByRole('link',{name:'Add coins'}).click();
      await page.locator('#coin-search').waitFor();
      assert.equal(await page.locator('.coin-row').count(),3);
      assert.equal(await page.locator('[data-show-coin="doge"]').isChecked(),false);
      await page.locator('#coin-search').fill('DOGE');
      assert.equal(await page.locator('.coin-row').count(),1);
      assert.match(await page.locator('.coin-row').innerText(),/Coming soon/);
      await page.locator('[data-show-coin="doge"]').check();
      await page.reload();
      assert.equal(await page.locator('[data-show-coin="doge"]').isChecked(),true);
      await page.locator('[data-select-coin="doge"]').click();
      await page.locator('[data-overview-coin=doge]').waitFor();
      assert.match(await page.locator('[data-overview-coin=doge]').innerText(),/Coming soon/);
      assert.equal(await page.locator('[data-overview-coin=doge]').isDisabled(),true);
      assert.equal(await page.locator('[data-overview-coin]').count(),3);
      assert.equal(await page.locator('#receive-now').count(),0);
      assert.equal(await page.locator('#send-now').count(),0);
      assert.equal(await page.evaluate(() => 'doge' in WalletEngine.NETWORKS),false);
      await page.screenshot({path:`whippet/test-results/coins-doge-${width}.png`});
      await page.locator('[data-nav="receive"]').click();
      assert.match(await page.locator('#receive-coin').innerText(),/Choose an asset/);
      assert.equal(await page.locator('[data-coin="doge"]').count(),0);
      assert.equal(await page.locator('#address, #qr').count(),0);
      await page.locator('[data-nav="wallet"]').click();
      await page.getByRole('link',{name:'Add coins'}).click();
      await page.locator('#coin-search').fill('<img src=x onerror=alert(1)>');
      assert.equal(await page.locator('.coin-row').count(),0);
      assert.match(await page.locator('#coin-result-count').innerText(),/No coins match/);
      await page.locator('#coin-search').fill('');
      await page.screenshot({path:`whippet/test-results/coins-list-${width}.png`});
      for (const coin of ['pep','wht','doge']) await page.locator(`[data-show-coin="${coin}"]`).uncheck();
      await page.getByRole('link',{name:'Done',exact:true}).click();
      await page.getByRole('link',{name:'Add coins'}).waitFor();
      await page.reload();
      await page.getByRole('link',{name:'Add coins'}).click();
      // Choosing a hidden coin also adds it back to the coin list.
      await page.locator('[data-select-coin="pep"]').click();
      await page.locator('[data-overview-coin=pep]').waitFor();
      assert.equal(await page.locator('[data-overview-coin]').count(),1);
      assert.equal(await page.locator('[data-overview-coin="pep"]').count(),1);
      await page.getByRole('link',{name:'Add coins'}).click();
      assert.equal(await page.locator('[data-show-coin="pep"]').isChecked(),true);
      await page.locator('[data-select-coin="wht"]').click();
      await page.getByRole('link',{name:'Add coins'}).click();
      await page.locator('[data-show-coin="wht"]').uncheck();
      await page.getByRole('link',{name:'Done',exact:true}).click();
      await page.locator('[data-overview-coin=pep]').waitFor();
      assert.equal(await page.evaluate(key => localStorage.getItem(key),store),sealed);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS: searchable coins, visibility persistence, empty state, selected-coin fallback, Dogecoin stub isolation, unchanged encrypted vault and narrow layouts.');
  } finally {await browser.close();}
})().catch(e => {console.error(e);process.exitCode=1;});
