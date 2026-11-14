// Disposable generated wallets only; never prints their recovery words.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('./browser-helper.cjs');
const password='Disposable-recovery-password-123';
(async()=>{const browser=await chromium.launch();try{
  async function setup(){
    const context=await browser.newContext({viewport:{width:360,height:800},acceptDownloads:true});
    await require('./empty_network.cjs')(context);const page=await context.newPage();
    await page.goto('http://localhost:8787/#setup');
    await page.locator('#use-passphrase').check();await page.locator('#passphrase').fill('Public-fixture-passphrase');
    await page.locator('#password-lock').check();await page.locator('#password').fill(password);await page.locator('#confirm').fill(password);
    await page.locator('#ack').check();await page.locator('#submit-setup').click();await page.locator('#recovery-copy-yes').waitFor();
    return {context,page};
  }
  async function choose(page){await page.locator('#recovery-copy-yes').click();}
  async function fill(page){await page.locator('#recovery-copy-password').fill(password);await page.locator('#recovery-copy-confirm').fill(password);}
  async function verify(page,raw){
    assert.equal(await page.evaluate(async({raw,password})=>{
      const copy=JSON.parse(raw),saved=JSON.parse(localStorage.getItem('whippet.dev.encrypted.v1'));
      const restored=WalletEngine.validateRecipe(ethers,await WalletEngine.decrypt(crypto,copy,password));
      const original=await WalletEngine.decrypt(crypto,saved,password);
      let rejected=false;try{await WalletEngine.decrypt(crypto,copy,'Incorrect-password');}catch{rejected=true;}
      const addresses=WalletEngine.accounts(ethers,restored),expected=WalletEngine.accounts(ethers,original);
      return rejected&&restored.mnemonic===original.mnemonic&&restored.passphrase===original.passphrase
        &&['pep','btc','doge','ltc','shic','wht'].every(c=>addresses[c].address===expected[c].address)
        &&!raw.includes(original.mnemonic)&&!raw.includes(password)&&!raw.includes(original.passphrase)
        &&!JSON.stringify(localStorage).includes(password)&&!JSON.stringify(localStorage).includes(original.mnemonic);
    },{raw,password}),true,'Portable encrypted copy restores every coin and passphrase, without plaintext storage');
  }
  {
    const {context,page}=await setup();let downloads=0;page.on('download',()=>downloads++);
    await page.locator('#finish').click();await page.locator('#coin-empty').waitFor();assert.equal(downloads,0);
    assert.ok(await page.evaluate(()=>localStorage.getItem('corevault.wallets.v1')));await context.close();
  }
  {
    const {context,page}=await setup();await choose(page);
    await page.locator('#recovery-copy-password').fill(password);await page.locator('#recovery-copy-confirm').fill(password+'x');
    await page.locator('#save-recovery-copy').click();await page.locator('#error').waitFor({state:'visible'});
    assert.match(await page.locator('#error').innerText(),/do not match/);
    await fill(page);const downloadPromise=page.waitForEvent('download');await page.locator('#save-recovery-copy').click();
    const download=await downloadPromise,raw=fs.readFileSync(await download.path(),'utf8');await verify(page,raw);
    await page.locator('#coin-empty').waitFor();await context.close();
  }
  {
    const {context,page}=await setup();await choose(page);
    await page.evaluate(()=>{window.__copies=[];window.__fail=true;window.SafeCorePlatform={exportRecoveryCopy:async raw=>{if(__fail)throw Error('Fixture picker cancelled');__copies.push(raw);}};});
    await fill(page);await page.locator('#save-recovery-copy').click();await page.locator('#error').waitFor({state:'visible'});
    assert.match(await page.locator('#error').innerText(),/cancelled/);assert.equal(await page.locator('#recovery-copy-password').inputValue(),'');
    await page.evaluate(()=>window.__fail=false);await fill(page);await page.locator('#save-recovery-copy').click();
    await page.locator('#coin-empty').waitFor();const copies=await page.evaluate(()=>__copies);assert.equal(copies.length,1);await verify(page,copies[0]);await context.close();
  }
  for(const cancel of ['skip','background']){
    const {context,page}=await setup();await choose(page);
    await page.evaluate(()=>{
      window.__copies=[];window.SafeCorePlatform={exportRecoveryCopy:async raw=>__copies.push(raw)};
      const derive=crypto.subtle.deriveKey.bind(crypto.subtle);
      crypto.subtle.deriveKey=async(...args)=>{await new Promise(resolve=>window.__resumeKdf=resolve);return derive(...args);};
      const encrypt=crypto.subtle.encrypt.bind(crypto.subtle);
      crypto.subtle.encrypt=async(...args)=>{const result=await encrypt(...args);window.__encryptionFinished=true;return result;};
    });
    await fill(page);await page.locator('#save-recovery-copy').click();await page.waitForFunction(()=>Boolean(window.__resumeKdf));
    if(cancel==='skip')await page.locator('#skip-recovery-copy').click();
    else await page.evaluate(()=>window.dispatchEvent(new Event('safecore-pause')));
    await page.evaluate(()=>__resumeKdf());await page.waitForFunction(()=>!document.getElementById('recovery-copy-form'));
    // Wait for the deliberately delayed KDF to finish; no native export may start.
    await page.waitForFunction(()=>window.__encryptionFinished===true);
    assert.equal(await page.evaluate(()=>__copies.length),0);await context.close();
  }
  console.log('PASS: opt-in/no-copy, password matching, encrypted download/native export, all-six-coin recovery, cancelled picker retry, no saved password, cancellation/background guards.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
