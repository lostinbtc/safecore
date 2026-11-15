// Public seed, fake clock and synthetic observations; no mainnet access.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const vault=E.unprotected(webcrypto,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
 await context.addInitScript(vault=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
  window.__calls={};window.__amounts={pep:100,wht:50};window.__writes=0;
  const write=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(k.startsWith('corevault.balance.'))__writes++;return write.call(this,k,v);};
  window.fetch=async()=>new Response('{}');window.WebSocket=class{constructor(){throw Error('Real network forbidden');}};
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){
   Object.defineProperty(window,'WalletNetwork',{value:N,configurable:true});
   N.onChange=fn=>{window.__notify=fn;};
   N.scan=async(coin,accounts)=>{
    __calls[coin]=(__calls[coin]||0)+1;
    const value=BigInt(__amounts[coin]||0)*100000000n;
    return {coin,tip:800000,at:Date.now(),confirmed:value,unconfirmed:0n,everUsed:value?[0]:[],feeRate:1000000n,
     rows:accounts.map((account,i)=>({account,confirmed:i?0n:value,unconfirmed:0n,history:[],utxos:[]}))};
   };
  }});
 },vault);
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install();await p.clock.pauseAt(new Date(Date.now()+100));
 await p.goto('http://localhost:8787/#wallet');
 await p.waitForFunction(()=>document.querySelector('[data-overview-coin=pep] .holding-balance')?.textContent==='100 PEP');
 await p.waitForFunction(()=>__writes===13);
 await p.evaluate(()=>{
  window.__row=document.querySelector('[data-overview-coin=pep]');window.__rescan=document.getElementById('rescan');
  __row.focus();window.__mutations=0;new MutationObserver(r=>__mutations+=r.length).observe(document.getElementById('main'),{subtree:true,childList:true,characterData:true,attributes:true});
  window.__baseline={writes:__writes,calls:__calls.pep};
 });
 await p.clock.runFor(4001);await p.waitForFunction(()=>__calls.pep>__baseline.calls);
 assert.equal(await p.evaluate(()=>__writes),await p.evaluate(()=>__baseline.writes),'Unchanged polls do not rewrite caches');
 assert.equal(await p.evaluate(()=>__mutations),0,'Unchanged overview causes no DOM mutations');
 assert.equal(await p.evaluate(()=>document.activeElement===__row&&document.getElementById('rescan')===__rescan),true);
 // A server push bypasses waiting for the next periodic cycle. Publication
 // retains the existing fresh matching-observation guard, not an extra UI delay.
 await p.evaluate(()=>{__amounts.pep=101;__notify('pep');__baseline.calls=__calls.pep;});
 await p.clock.runFor(251);await p.waitForFunction(()=>__calls.pep>__baseline.calls);
 assert.equal(await p.locator('[data-overview-coin=pep] .holding-balance').innerText(),'100 PEP');
 await p.clock.runFor(4001);
 await p.waitForFunction(()=>document.querySelector('[data-overview-coin=pep] .holding-balance').textContent==='101 PEP');
 assert.equal(await p.evaluate(()=>document.querySelector('[data-overview-coin=pep]')===__row),true,'Changed balance patches the same row');
 assert.equal(await p.evaluate(()=>__writes>__baseline.writes),true,'Deposit is persisted immediately on publication');
 // Hide WHT from the overview: used/hidden assets still receive fallback polls.
 await p.locator('#header-add-coins').click();await p.locator('[data-show-coin=wht]').uncheck();await p.locator('[data-nav=wallet]').click();
 await p.evaluate(()=>{__amounts.wht=51;window.__whtCalls=__calls.wht;});
 for(let i=0;i<3;i++)await p.clock.runFor(4001);
 assert.ok(await p.evaluate(()=>__calls.wht>__whtCalls));
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('corevault.balance.'+WalletLibrary.id(JSON.parse(localStorage.getItem('whippet.dev.encrypted.v1')))+'.wht')).confirmed),'5100000000');
 assert.equal(await p.locator('[data-overview-coin=wht]').count(),0);
 // Use natural content height: a short list must fit without a scrollbar;
 // a long list or short viewport must remain scrollable, never clipped.
 await p.locator('#header-add-coins').click();
 for(const coin of Object.keys(E.NETWORKS)){
  const choice=p.locator(`[data-show-coin=${coin}]`);
  if(await choice.count())await choice.setChecked(['pep','doge','ltc','shic','wht','btc'].includes(coin));
 }
 await p.locator('[data-nav=wallet]').click();await p.locator('.holdings').waitFor();
 for(const height of [780,844]){
  await p.setViewportSize({width:390,height});
  const layout=await p.evaluate(()=>({viewport:innerHeight,page:document.documentElement.scrollHeight,parts:Object.fromEntries(['.topbar','#main','.holdings','.overview-actions','.app-footer','.app-shell'].map(s=>[s,document.querySelector(s).getBoundingClientRect().height])),rows:document.querySelectorAll('[data-overview-coin]').length}));
  assert.ok(layout.page<=height,'Six assets fit without forced scrolling: '+JSON.stringify(layout));
 }
 await p.setViewportSize({width:390,height:420});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight>innerHeight),true,'Small screens retain scrolling');
 await p.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
 const last=await p.locator('[data-overview-coin]').last().boundingBox(),rescan=await p.locator('#rescan').boundingBox();
 assert.ok(last.y+last.height<=rescan.y,'Last asset can scroll clear of fixed controls');
 await p.setViewportSize({width:390,height:844});
 await p.locator('#header-add-coins').click();
 for(const coin of Object.keys(E.NETWORKS)){
  const choice=p.locator(`[data-show-coin=${coin}]`);if(await choice.count())await choice.check();
 }
 await p.locator('[data-nav=wallet]').click();await p.locator('.holdings').waitFor();
 assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight>innerHeight),true,'Long asset lists retain scrolling');
 assert.deepEqual(errors,[]);
 console.log('PASS: stable overview nodes/focus, no unchanged DOM or cache writes, push and fallback deposits, hidden-asset monitoring.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
