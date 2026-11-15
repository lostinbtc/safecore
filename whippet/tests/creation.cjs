// Isolated, disposable browser only. Never prints/screenshots recovery words.
const assert = require('node:assert/strict');
const {chromium} = require('./browser-helper.cjs');
const ethers = require('../www/assets/ethers.umd.min.js');
const legacy = require('../www/assets/whippet-legacy.js');
const E = require('../www/engine.js');
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const password = 'Public-test-password-123';
const store = 'whippet.dev.encrypted.v1';
(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
  const context = await browser.newContext({viewport:{width:360,height:800}});
  await require('./empty_network.cjs')(context);
  const page = await context.newPage();
  try {
    await page.goto('http://localhost:8787/#setup');
    await page.locator('#words').selectOption('24');
    assert.equal(await page.locator('#password-lock').isChecked(),false);
    assert.equal(await page.locator('#use-passphrase').isChecked(),false);
    await page.locator('#password-lock').check();
    await page.locator('#password').fill(password); await page.locator('#confirm').fill(password); await page.locator('#ack').check();
    await page.locator('#submit-setup').click();
    await page.locator('#recovery-words').waitFor();
    assert.equal(await page.locator('.word').count(),24);
    assert.equal(await page.locator('#finish').isDisabled(),false);
    assert.equal(await page.locator('#saved-phrase').count(),0);
    assert.equal(await page.locator('#discard').count(),0);
    assert.ok(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).format === 'pepecoin-whippet-encrypted-v1',store));
    // Compare inside the page; never return or log generated recovery words.
    assert.equal(await page.evaluate(async({store,password})=>{
      const saved=await WalletEngine.decrypt(crypto,JSON.parse(localStorage.getItem(store)),password);
      return saved.mnemonic.split(' ').every((word,i)=>document.querySelectorAll('#recovery-words .word')[i].lastChild.textContent===word);
    },{store,password}),true);
    // Backgrounding hides the words but leaves the automatically saved wallet.
    await page.evaluate(() => {Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(() => document.querySelector('#recovery-words') === null);
    assert.ok(await page.evaluate(key => Boolean(localStorage.getItem(key)),store));
    await page.evaluate(() => delete document.hidden);
    await page.locator('.wallets-shortcut').click();await page.locator('#add-wallet').click();
    await page.locator('#password-lock').check();
    await page.locator('#password').fill(password); await page.locator('#confirm').fill(password); await page.locator('#ack').check();
    await page.locator('#submit-setup').click();
    await page.locator('#recovery-words').waitFor();
    assert.equal(await page.locator('.word').count(),12);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('corevault.wallets.v1')).wallets.length),2);
    // New wallets start empty; explicitly choose Pepecoin before receiving.
    await require('./coin-selection-helper.cjs')(page,['pep']);
    await page.locator('[data-nav="receive"]').click();
    await require('./open_receive_picker.cjs')(page);await page.locator('[data-coin="pep"]').click();
    await page.locator('#address').waitFor();
    assert.equal(await page.locator('#recovery-words').count(),0);
    await page.waitForFunction(() => document.documentElement.dataset.walletState === 'unlocked');
    assert.ok(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).format === 'pepecoin-whippet-encrypted-v1',store));
    await page.reload();
    await require('./open_receive_picker.cjs')(page);await page.locator('[data-coin="pep"]').click();
    await page.locator('#receive-setup').click();await page.locator('#unlock-password').fill(password);await page.locator('#unlock-submit').click();
    await page.locator('.holdings').waitFor();
    await page.locator('[data-nav="receive"]').click();await require('./open_receive_picker.cjs')(page);await page.locator('[data-coin="pep"]').click();await page.locator('#address').waitFor();
    // Remove only this disposable test context's own local vault.
    await page.evaluate(key => localStorage.removeItem(key),store);
    await page.reload();
    await page.goto('http://localhost:8787/#setup');
    await page.locator('[data-setup="import"]').click();
    const original = legacy.derive(ethers, phrase, {count:3,passphrase:'TREZOR'});
    await page.locator('#backup-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
    await page.waitForFunction(() => document.getElementById('file-status').textContent.startsWith('Original Whippet'));
    await page.locator('#password-lock').check();
    await page.locator('#password').fill(password); await page.locator('#confirm').fill(password);
    assert.equal(await page.locator('#ack').count(),0);
    await page.locator('#submit-setup').click();
    await page.waitForFunction(() => document.documentElement.dataset.walletState === 'unlocked');
    await require('./coin-selection-helper.cjs')(page,['pep','wht']);
    await page.locator('[data-nav="receive"]').click();await require('./open_receive_picker.cjs')(page);await page.locator('[data-coin="wht"]').click();
    assert.equal(await page.locator('#address').textContent(),original.wallets[0].address);
    await require('./open_receive_picker.cjs')(page); await page.locator('[data-coin="pep"]').click();
    assert.equal(await page.locator('#address').textContent(),E.accounts(ethers,E.recipe(ethers,phrase,'TREZOR')).pep.address);
    for (const width of [320,360,430,1440]) {
      await page.setViewportSize({width,height:800});
      for (const route of ['wallet','activity','receive','security']) {
        await page.locator(`[data-nav="${route}"]`).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false, `${width}:${route}`);
        assert.ok(await page.locator('.bottom-navigation').evaluate(el => Math.abs(el.getBoundingClientRect().bottom-innerHeight)<2));
      }
    }
    const failing=await browser.newContext(),failed=await failing.newPage();
    await failed.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='corevault.wallets.v1')throw Error('Fixture storage full');return set.call(this,key,value);};});
    await failed.goto('http://localhost:8787/#setup');await failed.locator('#ack').check();await failed.locator('#submit-setup').click();
    await failed.locator('#error').waitFor({state:'visible'});
    assert.equal(await failed.locator('#recovery-words').count(),0);
    assert.equal(await failed.evaluate(key=>localStorage.getItem(key),store),null);
    await failing.close();
    console.log('PASS: 12/24-word automatic save before reveal, background/navigation/reload preservation, separate wallet preservation, storage-failure guard, legacy recovery and phone layout.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
