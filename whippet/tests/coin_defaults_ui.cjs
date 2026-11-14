// Disposable wallets and public vectors only; no live endpoints or funds.
const assert=require('node:assert/strict'),{chromium}=require('./browser-helper.cjs');
const selectCoins=require('./coin-selection-helper.cjs');
(async()=>{const browser=await chromium.launch();try{
  const context=await browser.newContext();await require('./empty_network.cjs')(context);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8787/');await page.locator('#coin-empty').waitFor();
  assert.equal(await page.locator('[data-overview-coin]').count(),0);
  await page.locator('#security-cta').click();await page.locator('#ack').check();await page.locator('#submit-setup').click();
  await page.locator('#finish').click();await page.locator('#coin-empty').waitFor();
  const first=await page.evaluate(()=>WalletLibrary.id(WalletLibrary.create(localStorage).active()));
  await page.locator('#header-add-coins').click();
  assert.equal(await page.locator('[data-show-coin]:checked').count(),0,'Every coin, including DOGE, starts off');
  await page.getByRole('link',{name:'Done',exact:true}).click();
  await selectCoins(page,['pep','doge']);await page.reload();
  await page.locator('[data-overview-coin=doge]').waitFor();assert.equal(await page.locator('[data-overview-coin]').count(),2);
  await page.locator('.wallets-shortcut').click();await page.locator('#add-wallet').click();
  await page.locator('#ack').check();await page.locator('#submit-setup').click();await page.locator('#finish').click();
  await page.locator('#coin-empty').waitFor();
  const second=await page.evaluate(()=>WalletLibrary.id(WalletLibrary.create(localStorage).active()));
  assert.notEqual(first,second);
  await page.locator('[data-nav=receive]').click();assert.equal(await page.locator('[data-coin]').count(),0);
  await page.locator('.wallets-shortcut').click();
  await page.locator(`.saved-wallet:has([data-open-wallet="${first}"]) > summary`).click();
  await page.locator(`[data-open-wallet="${first}"]`).click();await page.locator('[data-overview-coin=doge]').waitFor();
  assert.equal(await page.locator('[data-overview-coin]').count(),2,'Switching retains the first wallet selection');
  // Cross-tab changes to this wallet update the picker, not a different wallet.
  await page.evaluate(first=>{
    const key='corevault.hidden-coins.v2.'+first;
    localStorage.setItem(key,JSON.stringify(['pep','doge','ltc','shic','wht','btc']));
    window.dispatchEvent(new StorageEvent('storage',{key}));
  },first);
  await page.locator('#coin-empty').waitFor();
  // Saving preferences must succeed before a newly generated wallet is published.
  const before=await page.evaluate(()=>localStorage.getItem('corevault.wallets.v1'));
  await page.locator('.wallets-shortcut').click();await page.locator('#add-wallet').click();
  await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('corevault.hidden-coins.v2.'))throw Error('Fixture quota');return set.call(this,k,v);};});
  await page.locator('#ack').check();await page.locator('#submit-setup').click();await page.locator('#error').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('corevault.wallets.v1')),before);
  assert.equal(await page.locator('#recovery-words').count(),0);assert.deepEqual(errors,[]);await context.close();
  // An upgrade must preserve both explicit old selections and the old all-on default.
  for(const hidden of [null,['btc','doge']]){
    const legacy=await browser.newContext();await require('./empty_network.cjs')(legacy);const p=await legacy.newPage();
    await p.goto('http://localhost:8787/');await p.evaluate(hidden=>{
      const recipe=WalletEngine.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
      WalletLibrary.create(localStorage).save(WalletEngine.unprotected(crypto,recipe),'Old wallet');
      if(hidden)localStorage.setItem('corevault.hidden-coins.v1',JSON.stringify(hidden));
    },hidden);
    await p.reload();await p.locator('.holdings').waitFor();
    assert.equal(await p.locator('[data-overview-coin]').count(),hidden?4:6);
    await selectCoins(p,['doge']);await p.reload();await p.locator('[data-overview-coin=doge]').waitFor();
    assert.equal(await p.locator('[data-overview-coin]').count(),hidden?5:6);await legacy.close();
  }
  console.log('PASS: no coins on fresh install/new wallets, explicit DOGE opt-in, per-wallet persistence/switching, legacy selection preservation, cross-tab update and save-failure guard.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
