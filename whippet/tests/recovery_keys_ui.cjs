const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{
 const recipe=E.recipe(ethers,E.createPhrase(ethers,webcrypto,12),'Temporary passphrase');
 const plain=E.unprotected(webcrypto,recipe),sealed=await E.encrypt(webcrypto,recipe,'Disposable-password');
 const other=E.unprotected(webcrypto,E.recipe(ethers,E.createPhrase(ethers,webcrypto,24)));
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(context);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8787/');
  const ids=await page.evaluate(vaults=>{const lib=WalletLibrary.create(localStorage);vaults.forEach((v,i)=>lib.save(v,['Disposable recovery test','Protected test','Different test'][i]));const ids=vaults.map(v=>WalletLibrary.id(v));lib.activate(ids[0]);return ids;},[plain,sealed,other]);
  await page.goto('http://localhost:8787/#security');await page.reload();
  assert.equal(await page.locator('#password-protection').evaluate(el=>el.previousElementSibling.matches('.page-head')&&el.nextElementSibling.matches('.theme-control')),true,'Keep protection status and Appearance adjacent');
  assert.equal(await page.locator('.settings-actions > #wallet-recovery-keys + #wallet-information').count(),1,'Recovery keys sits directly above Information in Settings');
  await page.evaluate(()=>{window.__copies=[];window.__authCalls=0;window.SafeCorePlatform={authenticateWalletAction:async()=>{__authCalls++;},copyRecoveryValue:async value=>{__copies.push(value);}};});
  const show=async(password)=>{
    await page.locator('#keys-ack').check();if(password)await page.locator('#seed-password').fill(password);
    await page.locator('#keys-show').click();await page.locator('.recovery-key-row').first().waitFor();
  };
  await page.locator('#wallet-recovery-keys').click();
  assert.equal(await page.locator('.recovery-key-row').count(),0);
  await page.locator('#keys-show').click();assert.equal(await page.evaluate(()=>__authCalls),0,'Consent required');
  await show();assert.equal(await page.evaluate(()=>__authCalls),1);
  assert.equal(await page.locator('#keys-coin option').count(),18,'Includes disabled legacy assets');
  assert.equal(await page.locator('.recovery-key-row').count(),10);
  const storage=await page.evaluate(()=>JSON.stringify([localStorage.getItem('corevault.wallets.v1'),localStorage.getItem('whippet.dev.encrypted.v1')]));
  for(const coin of Object.keys(E.NETWORKS)){
    await page.locator('#keys-coin').selectOption(coin);
    const expected=E.recoveryKeys(ethers,recipe,coin,0,10);
    const displayed=await page.locator('.recovery-key-row code').allTextContents();
    assert.ok(displayed[0]===expected[0].address&&displayed[1]===expected[0].publicKey&&displayed[2]===expected[0].wif,'Correct current-wallet coin keys');
    await page.locator('[data-key-row="0"][data-key-field="wif"]').click();
    assert.ok(await page.evaluate(value=>__copies.at(-1)===value,expected[0].wif),'Per-key copy');
    assert.equal(await page.evaluate(value=>JSON.stringify(localStorage).includes(value),expected[0].wif),false,'Never store private-key lists');
  }
  await page.locator('#keys-copy-all').click();
  const expectedAll=E.recoveryKeys(ethers,recipe,'ltc',0,200).map(r=>r.wif).join('\n');
  assert.ok(await page.evaluate(value=>__copies.at(-1)===value,expectedAll),'Copy all uses selected coin only');
  await page.locator('#keys-next').click();assert.equal(await page.locator('#keys-page').innerText(),'11–20 of 200');
  await page.locator('#keys-prev').click();assert.equal(await page.locator('#keys-prev').isDisabled(),true);
  for(const scheme of ['dark','light']){
    await page.emulateMedia({colorScheme:scheme});
    for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');}
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/safecore-disposable-recovery-keys.png',fullPage:true});
  assert.ok(await page.evaluate(()=>JSON.stringify([localStorage.getItem('corevault.wallets.v1'),localStorage.getItem('whippet.dev.encrypted.v1')]))===storage,'Viewing/copying leaves wallet storage untouched');
  await page.evaluate(()=>{SafeCorePlatform.copyRecoveryValue=async()=>{throw Error('denied');};});
  await page.locator('[data-key-row="0"][data-key-field="wif"]').click();assert.match(await page.locator('#error').innerText(),/Clipboard unavailable/);
  await page.locator('#keys-hide').click();assert.equal(await page.locator('.recovery-key-row').count(),0);
  await show();
  // Inspect in the click's own JavaScript task: no chance for hashchange to
  // hide a privacy regression or for host scheduling to decide the outcome.
  assert.equal(await page.evaluate(()=>{document.getElementById('keys-back').click();return document.querySelectorAll('.recovery-key-row').length;}),0,'Back clears keys synchronously');
  await page.locator('#wallet-recovery-keys').waitFor();
  await page.locator('#wallet-recovery-keys').click();assert.equal(await page.locator('.recovery-key-row').count(),0);
  for(const selector of ['[data-nav="security"]','.wallets-shortcut']){
    await show();
    assert.equal(await page.evaluate(selector=>{document.querySelector(selector).click();return document.querySelectorAll('.recovery-key-row').length;},selector),0,'Navigation links clear keys synchronously');
    await page.waitForFunction(()=>!document.getElementById('keys-show'));
    await page.evaluate(()=>location.hash='#recovery-keys');await page.locator('#keys-show').waitFor();
    assert.equal(await page.locator('.recovery-key-row').count(),0,'Returning requires authentication again');
  }
  await show();await page.evaluate(()=>window.dispatchEvent(new Event('safecore-pause')));assert.equal(await page.locator('.recovery-key-row').count(),0);
  await page.clock.install();await show();await page.clock.fastForward(120100);assert.equal(await page.locator('.recovery-key-row').count(),0,'Hard expiry even without navigation');
  // Fresh page for password and interrupted authentication checks.
  await page.evaluate(id=>WalletLibrary.create(localStorage).activate(id),ids[1]);await page.reload();
  await page.evaluate(()=>{window.SafeCorePlatform={authenticateWalletAction:async()=>{}};});
  await page.locator('#keys-ack').check();await page.locator('#seed-password').fill('wrong');await page.locator('#keys-show').click();
  await page.waitForFunction(()=>!document.getElementById('error').hidden);assert.equal(await page.locator('.recovery-key-row').count(),0);
  await show('Disposable-password');
  await page.locator('#keys-hide').click();
  await page.evaluate(()=>{SafeCorePlatform.authenticateWalletAction=()=>new Promise(resolve=>window.__finishAuth=resolve);});
  await page.locator('#keys-ack').check();await page.locator('#seed-password').fill('Disposable-password');await page.locator('#keys-show').click();
  await page.locator('#keys-back').click();await page.evaluate(()=>__finishAuth());assert.equal(await page.locator('.recovery-key-row').count(),0,'Late authentication cannot reveal after navigation');
  await page.evaluate(id=>WalletLibrary.create(localStorage).activate(id),ids[2]);await page.reload();await page.locator('#wallet-recovery-keys').click();await show();
  const otherAddress=E.accounts(ethers,other.recipe,0).bel.address;
  assert.ok(await page.locator('.recovery-key-row code').first().innerText()===otherAddress,'Wallet switching derives only the new wallet');
  assert.deepEqual(errors,[]);
  console.log('PASS: all coins, consent/auth/password, copy/list, no persistence, wallet isolation, expiry/background/navigation, clipboard failure and compact layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
