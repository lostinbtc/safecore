// Public disposable seed, fake clock and providers; no network or broadcasts.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),owner=E.accounts(ethers,recipe).btc;
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:T.COIN,script:T.script('btc',owner.address)}],locktime:0})).slice(2);
 await context.addInitScript(({vault,raw,txid})=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
  const cold=localStorage.getItem('price-outage-fixture')==='1';
  window.__prices={kraken:cold?'fail':'ok',cg:cold?'fail':'ok',usd:2};window.__priceCalls=[];window.__pep=1;
  window.fetch=async(url,options)=>{
   const cg=String(url).includes('coingecko'),provider=cg?'cg':'kraken',mode=__prices[provider];
   if(!cg&&!String(url).includes('api.kraken.com'))throw Error('Unexpected request');
   __priceCalls.push({provider,at:Date.now(),credentials:options.credentials,referrer:options.referrerPolicy});
   if(mode==='fail')return new Response('{}',{status:429});
   if(cg)return new Response(JSON.stringify(Object.fromEntries(new URL(url).searchParams.get('ids').split(',').map(id=>[id,{usd:__prices.usd,last_updated_at:Math.floor(Date.now()/1000)}]))));
   return new Response(JSON.stringify({error:[],result:{...(mode==='no-pep'?{}:{PEPUSD:{c:['2']}}),...(mode==='no-usdt'?{}:{USDTZUSD:{c:['.5']}})}}));
  };
  window.WebSocket=class{constructor(){throw Error('Real network forbidden');}};
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){
   Object.defineProperty(window,'WalletNetwork',{value:N,configurable:true});
   N.scan=async(coin,accounts)=>{
    const amount=BigInt(coin==='wht'?0:coin==='pep'?__pep:1)*100000000n;
    return {coin,tip:800000,at:Date.now(),everUsed:amount?[0]:[],confirmed:amount,unconfirmed:0n,feeRate:WalletTransactions.policy(coin).minRate,
     rows:accounts.map((account,i)=>({account,confirmed:i?0n:amount,unconfirmed:0n,history:coin==='btc'&&!i?[{tx_hash:txid,height:100}]:[],utxos:coin==='btc'&&!i?[{...account,value:amount,raw,txid,pos:0,height:100}]:[]}))};
   };
   N.spendable=async s=>s.rows.flatMap(r=>r.utxos);N.checkInputs=async()=>{};
   N.client=()=>({call:async method=>{if(method==='blockchain.relayfee')return .00001;throw Error('Broadcast/RPC forbidden');}});
  }});
 },{vault:E.unprotected(webcrypto,recipe),raw,txid:T.parse(raw).txid});
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
 await page.goto('http://localhost:8787/');await page.locator('#rescan').waitFor();
 const priced=['bel','btc','bch','dash','dgb','dingo','doge','ltc','pep','rvn','shic','trmp'];
 const unit=coin=>page.locator(`[data-overview-coin=${coin}] .holding-name > small`).first();
 await page.waitForFunction(()=>document.querySelector('[data-overview-coin=btc] .holding-name > small')?.textContent==='4 USDT');
 for(const coin of priced)assert.equal(await unit(coin).innerText(),'4 USDT');
 await page.clock.runFor(239000);
 assert.equal(await page.evaluate(()=>__priceCalls.filter(r=>r.provider==='cg').length),1);
 await page.clock.runFor(5000);
 assert.equal(await page.evaluate(()=>__priceCalls.filter(r=>r.provider==='cg').length),2,'Refresh before the five-minute deadline');
 assert.equal(await page.locator('#wallet-price-status').count(),0);

 // Missing USDT must not wipe every valuation or be renewed by fresh PEP.
 await page.evaluate(()=>__prices.kraken='no-usdt');await page.clock.runFor(305000);
 for(const coin of priced)assert.match(await unit(coin).innerText(),/^4 USDT · Last known · 5 minutes ago$/);
 assert.equal(await page.locator('#wallet-price-status').innerText(),'Last known · 5 minutes ago');
 await page.evaluate(()=>__pep=2);for(let i=0;i<3;i++)await page.clock.runFor(4001);
 assert.equal(await page.locator('[data-overview-coin=pep] .holding-balance').innerText(),'2 PEP','Deposits keep updating during a price outage');
 await page.evaluate(()=>__prices.kraken='ok');await page.clock.runFor(65000);
 for(const coin of priced)assert.equal(await unit(coin).innerText(),'4 USDT');
 assert.equal(await page.locator('#wallet-price-status').count(),0);

 // A shared-provider failure retains display quotes, not permission to spend.
 await page.evaluate(()=>__prices.cg='fail');await page.clock.runFor(305000);
 assert.match(await unit('btc').innerText(),/^4 USDT · Last known · \d+ minutes ago$/);
 assert.equal(await unit('pep').innerText(),'4 USDT');
 await page.locator('[data-nav=send]').click();await page.locator('[data-send-coin=btc]').click();
 await page.locator('#send-max:not([disabled])').waitFor();
 await page.locator('#send-address').fill(E.accounts(ethers,recipe,1).btc.address);
 await page.locator('#send-amount').fill('0.5');await page.locator('#review-send').click();
 await page.locator('#missing-price-option').waitFor({state:'visible'});
 assert.equal(await page.locator('#missing-price-ack').isChecked(),false);
 assert.equal(await page.locator('#broadcast-send').isDisabled(),true,'Last-known overview prices cannot authorize fee checks');
 await page.locator('[data-nav=wallet]').click();await page.clock.runFor(905000);
 assert.match(await unit('btc').innerText(),/^4 USDT · Last known · \d+ minutes ago$/,'Historical display quotes remain visibly dated');
 assert.equal(await unit('pep').innerText(),'4 USDT');
 const calls=await page.evaluate(()=>__priceCalls);
 const cg=calls.filter(r=>r.provider==='cg');
 assert.ok(cg.slice(1).every((r,i)=>r.at-cg[i].at>=10000),'Fee refreshes and retries remain throttled');
 assert.ok(cg.length<30,'An outage must not become four-second price polling');
 assert.ok(calls.every(r=>r.credentials==='omit'&&r.referrer==='no-referrer'));
 await page.evaluate(()=>{__prices.cg='ok';__prices.usd=3;});await page.clock.runFor(65000);
 assert.equal(await unit('btc').innerText(),'6 USDT');
 assert.equal(await page.locator('#wallet-price-status').count(),0);

 // Missing PEP does not discard a valid conversion for all other assets.
 await page.evaluate(()=>__prices.kraken='no-pep');await page.clock.runFor(305000);
 assert.match(await unit('pep').innerText(),/^4 USDT · Last known · \d+ minutes ago$/);
 assert.equal(await unit('btc').innerText(),'6 USDT');
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}

 // Persist original public timestamps across restarts, without admitting them
 // to live fee checks. Age formatting is tested without days of polling.
 const saved=await page.evaluate(()=>localStorage.getItem('corevault.display-prices.v1'));
 assert.deepEqual(Object.keys(JSON.parse(saved)).sort(),['quotes','version']);
 assert.ok(Object.values(JSON.parse(saved).quotes).every(q=>Object.keys(q).sort().join(',')==='at,updated,value'));
 for(const [age,label]of [[3*86400000,'3 days ago'],[31*86400000,'1 month ago']]){
  await page.evaluate(({saved,age})=>{
   const cache=JSON.parse(saved),at=Date.now()-age;
   for(const q of Object.values(cache.quotes))q.at=q.updated=at;
   localStorage.setItem('corevault.display-prices.v1',JSON.stringify(cache));
   localStorage.setItem('price-outage-fixture','1');
  },{saved,age});
  await page.reload();await page.locator('#rescan').waitFor();
  assert.equal(await unit('btc').innerText(),'6 USDT · Last known · '+label);
  assert.equal(await page.locator('#wallet-price-status').innerText(),'Last known · '+label);
  const cacheBefore=await page.evaluate(()=>localStorage.getItem('corevault.display-prices.v1'));
  await page.clock.runFor(65000);
  assert.equal(await page.evaluate(()=>localStorage.getItem('corevault.display-prices.v1')),cacheBefore,'Failed refresh must not renew saved quote ages');
 }
 // Even a cache modified to look fresh is display-only and cannot authorize fees.
 await page.evaluate(()=>{
  const cache=JSON.parse(localStorage.getItem('corevault.display-prices.v1'));
  for(const q of Object.values(cache.quotes))q.at=q.updated=Date.now();
  localStorage.setItem('corevault.display-prices.v1',JSON.stringify(cache));
 });
 await page.reload();await page.locator('#rescan').waitFor();
 assert.equal(await unit('btc').innerText(),'6 USDT');
 await page.locator('[data-nav=send]').click();await page.locator('[data-send-coin=btc]').click();
 await page.locator('#send-max:not([disabled])').waitFor();await page.locator('#send-address').fill(E.accounts(ethers,recipe,1).btc.address);
 await page.locator('#send-amount').fill('0.5');await page.locator('#review-send').click();
 await page.locator('#missing-price-option').waitFor({state:'visible'});
 assert.equal(await page.locator('#broadcast-send').isDisabled(),true,'Saved or forged-fresh display prices never authorize sends');
 // With no saved price, a cold offline start must not invent one or assume USDT=$1.
 await page.evaluate(()=>{localStorage.removeItem('corevault.display-prices.v1');history.replaceState(null,'','#wallet');});
 await page.reload();await page.locator('#rescan').waitFor();
 for(const coin of priced)assert.equal(await unit(coin).innerText(),'*');
 assert.equal(await page.locator('#wallet-price-status').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: early refresh, independent PEP/USDT, persistent minutes/days/months ages, live deposits, cache isolation from fee checks, bounded retries, recovery and cold-start honesty.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
