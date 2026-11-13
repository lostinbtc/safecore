// Disposable public fixtures only. RPC/broadcasting is disabled.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js'),{bech32}=require('bech32');
(async()=>{const b=await chromium.launch();try{
 const c=await b.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');delete recipe.paths.ltc;
 const owner=E.accounts(ethers,recipe).ltc;
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:100000000n,script:T.script('ltc',owner.address)}],locktime:0})).slice(2);
 await c.addInitScript(({vault,raw,txid})=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));window.__stale=false;window.__offline=false;
  window.fetch=async(url,options)=>{
   if(options.credentials!=='omit'||options.referrerPolicy!=='no-referrer')throw Error('Price privacy regression');
   if(url.includes('api.kraken.com'))return new Response(JSON.stringify({error:[],result:{PEPUSD:{c:['.01']},USDTZUSD:{c:['.5']}}}));
   if(url!=='https://api.coingecko.com/api/v3/simple/price?ids=shibacoin,litecoin&vs_currencies=usd&include_last_updated_at=true')throw Error('Unexpected quote URL');
   if(__offline)return new Response('{}',{status:429});
   return new Response(JSON.stringify({litecoin:{usd:50,last_updated_at:Math.floor(Date.now()/1000)-(__stale?601:0)},shibacoin:{usd:.000003,last_updated_at:Math.floor(Date.now()/1000)}}));
  };
  window.WebSocket=class{constructor(){throw Error('Live network forbidden');}};
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){Object.defineProperty(window,'WalletNetwork',{value:N});
   N.scan=async(coin,pool)=>({coin,tip:500,at:Date.now(),confirmed:coin==='ltc'?100000000n:0n,unconfirmed:0n,everUsed:coin==='ltc'?[0]:[],feeRate:coin==='ltc'?1000n:1000000n,rows:pool.map((account,i)=>({account,checked:true,confirmed:coin==='ltc'&&i===0?100000000n:0n,unconfirmed:0n,history:coin==='ltc'&&i===0?[{tx_hash:txid,height:499}]:[],utxos:coin==='ltc'&&i===0?[{raw,txid,pos:0,height:499,value:100000000n,address:account.address,index:0}]:[]}))});
   N.spendable=async s=>s.rows.flatMap(r=>r.utxos);N.client=()=>{throw Error('Broadcast forbidden');};
  }});
 },{vault:E.unprotected(webcrypto,recipe),raw,txid:T.parse(raw).txid});
 await p.clock.install();await p.clock.pauseAt(new Date(Date.now()+100));await p.goto('http://localhost:8787/');
 await p.waitForFunction(()=>document.getElementById('wallet-worth').innerText==='≈ 100.00 USDT');
 const row=p.locator('[data-overview-coin=ltc]');assert.equal(await row.locator('img').evaluate(i=>i.complete&&i.naturalWidth>0),true);
 await row.click();await p.locator('#address').waitFor();assert.equal(await p.locator('#address').innerText(),E.accounts(ethers,recipe,1).ltc.address);
 await p.locator('[data-nav=send]').click();await p.locator('[data-send-coin=ltc]').click();await p.locator('#send-address').waitFor();
 const destination=bech32.encode('ltc',[0,...bech32.toWords(Buffer.alloc(20,7))]);await p.locator('#send-address').fill(destination);await p.locator('#send-max').click();
 assert.equal(await p.locator('#send-address').getAttribute('maxlength'),'90');assert.equal(await p.locator('#send-amount').inputValue(),'1');
 assert.doesNotMatch(await p.locator('#main').innerText(),/Network fee: 0\.01 LTC/);
 await p.locator('#review-send').click();await p.locator('#broadcast-send').waitFor();
 assert.match(await p.locator('.send-review').innerText(),/0\.99999776/);assert.match(await p.locator('.send-review').innerText(),/0\.00000224/);
 await p.locator('[data-nav=wallet]').click();await p.evaluate(()=>__stale=true);await p.clock.runFor(305000);
 assert.equal(await row.locator('.holding-values > small').innerText(),'*');assert.equal(await row.locator('.holding-balance').innerText(),'1 LTC');
 await p.evaluate(()=>{__stale=false;__offline=true;});await p.clock.runFor(305000);assert.equal(await row.locator('.holding-values > small').innerText(),'*');
 await p.locator('[data-nav=security]').click();await p.locator('#custom-connections > summary').click();assert.equal(await p.locator('#endpoint-ltc').inputValue(),'');
 assert.doesNotMatch(await p.locator('#custom-connections').innerText(),/cipig/);assert.deepEqual(errors,[]);
 console.log('PASS: LTC old backup, logo/receive, price/USDT/staleness, SegWit destination, Max fee-inclusive review, hidden default and no broadcast.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
