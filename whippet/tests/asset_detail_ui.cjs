// Disposable public seed, synthetic balances/quotes; no sockets or broadcasts.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
 const accounts=E.accounts(ethers,recipe);
 await context.addInitScript(vault=>{
  if(!localStorage.getItem('whippet.dev.encrypted.v1'))localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
  for(const coin of ['bonc','cat','flop','jkc','lky'])localStorage.setItem('corevault.legacy-'+coin+'.v1','true');
  localStorage.setItem('corevault.connections.v1',JSON.stringify(Object.fromEntries(['bonc','cat','flop','jkc','lky'].map(c=>[c,'wss://'+c+'.fixture/']))));
  window.__amounts={btc:0n,wht:633944408796438702n};window.__calls={};window.__priceFail=false;
  window.fetch=async url=>{
   if(__priceFail)return new Response('{}',{status:429});
   if(String(url).includes('coingecko'))return new Response(JSON.stringify(Object.fromEntries(new URL(url).searchParams.get('ids').split(',').map(id=>[id,{usd:2,last_updated_at:Math.floor(Date.now()/1000)}]))));
   if(String(url).includes('api.kraken.com'))return new Response(JSON.stringify({error:[],result:{PEPUSD:{c:['2']},USDTZUSD:{c:['.5']}}}));
   throw Error('Unexpected request');
  };
  window.WebSocket=class{constructor(){throw Error('Real network forbidden');}};
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){
   Object.defineProperty(window,'WalletNetwork',{value:N,configurable:true});
   N.onChange=fn=>{window.__notify=fn;};
   N.scan=async(coin,accounts)=>{
    __calls[coin]=(__calls[coin]||0)+1;const amount=__amounts[coin]??123456789n;
    return {coin,tip:800000,at:Date.now(),confirmed:amount,unconfirmed:0n,everUsed:[],feeRate:WalletTransactions.policy(coin).minRate,
     rows:accounts.map((account,i)=>({account,confirmed:i?0n:amount,unconfirmed:0n,history:[],utxos:[]}))};
   };
   N.spendable=async()=>[];N.client=()=>{throw Error('Broadcast forbidden');};
  }});
 },E.unprotected(webcrypto,recipe));
 await p.clock.install();await p.clock.pauseAt(new Date(Date.now()+100));await p.goto('http://localhost:8787/');
 await p.waitForFunction(()=>document.querySelector('[data-overview-coin=pep] .holding-balance')?.textContent==='1.23456789 PEP');
 for(const coin of Object.keys(E.NETWORKS)){
  const overview=await p.locator(`[data-overview-coin=${coin}] .holding-values > small`).innerText();
  await p.locator(`[data-overview-coin=${coin}]`).tap();await p.locator('#asset-name').waitFor();
  assert.equal(await p.locator('.asset-detail').getAttribute('data-asset'),coin);
  assert.equal(await p.locator('#asset-name').innerText(),E.NETWORKS[coin].name);
  assert.equal(await p.locator('.asset-summary > img').evaluate(i=>i.complete&&i.naturalWidth>0),true);
  const amount=coin==='btc'?0n:coin==='wht'?633944408796438702n:123456789n;
  assert.equal(await p.locator('#asset-balance').innerText(),T.formatDisplay(amount)+' '+E.NETWORKS[coin].ticker);
  assert.equal(await p.locator('#asset-worth').innerText(),overview==='*'?'Price unavailable':'≈ '+overview);
  assert.equal(await p.locator('#asset-send').isDisabled(),coin==='btc');
  assert.equal(await p.locator('[data-nav=wallet]').getAttribute('aria-current'),'page');
  assert.equal(await p.locator('#header-add-coins').isVisible(),false);
  await p.locator('#asset-receive').tap();await p.locator('#address').waitFor();
  assert.equal(await p.locator('#address').innerText(),accounts[coin].address);
  await p.goBack();await p.locator('#asset-name').waitFor();
  if(coin!=='btc'){
   await p.locator('#asset-send').tap();await p.locator('#send-form').waitFor();
   assert.equal(await p.locator('#send-selected-coin').getAttribute('data-coin'),coin);
   assert.equal(await p.locator('#send-address').inputValue(),'');
   await p.goBack();await p.locator('#asset-name').waitFor();
  }
  await p.locator('#asset-back').click();await p.locator('.holdings').waitFor();
 }
 await p.locator('[data-overview-coin=pep]').click();await p.locator('#asset-name').waitFor();
 for(const theme of ['dark','light']){
  await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(const width of [320,390,430]){
   await p.setViewportSize({width,height:844});
   const center=await p.locator('#main').evaluate(e=>{const b=e.getBoundingClientRect();return b.x+b.width/2;});
   for(const selector of ['.asset-summary > img','#asset-balance','#asset-worth']){
    const box=await p.locator(selector).boundingBox();assert.ok(Math.abs(box.x+box.width/2-center)<1);
   }
   assert.equal((await p.locator('.asset-summary > img').boundingBox()).width,88);
   const focus=await p.locator('.asset-focus').boundingBox(),header=await p.locator('.topbar').boundingBox(),nav=await p.locator('.bottom-navigation').boundingBox();
   assert.ok(Math.abs(focus.y+focus.height/2-(header.y+header.height+nav.y)/2)<1,'Asset group is vertically centered between header and navigation');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false,'No scrolling when asset details fit');
   for(const selector of ['#asset-receive','#asset-send'])assert.ok((await p.locator(selector).boundingBox()).height>=44);
  }
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:`/tmp/safecore-asset-detail-${theme}.png`});
 }
 // Short landscape screens scroll instead of clipping the centered group.
 await p.setViewportSize({width:640,height:360});
 await p.locator('#asset-send').scrollIntoViewIfNeeded();
 const shortSend=await p.locator('#asset-send').boundingBox(),shortNav=await p.locator('.bottom-navigation').boundingBox();
 assert.ok(shortSend.y+shortSend.height<=shortNav.y,'Send remains above navigation on short screens');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>scrollTo(0,0));
 // Shared live monitoring and stable controls, including hidden other assets.
 await p.evaluate(()=>{window.__receive=document.getElementById('asset-receive');__receive.focus();__amounts.pep=223456789n;__notify('pep');window.__beforeCalls=__calls.wht;});
 for(let i=0;i<3;i++)await p.clock.runFor(4001);
 assert.equal(await p.locator('#asset-balance').innerText(),'2.23456789 PEP');
 assert.equal(await p.locator('#asset-worth').innerText(),'≈ 8.94 USDT');
 assert.equal(await p.evaluate(()=>__receive===document.getElementById('asset-receive')&&document.activeElement===__receive),true);
 assert.equal(await p.evaluate(()=>__calls.wht>__beforeCalls),true);
 await p.evaluate(()=>__priceFail=true);await p.clock.runFor(305000);
 assert.match(await p.locator('#asset-price-age').innerText(),/Last known · \d+ minutes ago/);
 await p.evaluate(()=>{localStorage.setItem('corevault.hide-balances.v1','true');dispatchEvent(new StorageEvent('storage',{key:'corevault.hide-balances.v1'}));});
 assert.equal(await p.locator('#asset-balance .masked-balance').count(),1);
 assert.equal(await p.locator('#asset-worth .masked-balance').count(),1);
 assert.equal(await p.locator('#asset-price-age').isHidden(),true);
 assert.doesNotMatch(await p.locator('.asset-detail').innerText(),/2\.23456789|8\.94/);
 await p.reload();await p.locator('#asset-name').waitFor();assert.equal(await p.locator('#asset-name').innerText(),'Pepecoin');
 // Bottom Send is still a picker, never a leftover detail-screen selection.
 await p.locator('[data-nav=send]').click();assert.equal(await p.locator('#send-form').count(),0);
 await p.evaluate(()=>location.hash='#asset/not-a-coin');await p.locator('.holdings').waitFor();
 await p.evaluate(()=>location.hash='#asset/__proto__');await p.locator('.holdings').waitFor();
 await p.evaluate(()=>{localStorage.setItem('corevault.hidden-coins.v1',JSON.stringify(['pep']));location.hash='#asset/pep';});
 await p.locator('.holdings').waitFor();assert.equal(await p.locator('.asset-detail').count(),0);
 // Protected wallets must not retain visible amounts or usable actions on lock.
 const encrypted=await E.encrypt(webcrypto,recipe,'Public-fixture-password-123');
 await p.evaluate(v=>{localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));localStorage.removeItem('corevault.hidden-coins.v1');history.replaceState(null,'','#asset/pep');},encrypted);
 await p.reload();await p.locator('#asset-name').waitFor();assert.equal(await p.locator('#asset-receive').isDisabled(),true);assert.equal(await p.locator('#asset-send').isDisabled(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: all 18 asset details, centered large icons/amounts/values, direct Send/Receive, zero/unpriced/privacy/locked guards, price ages, live updates, stable focus, safe routes and narrow dark/light layouts.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
