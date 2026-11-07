// Isolated disposable profiles and public seed fixtures only. No real network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {webcrypto} = require('node:crypto');
const {chromium} = require('./browser-helper.cjs');
const E = require('../www/engine.js'), ethers = require('../www/assets/ethers.umd.min.js');
const KEY = 'corevault.risk-ack.v1', STORE = 'whippet.dev.encrypted.v1';
const recipe = E.recipe(ethers, 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const paragraphs = fs.readFileSync(require('node:path').resolve(__dirname, '../../RISK_NOTICE.md'), 'utf8').trim().split('\n\n').slice(1);
(async () => {
  const browser = await chromium.launch();
  try {
    for (const scenario of ['fresh', 'existing', 'protected', 'storage-failure']) {
      console.log('Disclaimer UI:', scenario);
      const vault = scenario === 'protected' ? await E.encrypt(webcrypto, recipe, 'Disposable-test-password') : E.unprotected(webcrypto, recipe);
      const context = await browser.newContext({acceptRiskNotice:false, viewport:{width:390,height:844}});
      await require('./empty_network.cjs')(context);
      await context.addInitScript(({scenario, vault}) => {
        if (scenario !== 'fresh' && !localStorage.getItem('whippet.dev.encrypted.v1')) localStorage.setItem('whippet.dev.encrypted.v1', JSON.stringify(vault));
        window.__networkCalls = 0;
        const original = window.WebSocket;
        window.WebSocket = class extends original { constructor(...args) { super(...args); window.__networkCalls++; } };
        const setItem = Storage.prototype.setItem;
        window.__failAck = scenario === 'storage-failure';
        Storage.prototype.setItem = function(key, value) {
          if (window.__failAck && key === 'corevault.risk-ack.v1') throw Error('Fixture storage failure');
          return setItem.call(this, key, value);
        };
      }, {scenario, vault});
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://localhost:8787/#security');
      await page.locator('#risk-notice[open]').waitFor();
      assert.equal(await page.locator('#risk-title').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'Static heading has no focus box');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'risk-ack');
      assert.notEqual(await page.locator('#risk-ack').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'Interactive keyboard focus stays visible');
      assert.equal(await page.locator('#risk-continue').isDisabled(), true);
      assert.equal(await page.locator('#risk-continue').evaluate(el => getComputedStyle(el).borderRadius), '12px');
      assert.equal(await page.evaluate(() => __networkCalls), 0, 'No chain requests before acknowledgment');
      assert.deepEqual(await page.locator('#risk-notice .risk-copy p').allTextContents(), paragraphs);
      const readme = fs.readFileSync(require('node:path').resolve(__dirname, '../../README.md'), 'utf8');
      for (const paragraph of paragraphs) assert.ok(readme.includes(paragraph), 'README/app notice must agree');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#risk-notice').evaluate(el => el.open), true);
      await page.evaluate(() => location.hash = '#setup');
      await page.locator('#risk-notice[open]').waitFor();
      assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), null, 'Navigation cannot acknowledge');
      for (const width of [320,390,430]) {
        await page.setViewportSize({width,height:568});
        assert.equal(await page.locator('#risk-notice').evaluate(el => el.scrollWidth > el.clientWidth), false);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      await page.locator('#risk-ack').check();
      await page.locator('#risk-continue').click();
      if (scenario === 'storage-failure') {
        await page.locator('#risk-error').waitFor({state:'visible'});
        assert.equal(await page.locator('#risk-notice').evaluate(el => el.open), true);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), null);
        await page.evaluate(() => __failAck = false);
        await page.locator('#risk-continue').click();
      }
      await page.locator('#risk-notice').waitFor({state:'hidden'});
      assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), 'acknowledged');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), STORE), scenario === 'fresh' ? null : JSON.stringify(vault), 'Acknowledgment must not change the vault');
      await page.reload();
      assert.equal(await page.locator('#risk-notice[open]').count(), 0, 'Do not show again on reload');
      await page.locator('[data-nav=security]').click();
      await page.locator('#wallet-information').waitFor();
      assert.equal(await page.locator('#password-protection').evaluate(el=>el.previousElementSibling.matches('.page-head')&&el.nextElementSibling.matches('.theme-control')),true,'Protection status is directly below the Settings heading, above Appearance');
      assert.equal(await page.locator('#password-protection h2').innerText(),scenario==='fresh'?'No wallet yet':scenario==='protected'?'Password protection on':'Password protection off');
      assert.equal(await page.locator('#wallet-information').evaluate(el=>{
        const recovery=document.querySelector('#recovery-preferences');
        return Boolean(recovery.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)&&el.parentElement===el.closest('section').lastElementChild;
      }),true,'Information is the final Settings control, below Komodo recovery');
      await page.locator('#wallet-information').click();
      await page.locator('#information-back').waitFor();
      assert.deepEqual(await page.locator('#main .risk-copy p').allTextContents(), paragraphs);
      assert.equal(await page.locator('[data-nav=security]').getAttribute('aria-current'), 'page');
      await page.reload();
      assert.equal(await page.locator('#view-acknowledgment').count(), 0);
      await page.locator('#information-back').click();
      if (scenario === 'existing') {
        assert.equal(await page.locator('#komodo-recovery-enabled').isChecked(), false);
        assert.equal(await page.locator('.komodo-setting strong').innerText(), 'Komodo recovery (PEP)');
        assert.equal(await page.locator('.komodo-setting small').innerText(), 'Recover legacy Pepecoin funds.');
        await page.locator('#theme-choice').selectOption('light');
        await page.locator('#wallet-information').click();
        await page.screenshot({path:'/tmp/safecore-information-light.png'});
        // Replacing the active public-fixture wallet does not reset installation acknowledgment.
        await page.evaluate(() => {
          const lib = WalletLibrary.create(localStorage), r = WalletEngine.recipe(ethers, 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
          lib.save(WalletEngine.unprotected(crypto,r), 'Second disposable wallet');
        });
        await page.reload();
        assert.equal(await page.locator('#risk-notice[open]').count(), 0);
      }
      await page.evaluate(key => localStorage.removeItem(key), KEY);
      await page.reload();
      await page.locator('#risk-notice[open]').waitFor();
      if (scenario === 'fresh') {
        await page.setViewportSize({width:430,height:844});
        await page.screenshot({path:'/tmp/safecore-disclaimer.png'});
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: fresh/existing/locked first use, explicit acknowledgment, persistence, failure safety, unchanged vaults, Information, notice parity and narrow layouts.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
