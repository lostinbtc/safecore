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
 const choose=async coin=>{await p.locator('[data-nav=receive]').click();await p.locator(`[data-coin=${coin}]`).click();await p.locator('#sweep-open').waitFor();};
 await choose('pep');assert.equal(await p.locator('#komodo-open').count(),0);
 await p.evaluate(()=>location.hash='#komodo-sweep');await p.locator('#komodo-recovery-enabled').waitFor();assert.equal(await p.locator('#komodo-recovery-enabled').isChecked(),false);assert.equal(await p.locator('#komodo-phrase').count(),0);
 await p.locator('#komodo-recovery-enabled').check();await choose('wht');assert.equal(await p.locator('#komodo-open').count(),0);
 await p.evaluate(()=>location.hash='#komodo-sweep');await p.locator('#komodo-recovery-enabled').waitFor();assert.equal(await p.locator('#komodo-phrase').count(),0,'Whippet direct route is blocked');
 await p.reload();if(scenario==='protected'){await p.locator('#unlock-security').click();await p.locator('#unlock-password').fill(password);await p.locator('#unlock-submit').click();await p.waitForFunction(()=>document.documentElement.dataset.walletState==='unlocked');}
 await p.locator('[data-nav=security]').click();await p.locator('#komodo-recovery-enabled').waitFor();assert.equal(await p.locator('#komodo-recovery-enabled').isChecked(),true);
 await p.locator('[data-nav=receive]').click();await p.locator('#receive-coin').click();await p.locator('[data-coin=pep]').click();
 if(scenario==='pinned')await p.locator('#reuse-first').check();
 assert.equal(await p.locator('#sweep-open').evaluate(el=>el.nextElementSibling.id),'komodo-open');
 if(scenario==='send'){
  await p.screenshot({path:'/tmp/safecore-receive-komodo.png',fullPage:true});
  await p.locator('#sweep-open').click();await p.locator('#sweep-key').waitFor();assert.equal(await p.locator('#komodo-open').count(),0,'Komodo is no longer inside WIF sweep');
  await p.getByRole('link',{name:'Cancel',exact:true}).click();await p.locator('#komodo-open').waitFor();
 }
 await p.locator('#komodo-open').click();await p.locator('#restore-grid').waitFor();
 assert.equal(await p.locator('#verify-wallet-phrase').count(),0);
 assert.equal(await p.locator('#verify-wallet-password').count(),0);
 assert.equal(await p.locator('.komodo-scope').innerText(),'Pepecoin (PEP) only');
 assert.match(await p.locator('#komodo-sweep-form').innerText(),/Enter your old Komodo phrase exactly as backed up/);
 assert.equal(await p.locator('#komodo-recovery-explainer').innerText(),'The recovered Pepecoin will be controlled by this wallet’s new seed phrase. Your old Komodo Pepecoin address will be emptied by the sweep. Do not reuse the old Komodo seed.');
 assert.equal(await p.locator('#komodo-backup-ack + span').innerText(),'I have backed up this wallet’s new seed phrase and any extra passphrase.');
 const word=i=>p.locator('[data-restore-word="'+i+'"]');
 const done=async()=>{if(await p.locator('#restore-keyboard').isVisible())await p.locator('#restore-done').click();};
 if(scenario==='send'){
  await p.getByRole('link',{name:'Cancel',exact:true}).click();await p.locator('#komodo-open').waitFor();
  await p.locator('#komodo-open').click();await p.locator('#restore-grid').waitFor();
  await p.screenshot({path:'/tmp/safecore-komodo-empty.png',fullPage:true});
 }
 await word(0).fill('lega');await p.getByRole('button',{name:'Use recovery word legal',exact:true}).click();assert.equal(await word(0).inputValue(),'legal');
 await word(0).fill(Array(12).fill('abandon').join(' '));await done();
 assert.equal(await p.locator('#review-komodo-sweep').isDisabled(),false,'Legacy phrases do not use the HD checksum gate');
 await word(0).fill('UnlistedWord  '+Array(11).fill('e\u0301xample').join('\t'));await done();
 assert.equal(await p.locator('#komodo-phrase').inputValue(),'UnlistedWord  '+Array(11).fill('e\u0301xample').join('\t'),'Do not normalize legacy key material');
 assert.equal(await p.locator('#review-komodo-sweep').isDisabled(),false,'Words outside BIP39 are accepted');
 await word(0).fill(scenario==='reuse'?phrase:old);await done();
 if(scenario==='send'){
  await p.evaluate(()=>document.getElementById('komodo-sweep-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));
  assert.equal(await p.evaluate(()=>__source.length),0,'Acknowledgment required even if form validation is bypassed');
 }
 await p.locator('#komodo-backup-ack').check();
 if(scenario==='expiry'){
  await p.evaluate(()=>__holdSource=true);await p.locator('#review-komodo-sweep').click();
  await p.waitForFunction(()=>typeof __finishSource==='function');
  for(let i=0;i<10;i++){await p.clock.runFor(60001);await p.evaluate(()=>document.dispatchEvent(new Event('pointerdown')));}
  await p.locator('#restore-grid').waitFor();assert.equal(await word(0).inputValue(),'');
  await p.evaluate(()=>__finishSource());assert.equal(await p.locator('#broadcast-send').count(),0);
 }
 else if(scenario==='background'){
  await p.evaluate(()=>window.dispatchEvent(new Event('safecore-pause')));assert.equal(await p.locator('#komodo-phrase').count(),0);
  await p.evaluate(()=>window.dispatchEvent(new Event('safecore-resume')));await choose('pep');await p.locator('#komodo-open').click();await p.locator('#restore-grid').waitFor();assert.equal(await word(0).inputValue(),'');
 }else{
  if(scenario==='cancel')await p.evaluate(()=>__holdSource=true);
  await p.locator('#review-komodo-sweep').click();
  if(scenario==='reuse'){await p.locator('#error').waitFor({state:'visible'});assert.match(await p.locator('#error').innerText(),/Do not reuse/);assert.equal(await p.evaluate(()=>__source.length),0);}
  else if(scenario==='cancel'){
   await p.waitForFunction(()=>typeof __finishSource==='function');await p.locator('#restore-back').click();await p.locator('#komodo-open').waitFor();await p.evaluate(()=>__finishSource());assert.equal(await p.locator('#broadcast-send').count(),0);
   await p.locator('#komodo-open').click();await p.locator('#restore-grid').waitFor();
  }else{
   await p.getByRole('heading',{name:'Review sweep',exact:true}).waitFor();assert.equal(await p.locator('#komodo-phrase').count(),0);
   assert.match(await p.locator('#komodo-review-warning').innerText(),/empties the displayed old Komodo PEP address/);
   assert.match(await p.locator('#sweep-fee-estimate').innerText(),/0.004275 PEP/);
   if(scenario==='review-expiry'){await p.clock.runFor(90001);await p.locator('#restore-grid').waitFor();assert.equal(await word(0).inputValue(),'');}
   else{
    if(scenario==='disable')await p.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('corevault.komodo-recovery.'))localStorage.removeItem(k);});
    await p.locator('#send-ack').check();
    if(scenario==='protected'){
     await p.locator('#send-password').fill('Wrong-fixture-password');await p.locator('#broadcast-send').click();
     await p.waitForFunction(()=>document.getElementById('error').textContent.includes('Incorrect password'));
     assert.equal(await p.evaluate(()=>__sent.length),0);await p.locator('#send-password').fill(password);
    }
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
}console.log('PASS: opt-in/per-wallet gate, PEP-only routes, acknowledgment/password checks, exact-text predictive entry, no seed reuse, full review, pinned/next destinations, confirmation, disable/expiry/cancel/background guards and no old-seed storage.');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
