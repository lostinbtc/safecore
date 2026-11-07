// Disposable browser and public fixtures. No real Electrum connections or sends.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {expect}=require('playwright/test');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(()=>{window.fetch=async()=>{throw Error('Fixture offline');};window.WebSocket=class{constructor(){throw Error('Fixture offline');}};});
    await page.goto('http://localhost:8787/');
    assert.equal(await page.locator('[data-overview-coin=pep] .holding-balance').innerText(),'* PEP');
    await page.locator('[data-nav="activity"]').click();await expect(page.locator('#main')).toContainText(/transactions will appear/);
    const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    const vault=E.unprotected(webcrypto,recipe);
    await page.evaluate(vault=>{
      localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
      const id=WalletLibrary.id(vault),accounts=WalletEngine.receivePool(ethers,vault.recipe).pep;
      // Old disabled flags must not prevent automatic connection.
      localStorage.setItem('corevault.live.'+id,'no');
      const rows=accounts.map((account,i)=>({account,confirmed:i?0n:500000000n,unconfirmed:0n,history:i?[]:[{tx_hash:'a'.repeat(64),height:499}],utxos:[]}));
      localStorage.setItem('corevault.balance.'+id+'.pep',WalletNetwork.encode({coin:'pep',rows,tip:500,everUsed:[0],at:Date.now(),confirmed:500000000n,unconfirmed:0n,feeRate:1000000n}));
    },vault);
    await page.goto('http://localhost:8787/');
    await page.waitForFunction(()=>document.querySelector('[data-overview-coin=pep] .holding-balance')?.textContent==='5 PEP');
    assert.doesNotMatch(await page.locator('[data-overview-coin=pep]').innerText(),/Last known|Updated/);
    assert.equal(await page.locator('#send-now').count(),0);
    await page.waitForFunction(()=>document.querySelector('[data-overview-coin=pep] .holding-status').textContent.includes('Unable to refresh'));
    assert.equal(await page.locator('[data-overview-coin=pep] .holding-balance').innerText(),'5 PEP');
    await page.locator('[data-nav="receive"]').click();
    await page.locator('#receive-coin').click();await page.locator('[data-coin="pep"]').click();
    assert.equal(await page.locator('#address-number').innerText(),'Address #2');
    assert.equal(await page.locator('#address').count(),0); // No stale receive QR.
    assert.equal(await page.locator('#next-address').isDisabled(),true);
    await page.goto('http://localhost:8787/');
    await page.evaluate(()=>localStorage.setItem('corevault.balance.'+WalletLibrary.id(JSON.parse(localStorage.getItem('whippet.dev.encrypted.v1')))+'.pep','{broken'));
    await page.reload();assert.equal(await page.locator('[data-overview-coin=pep] .holding-balance').innerText(),'* PEP');
    // Same seed in a separately saved wallet still has an independent cache key.
    const other=E.unprotected(webcrypto,recipe);
    await page.evaluate(v=>{localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));},other);
    await page.reload();assert.equal(await page.locator('[data-overview-coin=pep] .holding-balance').innerText(),'* PEP');
    assert.deepEqual(errors,[]);await context.close();
    console.log('PASS: no sample balances/activity, cached total on reload, offline labeling, stale-send/receive blocking, corrupt cache rejection and wallet isolation.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
