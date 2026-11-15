// Disposable Chromium profile and synthetic network; never broadcasts real funds.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(context);
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
 const coins=['bch','dash','dgb','rvn','trmp'],owners=E.accounts(ethers,recipe),recipients=E.accounts(ethers,recipe,1),fixtures={};
 for(const coin of coins){
  const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:10n*T.COIN,script:T.script(coin,owners[coin].address)}],locktime:0})).slice(2);
  fixtures[coin]={raw,txid:T.parse(raw).txid,value:1e9,sh:T.scriptHash(coin,owners[coin].address)};
 }
 const vault=E.unprotected(webcrypto,recipe);
 await context.addInitScript(({vault,fixtures})=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));window.__sent=[];window.__legacyCalls=[];
  const Empty=WebSocket,originalFetch=fetch;
  window.fetch=async(url,options)=>String(url).includes('api.coingecko.com')?new Response(JSON.stringify(Object.fromEntries(['bitcoin-cash','dash','digibyte','ravencoin'].map(id=>[id,{usd:2,last_updated_at:Math.floor(Date.now()/1000)}])))):originalFetch(url,options);
  window.WebSocket=class extends Empty{
   send(raw){
    const q=JSON.parse(raw),coin=Object.keys(WalletNetwork.CONFIG).find(c=>WalletNetwork.CONFIG[c].url===this.url);
    if(this.url.includes('.fixture')){__legacyCalls.push(q);if(q.method==='server.version')return queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:q.id,result:['fixture','1.4']})}));return queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:q.id,result:{genesis_hash:'00'.repeat(32)}})}));}
    if(!fixtures[coin])return super.send(raw);
    const f=fixtures[coin],owned=q.params[0]===f.sh;let result;
    if(q.method==='blockchain.headers.subscribe')result={height:800000};
    else if(q.method==='blockchain.scripthash.subscribe')result=owned?WalletTransactions.historyStatus([{tx_hash:f.txid,height:100}]):null;
    else if(q.method.endsWith('get_history'))result=owned?[{tx_hash:f.txid,height:100}]:[];
    else if(q.method.endsWith('get_balance'))result={confirmed:owned?f.value:0,unconfirmed:0};
    else if(q.method.endsWith('listunspent'))result=owned?[{tx_hash:f.txid,tx_pos:0,height:100,value:f.value}]:[];
    else if(q.method==='blockchain.transaction.get')result=f.raw;
    else if(['blockchain.relayfee','blockchain.estimatefee'].includes(q.method))result=Number(WalletTransactions.policy(coin).minRate)/1e8;
    else if(q.method==='blockchain.transaction.broadcast'){__sent.push({coin,raw:q.params[0]});result=WalletTransactions.parse(q.params[0],coin).txid;}
    else return super.send(raw);
    queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:q.id,result})}));
   }
  };
 },{vault,fixtures});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:8787/');
 const order=['bel','btc','bch','dash','dgb','dingo','doge','ltc','pep','rvn','shic','trmp','wht'];
 await page.waitForFunction(()=>document.querySelector('[data-overview-coin=bch] .holding-balance')?.textContent==='10 BCH');
 assert.deepEqual(await page.locator('[data-overview-coin]').evaluateAll(rows=>rows.map(r=>r.dataset.overviewCoin)),order);
 for(const coin of coins){
  assert.ok(await page.locator(`[data-overview-coin=${coin}] img`).evaluate(i=>i.complete&&i.naturalWidth>0));
  await page.locator(`[data-overview-coin=${coin}]`).click();await page.locator('#address').waitFor();
  assert.equal(await page.locator('#address').innerText(),recipients[coin].address);
  assert.equal(await page.locator('#komodo-open').count(),0);
  await page.locator('[data-nav=send]').click();
  if(await page.locator('#change-send-coin').isVisible())await page.locator('#change-send-coin').click();
  await page.locator(`[data-send-coin=${coin}]`).click();await page.locator('#send-max:not([disabled])').waitFor();
  assert.equal(await page.locator('#one-coin-fee').count(),0);
  await page.locator('#send-address').fill(recipients[coin].address);await page.locator('#send-max').click();
  assert.equal(await page.locator('#send-amount').inputValue(),'10');
  const fee=(227n*T.policy(coin).minRate+999n)/1000n;
  assert.equal(await page.locator('#automatic-fee').innerText(),T.format(fee)+' '+E.NETWORKS[coin].ticker);
  await page.locator('#review-send').click();await page.locator('#broadcast-send').waitFor();await page.locator('#send-ack').check();await require('./accept_missing_price.cjs')(page);await page.locator('#broadcast-send').click();
  await page.waitForFunction(coin=>__sent.some(s=>s.coin===coin),coin);
  const sent=await page.evaluate(coin=>__sent.find(s=>s.coin===coin),coin),tx=T.parse(sent.raw,coin);
  assert.equal(tx.inputs[0].txid,fixtures[coin].txid);assert.equal(tx.outputs[0].value,10n*T.COIN-fee);
  await page.locator('[data-nav=wallet]').click();
 }
 await page.locator('[data-nav=security]').click();await page.locator('#legacy-assets > summary').click();
 for(const coin of ['jkc','lky','cat','flop']){
  assert.equal(await page.locator('#enable-'+coin).isChecked(),false);
  assert.equal(await page.locator('#endpoint-'+coin).count(),0);
  await page.locator('#enable-'+coin).check();assert.equal(await page.locator('#endpoint-'+coin).inputValue(),'');
  await page.locator('#endpoint-'+coin).fill('wss://wrong.fixture/');await page.locator(`[data-test-connection=${coin}]`).click();
  await page.waitForFunction(coin=>document.querySelector(`[data-connection-status=${coin}]`)?.textContent.includes('genesis'),coin);
  assert.equal(await page.locator(`[data-use-connection=${coin}]`).isDisabled(),true);
  await page.locator('#enable-'+coin).uncheck();assert.equal(await page.locator('#endpoint-'+coin).count(),0);
 }
 assert.ok(await page.evaluate(()=>__legacyCalls.every(q=>q.method.startsWith('server.'))));
 await page.reload();await page.locator('#legacy-assets > summary').click();
 for(const coin of ['bonc','jkc','lky','cat','flop'])assert.equal(await page.locator('#enable-'+coin).isChecked(),false);
 assert.equal(await page.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')),JSON.stringify(vault));
 assert.deepEqual(errors,[]);
 console.log('PASS: five new normal assets: order/icons/receive/Max/locked fees/simulated sends; CAT/JKC/LKY hidden opt-ins and wrong-chain refusal; saved wallet unchanged.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
