// Public fixture, fake balances and isolated storage. Never real funds/network.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const b=await chromium.launch();try{
 const vault=E.unprotected(webcrypto,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
 const c=await b.newContext({viewport:{width:390,height:844},colorScheme:'dark'}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await c.addInitScript(v=>{
  if(!localStorage.getItem('whippet.dev.encrypted.v1'))localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));
  window.fetch=async()=>new Response(JSON.stringify({error:[],result:{PEPUSD:{c:['.01']},USDTZUSD:{c:['1']}}}));
  window.WebSocket=class{constructor(){throw Error('Real network forbidden');}};
  window.__calls=0;
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){Object.defineProperty(window,'WalletNetwork',{value:N});N.spendable=async()=>[];N.scan=async(coin,accounts)=>{
   __calls++;const confirmed=coin==='pep'?470900000000n:193992200111100n,unconfirmed=coin==='pep'?123450000n:0n;
   return {coin,at:Date.now(),complete:true,cached:false,tip:500,confirmed,unconfirmed,everUsed:[0],feeRate:1000000n,
    rows:accounts.map((account,i)=>({account,checked:true,confirmed:i?0n:confirmed,unconfirmed:i?0n:unconfirmed,history:[],utxos:[]}))};
  };}});
 },vault);
 await p.clock.install();await p.clock.pauseAt(new Date());await p.goto('http://localhost:8787/#wallet');
 await p.waitForFunction(()=>document.querySelector('[data-overview-coin="pep"] .holding-balance')?.textContent.includes('4,710.2345'));
 const stored=await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1'));
 const settings=p.locator('[data-nav="security"]');assert.equal(await settings.innerText(),'Settings');assert.equal(await settings.locator('[data-icon="settings"] svg circle').count(),1);
 await settings.click();assert.equal(await p.locator('h1').innerText(),'Settings');assert.equal(await p.locator('#hide-balances').isChecked(),false);
 await p.locator('#hide-balances').check();await p.locator('[data-nav="wallet"]').click();
 const hidden=async()=>{
  await p.locator('#wallet-worth .masked-balance').waitFor();
  assert.equal(await p.locator('.masked-balance').count(),7);
  assert.doesNotMatch(await p.locator('#main').innerHTML(),/4,710\.2345|1,939,922\.001111|1\.2345|47\.10/,'No actual holdings in text, attributes or accessibility labels');
  assert.equal(await p.locator('[data-overview-coin="pep"] .holding-status').innerText(),'Pending');
 };
 await hidden();const calls=await p.evaluate(()=>__calls);await p.clock.runFor(8000);assert.ok(await p.evaluate(()=>__calls)>calls,'Hidden balances keep refreshing');await hidden();
 await p.reload();await p.locator('.holdings').waitFor();await hidden();
 await p.screenshot({path:'/tmp/safecore-hidden-balances.png'});
 await p.locator('[data-nav="send"]').click();assert.match(await p.locator('[data-send-coin="pep"]').innerText(),/•••• PEP/);
 await p.locator('[data-send-coin="pep"]').click();await p.locator('#send-amount').fill('12.34');assert.equal(await p.locator('#send-amount').inputValue(),'12.34','Explicit payment amounts remain visible');
 const other=await c.newPage();await other.goto('http://localhost:8787/#security');assert.equal(await other.locator('#hide-balances').isChecked(),true);
 await other.locator('#hide-balances').uncheck();await p.waitForFunction(()=>document.querySelector('[data-send-coin="pep"]').textContent.includes('4,710.2345'));
 assert.equal(await p.locator('#send-amount').inputValue(),'12.34','Cross-tab preference changes preserve the send draft');
 await p.locator('[data-nav="wallet"]').click();assert.match(await p.locator('#wallet-worth').innerText(),/47\.10/);
 assert.equal(await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')),stored,'Preference never alters wallet data');
 await settings.click();await p.screenshot({path:'/tmp/safecore-settings.png'});
 await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='corevault.hide-balances.v1')throw Error('fixture quota');return original.call(this,k,v);};});
 await p.locator('#hide-balances').click();assert.equal(await p.locator('#hide-balances').isChecked(),false,'Failed save restores the actual preference');
 assert.deepEqual(errors,[]);console.log('PASS: Settings gear, hidden totals/holdings/pending/Send balances, no DOM leaks, polling/reload persistence, cross-tab draft preservation, visible payment amounts and failed-save rollback.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
