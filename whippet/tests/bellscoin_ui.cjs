// Full HTTPS adapter in an isolated browser, using only synthetic responses.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(context);
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),owner=E.accounts(ethers,recipe).bel;
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:500000000n,script:T.script('bel',owner.address)}],locktime:0})).slice(2),txid=T.parse(raw).txid;
 const sh=T.scriptHash('bel',owner.address).match(/../g).reverse().join('');delete recipe.paths.bel;
 await context.addInitScript(({vault,raw,txid,sh})=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));const emptyFetch=window.fetch;
  window.fetch=async(url,options={})=>{
   if(options.method==='POST')throw Error('Broadcast forbidden in UI test');
   if(url.includes('api.coingecko.com'))return new Response(JSON.stringify({bellscoin:{usd:.02,last_updated_at:Math.floor(Date.now()/1000)}}));
   const path=new URL(url).pathname;
   if(path==='/scripthash/'+sh)return new Response(JSON.stringify({chain_stats:{funded_txo_sum:500000000,spent_txo_sum:0},mempool_stats:{funded_txo_sum:0,spent_txo_sum:0}}));
   if(path==='/scripthash/'+sh+'/txs')return new Response(JSON.stringify([{txid,status:{confirmed:true,block_height:100}}]));
   if(path==='/scripthash/'+sh+'/utxo')return new Response(JSON.stringify([{txid,vout:0,value:500000000,confirmed:true}]));
   if(path==='/tx/'+txid+'/status')return new Response(JSON.stringify({confirmed:true,block_height:100}));
   if(path==='/tx/'+txid+'/hex')return new Response(raw);
   return emptyFetch(url,options);
  };
 },{vault:E.unprotected(webcrypto,recipe),raw,txid,sh});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8787/');
 await page.waitForFunction(()=>document.querySelector('[data-overview-coin=bel] .holding-balance')?.textContent==='5 BELLS');
 assert.deepEqual(await page.locator('[data-overview-coin]').evaluateAll(rows=>rows.map(r=>r.dataset.overviewCoin)),['bel','btc','bch','dash','dgb','dingo','doge','ltc','pep','rvn','shic','trmp','wht']);
 assert.equal(await page.locator('[data-overview-coin=bel] img').evaluate(i=>i.complete&&i.naturalWidth>0),true);
 await page.waitForFunction(()=>document.querySelector('[data-overview-coin=bel] .holding-values > small')?.textContent==='0.10 USDT');
 await page.locator('[data-overview-coin=bel]').click();await page.locator('#asset-receive').click();await page.locator('#address').waitFor();
 assert.equal(await page.locator('#address').innerText(),E.accounts(ethers,recipe,1).bel.address);
 assert.equal(await page.locator('#komodo-open').count(),0);
 await page.locator('[data-nav=send]').click();await page.locator('[data-send-coin=bel]').click();await page.locator('#send-max:not([disabled])').waitFor();
 await page.locator('#send-address').fill(E.accounts(ethers,recipe,2).bel.address);await page.locator('#send-max').click();
 assert.equal(await page.locator('#send-amount').inputValue(),'5');
 assert.equal(await page.locator('#automatic-fee').innerText(),'0.0000227 BELLS');
 assert.equal(await page.locator('#one-coin-fee').count(),0);assert.match(await page.locator('#send-form').innerText(),/Core minimum/);
 await page.locator('#review-send').click();await page.locator('#broadcast-send').waitFor();
 assert.match(await page.locator('.send-review').innerText(),/4\.9999773/);assert.match(await page.locator('.send-review').innerText(),/0\.0000227/);
 await page.locator('[data-nav=activity]').click();await page.locator('[data-activity-coin=bel] summary').click();
 assert.equal(await page.locator('[data-activity-coin=bel] a').first().getAttribute('href'),'https://nintondo.io/bells/explorer/tx/'+txid);
 await page.locator('[data-nav=security]').click();await page.locator('#custom-connections > summary').click();
 assert.equal(await page.locator('#endpoint-bel').inputValue(),'');assert.equal(await page.locator('#endpoint-bel').getAttribute('placeholder'),'wss://server:port/path');
 assert.doesNotMatch(await page.locator('#custom-connections').innerText(),/nintondo\.io/);assert.deepEqual(errors,[]);
 console.log('PASS: BELLS full adapter UI, old backup, asset order, price, receiving, automatic Max/review, explorer, hidden default and no Komodo or broadcast.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
