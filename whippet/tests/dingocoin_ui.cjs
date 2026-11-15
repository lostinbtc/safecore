// Isolated browser, public seed and synthetic Electrum only. No real broadcasts.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const c=await browser.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(c);
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');delete recipe.paths.dingo;
 const owner=E.accounts(ethers,recipe).dingo,fixtures={};
 for(const [coin,coins]of [['dingo',10],['doge',20]]){
  const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:BigInt(coins)*T.COIN,script:T.script(coin,owner.address)}],locktime:0})).slice(2);
  fixtures[coin]={raw,txid:T.parse(raw).txid,value:coins*1e8,sh:T.scriptHash(coin,owner.address)};
 }
 await c.addInitScript(({vault,fixtures})=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));window.__relay=1;window.__broadcasts=[];
  const emptyFetch=window.fetch,EmptySocket=window.WebSocket;
  window.fetch=async(url,options)=>String(url).includes('api.coingecko.com')?new Response(JSON.stringify({dingocoin:{usd:.00001,last_updated_at:Math.floor(Date.now()/1000)},dogecoin:{usd:.1,last_updated_at:Math.floor(Date.now()/1000)}})):emptyFetch(url,options);
  window.WebSocket=class extends EmptySocket{
   send(raw){
    const q=JSON.parse(raw),coin=Object.keys(WalletNetwork.CONFIG).find(k=>WalletNetwork.CONFIG[k].url===this.url);
    if(!fixtures[coin])return super.send(raw);
    const f=fixtures[coin],owned=q.params[0]===f.sh;let result;
    if(q.method==='blockchain.headers.subscribe')result={height:200000};
    else if(q.method==='blockchain.scripthash.subscribe')result=owned?WalletTransactions.historyStatus([{tx_hash:f.txid,height:100}]):null;
    else if(q.method==='blockchain.scripthash.get_history')result=owned?[{tx_hash:f.txid,height:100}]:[];
    else if(q.method==='blockchain.scripthash.get_balance')result={confirmed:owned?f.value:0,unconfirmed:0};
    else if(q.method==='blockchain.scripthash.listunspent')result=owned?[{tx_hash:f.txid,tx_pos:0,height:100,value:f.value}]:[];
    else if(q.method==='blockchain.transaction.get'){if(q.params[0]!==f.txid)throw Error('Wrong-chain previous transaction');result=f.raw;}
    else if(q.method==='blockchain.relayfee')result=coin==='dingo'?__relay:.01;
    else if(q.method==='blockchain.estimatefee')result=-1;
    else if(q.method==='blockchain.transaction.broadcast'){__broadcasts.push({coin,raw:q.params[0]});result=WalletTransactions.parse(q.params[0]).txid;}
    else return super.send(raw);
    queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:q.id,result})}));
   }
  };
 },{vault:E.unprotected(webcrypto,recipe),fixtures});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:8787/');
 await p.waitForFunction(()=>document.querySelector('[data-overview-coin=dingo] .holding-balance')?.textContent==='10 DINGO');
 assert.deepEqual(await p.locator('[data-overview-coin]').evaluateAll(rows=>rows.map(r=>r.dataset.overviewCoin)),['bel','btc','bch','dash','dgb','dingo','doge','ltc','pep','rvn','shic','trmp','wht']);
 assert.equal(await p.locator('[data-overview-coin=doge] .holding-balance').innerText(),'20 DOGE');
 assert.ok(await p.locator('[data-overview-coin=dingo] img').evaluate(i=>i.complete&&i.naturalWidth>0));
 await p.waitForFunction(()=>document.querySelector('[data-overview-coin=dingo] .holding-values > small')?.textContent==='<0.01 USDT');
 await p.locator('[data-overview-coin=dingo]').click();await p.locator('#asset-receive').click();await p.locator('#address').waitFor();
 assert.equal(await p.locator('#address').innerText(),E.accounts(ethers,recipe,1).dingo.address);assert.equal(await p.locator('#komodo-open').count(),0);
 const select=async coin=>{await p.locator('[data-nav=send]').click();if(await p.locator('#change-send-coin').isVisible())await p.locator('#change-send-coin').click();await p.locator(`[data-send-coin=${coin}]`).click();await p.locator('#send-max:not([disabled])').waitFor();};
 await select('doge');await p.locator('#send-address').fill(E.accounts(ethers,recipe,2).doge.address);await p.locator('#send-amount').fill('5');
 // Direct asset switch: no pending DOGE payment may become a DINGO draft.
 await select('dingo');
 assert.equal(await p.locator('#send-address').inputValue(),'');assert.equal(await p.locator('#send-amount').inputValue(),'');
 assert.equal(await p.locator('#one-coin-fee').count(),0);assert.match(await p.locator('#send-form').innerText(),/Recipient minimum: 1 DINGO/);
 await p.locator('#send-address').fill(E.accounts(ethers,recipe,2).dingo.address);await p.locator('#send-max').click();
 assert.equal(await p.locator('#send-amount').inputValue(),'10');assert.equal(await p.locator('#automatic-fee').innerText(),'1 DINGO');
 await p.locator('#review-send').click();await p.locator('#broadcast-send').waitFor();
 const review=await p.locator('.send-review').innerText();assert.match(review,/Dingocoin mainnet/);assert.match(review,/9 DINGO/);assert.match(review,/Estimated network fee/);assert.doesNotMatch(review,/DOGE/);
 await p.evaluate(()=>__relay=2);await p.locator('#send-ack').check();await p.locator('#broadcast-send').click();await p.locator('#error').waitFor({state:'visible'});
 assert.match(await p.locator('#error').innerText(),/higher fee/);assert.equal(await p.evaluate(()=>__broadcasts.length),0);
 await p.evaluate(()=>__relay=1);await p.locator('#broadcast-send').click();await p.waitForFunction(()=>__broadcasts.length===1);
 const sent=await p.evaluate(()=>__broadcasts[0]);assert.equal(sent.coin,'dingo');const tx=T.parse(sent.raw);assert.equal(tx.outputs[0].value,9n*T.COIN);assert.equal(tx.inputs[0].txid,fixtures.dingo.txid);assert.notEqual(tx.inputs[0].txid,fixtures.doge.txid);
 await p.locator('[data-nav=activity]').click();await p.locator('[data-activity-coin=dingo] summary').click();
 assert.ok((await p.locator('[data-activity-coin=dingo] a').first().getAttribute('href')).startsWith('https://explorer.dingocoin.com/tx/'));
 assert.equal(await p.locator('[data-activity-coin=dingo]').innerText().then(t=>t.includes(fixtures.doge.txid)),false);
 await p.locator('[data-nav=security]').click();await p.locator('#custom-connections > summary').click();assert.equal(await p.locator('#endpoint-dingo').inputValue(),'');
 assert.deepEqual(errors,[]);console.log('PASS: isolated DOGE/DINGO balances, histories, drafts and signed inputs; DINGO order/logo/price/receive, automatic fee, live fee-rise rejection and simulated send.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
