// Disposable public seed fixtures only. No screenshots, live RPC or real sends.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),K=require('../www/komodo.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const old='legal winner thank year wave sausage worth useful legal winner thank yellow';
(async()=>{const browser=await chromium.launch();try{for(const scenario of ['send','protected','pinned','reuse','disable','cancel','expiry','review-expiry','background']){
 console.log('Komodo UI:',scenario);
 const password='Disposable-test-password',extra=scenario==='protected'?'extra fixture phrase':'',recipe=E.recipe(ethers,phrase,extra);
 const vault=scenario==='protected'?await E.encrypt(webcrypto,recipe,password):E.unprotected(webcrypto,recipe);
 const fingerprint=await K.verifyDestination(webcrypto,vault,password,phrase,extra),key=K.key(old,fingerprint);
 const funding={version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:'',sequence:0xffffffff}],outputs:Array.from({length:2},()=>({value:300000000n,script:T.script('pep',key.address)})),locktime:0};
 const raw=ethers.utils.hexlify(T.serialize(funding)).slice(2),txid=T.parse(raw).txid;
 const c=await browser.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await c.addInitScript(({vault,raw,txid,address})=>{
  if(!localStorage.getItem('whippet.dev.encrypted.v1'))localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
  window.fetch=async()=>new Response(JSON.stringify({error:[],result:{}}));window.WebSocket=class{constructor(){throw Error('No real network in recovery tests');}};
  window.__sent=[];window.__source=[];window.__confirmed=false;window.__holdSource=false;
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){Object.defineProperty(window,'WalletNetwork',{value:N});
   N.scan=async(coin,accounts)=>({coin,tip:500,at:Date.now(),everUsed:[0],confirmed:0n,unconfirmed:0n,feeRate:1000000n,rows:accounts.map(account=>({account,checked:true,confirmed:0n,unconfirmed:0n,history:account.index?[]:[{tx_hash:txid,height:499}],utxos:[]}))});
   N.sweepSource=async(coin,source)=>{if(coin!=='pep'||source!==address)throw Error('Wrong Komodo source');__source.push({coin,source});if(__holdSource)await new Promise(resolve=>window.__finishSource=resolve);return {snapshot:{tip:500,feeRate:1000000n},utxos:[0,1].map(pos=>({index:0,address,txid,pos,height:499,value:300000000n,raw}))};};
   N.checkInputs=async()=>{};N.confirmation=async()=>({seen:true,confirmations:__confirmed?1:0});
   N.client=()=>({call:async(method,params)=>{if(method!=='blockchain.transaction.broadcast')throw Error('Unexpected call');__sent.push(params[0]);return WalletTransactions.parse(params[0]).txid;}});
  }});
 },{vault,raw,txid,address:key.address});
 await p.clock.install();await p.goto('http://localhost:8787/');
 if(scenario==='protected'){await p.locator('#lock').click();await p.locator('#unlock-password').fill(password);await p.locator('#unlock-submit').click();await p.waitForFunction(()=>document.documentElement.dataset.walletState==='unlocked');}
 const choose=async coin=>{await p.locator('[data-nav=receive]').click();await p.locator('#receive-coin').click();await p.locator(`[data-coin=${coin}]`).click();await p.locator('#sweep-open').click();await p.locator('#sweep-key').waitFor();};
 await choose('pep');assert.equal(await p.locator('#komodo-open').count(),0);
 await p.evaluate(()=>location.hash='#komodo-sweep');await p.locator('#komodo-recovery-enabled').waitFor();assert.equal(await p.locator('#komodo-recovery-enabled').isChecked(),false);assert.equal(await p.locator('#komodo-phrase').count(),0);
 await p.locator('#komodo-recovery-enabled').check();await choose('wht');assert.equal(await p.locator('#komodo-open').count(),0);
 await p.evaluate(()=>location.hash='#komodo-sweep');await p.locator('#komodo-recovery-enabled').waitFor();assert.equal(await p.locator('#komodo-phrase').count(),0,'Whippet direct route is blocked');
 await p.reload();if(scenario==='protected'){await p.locator('#unlock-security').click();await p.locator('#unlock-password').fill(password);await p.locator('#unlock-submit').click();await p.waitForFunction(()=>document.documentElement.dataset.walletState==='unlocked');}
 await p.locator('[data-nav=security]').click();await p.locator('#komodo-recovery-enabled').waitFor();assert.equal(await p.locator('#komodo-recovery-enabled').isChecked(),true);
 await p.locator('[data-nav=receive]').click();await p.locator('#receive-coin').click();await p.locator('[data-coin=pep]').click();
 if(scenario==='pinned')await p.locator('#reuse-first').check();
 await p.locator('#sweep-open').click();await p.locator('#komodo-open').click();await p.locator('#verify-wallet-phrase').waitFor();assert.equal(await p.locator('#komodo-phrase').count(),0);
 await p.locator('#verify-wallet-phrase').fill('aban');await p.getByRole('button',{name:'Use recovery word abandon',exact:true}).click();assert.equal(await p.locator('#verify-wallet-phrase').inputValue(),'abandon ');
 await p.locator('#verify-wallet-phrase').fill(old);await p.locator('#komodo-backup-ack').check();
 if(scenario==='protected')await p.locator('#verify-wallet-password').fill(password);
 await p.locator('#verify-komodo-wallet').click();await p.locator('#error').waitFor({state:'visible'});assert.equal(await p.locator('#komodo-phrase').count(),0);
 await p.locator('#verify-wallet-phrase').fill(phrase);await p.locator('#verify-wallet-passphrase').fill(extra);
 if(scenario==='protected'){await p.locator('#verify-wallet-password').fill('Wrong-fixture-password');await p.locator('#verify-komodo-wallet').click();await p.waitForFunction(()=>document.getElementById('error').textContent.includes('Incorrect password'));assert.equal(await p.locator('#komodo-phrase').count(),0);await p.locator('#verify-wallet-password').fill(password);}
 await p.locator('#verify-komodo-wallet').click();await p.locator('#komodo-phrase').waitFor();assert.equal(await p.locator('#verify-wallet-phrase').count(),0);
 assert.match(await p.locator('#main').innerText(),/Do not reuse/);assert.match(await p.locator('#main').innerText(),/other coins and HD accounts are not swept/i);
 await p.locator('#komodo-phrase').fill('lega');await p.getByRole('button',{name:'Use recovery word legal',exact:true}).click();assert.equal(await p.locator('#komodo-phrase').inputValue(),'legal ');
 await p.locator('#komodo-phrase').fill(Array(12).fill('abandon').join(' '));assert.equal(await p.locator('#review-komodo-sweep').isDisabled(),false,'Legacy phrases do not use the HD checksum gate');
 await p.locator('#komodo-phrase').fill(scenario==='reuse'?phrase:old);
 if(scenario==='expiry'){for(let i=0;i<10;i++){await p.clock.runFor(60001);await p.evaluate(()=>document.dispatchEvent(new Event('pointerdown')));}await p.locator('#verify-wallet-phrase').waitFor();assert.equal(await p.locator('#verify-wallet-phrase').inputValue(),'');}
 else if(scenario==='background'){
  await p.evaluate(()=>window.dispatchEvent(new Event('safecore-pause')));assert.equal(await p.locator('#komodo-phrase').count(),0);
  await p.evaluate(()=>window.dispatchEvent(new Event('safecore-resume')));await choose('pep');await p.locator('#komodo-open').click();await p.locator('#verify-wallet-phrase').waitFor();
 }else{
  if(scenario==='cancel')await p.evaluate(()=>__holdSource=true);
  await p.locator('#review-komodo-sweep').click();
  if(scenario==='reuse'){await p.locator('#error').waitFor({state:'visible'});assert.match(await p.locator('#error').innerText(),/Do not reuse/);assert.equal(await p.evaluate(()=>__source.length),0);}
  else if(scenario==='cancel'){
   await p.waitForFunction(()=>typeof __finishSource==='function');await p.locator('[data-nav=wallet]').click();await p.locator('.holdings').waitFor();await p.evaluate(()=>__finishSource());assert.equal(await p.locator('#broadcast-send').count(),0);
   await choose('pep');await p.locator('#komodo-open').click();await p.locator('#verify-wallet-phrase').waitFor();
  }else{
   await p.getByRole('heading',{name:'Review sweep',exact:true}).waitFor();assert.equal(await p.locator('#komodo-phrase').count(),0);
   assert.match(await p.locator('#komodo-review-warning').innerText(),/empties the displayed old Komodo PEP address/);
   assert.match(await p.locator('#sweep-fee-estimate').innerText(),/0.004275 PEP/);
   if(scenario==='review-expiry'){await p.clock.runFor(90001);await p.locator('#verify-wallet-phrase').waitFor();}
   else{
    if(scenario==='disable')await p.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('corevault.komodo-recovery.'))localStorage.removeItem(k);});
    await p.locator('#send-ack').check();if(scenario==='protected')await p.locator('#send-password').fill(password);
    await p.locator('#broadcast-send').click();
    if(scenario==='disable'){await p.locator('#error').waitFor({state:'visible'});assert.match(await p.locator('#error').innerText(),/disabled|expired/);}
    else{
     await p.getByRole('heading',{name:'Sweep submitted',exact:true}).waitFor();const rawSent=await p.evaluate(()=>__sent[0]),decoded=T.parse(rawSent);
     const destination=E.accounts(ethers,recipe,scenario==='pinned'?0:1).pep.address;
     assert.equal(decoded.inputs.length,2);assert.equal(decoded.outputs.length,1);assert.equal(decoded.outputs[0].script,T.script('pep',destination));assert.equal(decoded.outputs[0].value,599572500n);
     await p.evaluate(()=>__confirmed=true);await p.clock.runFor(4001);await p.getByRole('heading',{name:'Sweep confirmed',exact:true}).waitFor();
    }
   }
  }
 }
 assert.equal(await p.evaluate(()=>__sent.length),['send','protected','pinned'].includes(scenario)?1:0);
 assert.equal(await p.evaluate(old=>JSON.stringify({...localStorage}).includes(old),old),false);
 assert.equal(await p.evaluate(vault=>localStorage.getItem('whippet.dev.encrypted.v1')===JSON.stringify(vault),vault),true);
 if(scenario==='send'){
  const nextId=await p.evaluate(()=>{const lib=WalletLibrary.create(localStorage),recipe=WalletEngine.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),next=WalletEngine.unprotected(crypto,recipe);lib.save(next,'Second disposable wallet');return WalletLibrary.id(next);});
  await p.reload();await p.locator('[data-nav=security]').click();await p.locator('#komodo-recovery-enabled').waitFor();assert.equal(await p.locator('#komodo-recovery-enabled').isChecked(),false,'Opt-in must not carry over to another wallet');
  assert.equal(await p.evaluate(()=>WalletLibrary.id(WalletLibrary.create(localStorage).active())),nextId,'Reload must preserve the selected second wallet');
 }
 for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);await c.close();
}console.log('PASS: opt-in/per-wallet persisted gate, PEP-only controls/routes, backup/password checks, isolated word entry, no seed reuse, full sweep review, pinned/next destinations, confirmation, disable/expiry/cancel/background guards and no old-seed storage.');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
