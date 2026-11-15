// Disposable known public keys and synthetic coins. All broadcasts are mocked.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),U=require('../www/assets/ethers.umd.min.js').utils;
const ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
(async()=>{const browser=await chromium.launch();try{
 for(const coin of ['btc','ltc'])for(const scenario of ['allowed','high','blocked','missing','stale']){
  const bytes=U.concat([[coin==='btc'?128:176],U.zeroPad([1],32),[1]]);
  const wif=U.base58.encode(U.concat([bytes,U.arrayify(U.sha256(U.sha256(bytes))).slice(0,4)])),key=T.sweepKey(coin,wif);
  const raw=U.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:100000000n,script:T.script(coin,key.address)}],locktime:0})).slice(2);
  const txid=T.parse(raw).txid,context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(({coin,scenario,vault,raw,txid,address})=>{
   localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));window.__broadcasts=[];window.__sourceChecks=0;
   window.WebSocket=class{constructor(){throw Error('Live network forbidden');}};
   window.fetch=async url=>new Response(JSON.stringify(url.includes('coingecko')&&scenario!=='missing'?{
    [coin==='btc'?'bitcoin':'litecoin']:{usd:scenario==='blocked'?500000:scenario==='high'?200000:100000,last_updated_at:Math.floor(Date.now()/1000)}
   }:{}));
   Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){Object.defineProperty(window,'WalletNetwork',{value:N});
    N.scan=async(coin,accounts)=>({coin,tip:500,at:Date.now(),complete:true,everUsed:[],confirmed:0n,unconfirmed:0n,feeRate:1000n,rows:accounts.map(account=>({account,checked:true,confirmed:0n,unconfirmed:0n,history:[],utxos:[]}))});
    N.sweepSource=async(asset,source)=>{if(asset!==coin||source!==address)throw Error('Wrong sweep source');__sourceChecks++;return {snapshot:{tip:500,feeRate:['high','blocked'].includes(scenario)?100000n:1000n},utxos:[{index:0,address,txid,pos:0,height:499,value:100000000n,raw}]};};
    N.checkInputs=async()=>{if(scenario==='stale'){const original=WalletReporting.feeUsd;WalletReporting.feeUsd=(c,f,q)=>original(c,f,q?{...q,at:Date.now()-300000}:q);}};
    N.confirmation=async()=>({seen:true,confirmations:1});
    N.client=()=>({call:async(method,params)=>{if(method!=='blockchain.transaction.broadcast')throw Error('Unexpected method');__broadcasts.push(params[0]);return WalletTransactions.parse(params[0]).txid;}});
   }});
  },{coin,scenario,vault:E.unprotected(webcrypto,recipe),raw,txid,address:key.address});
  await page.goto('http://localhost:8787/');await page.locator('#rescan').waitFor();
  await page.locator('[data-nav=receive]').click();await page.locator('#receive-coin').click();await page.locator(`[data-coin=${coin}]`).click();
  await page.locator('#sweep-open').click();await page.locator('#sweep-key').fill(wif);await page.locator('#review-sweep').click();
  await page.locator('#broadcast-send').waitFor();const notice=await page.locator('#fee-usd-notice').textContent();
  assert.equal(await page.evaluate(()=>__broadcasts.length),0);
  if(['blocked','missing'].includes(scenario)){
   assert.equal(await page.locator('#broadcast-send').isDisabled(),true);
   assert.match(notice,scenario==='blocked'?/120\.63 USD.*blocked.*no override/:/fresh USD price.*unavailable/);
   // The policy must guard the handler too, not merely disable a UI button.
   await page.locator('#send-ack').check();
   await page.evaluate(()=>document.getElementById('broadcast-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   await page.locator('#error').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>__broadcasts.length),0);
   assert.equal(await page.locator('#broadcast-send').isDisabled(),true);
  }else{
   if(scenario==='high')assert.match(notice,/48\.25 USD.*High fee/);else assert.equal(await page.locator('#fee-usd-notice').isHidden(),true);
   await page.locator('#broadcast-send').click();assert.equal(await page.evaluate(()=>__broadcasts.length),0);
   await page.locator('#send-ack').check();await page.locator('#broadcast-send').click();
   if(scenario==='stale'){
    await page.locator('#error').waitFor({state:'visible'});assert.match(await page.locator('#error').innerText(),/fresh USD price/);
    assert.equal(await page.evaluate(()=>__broadcasts.length),0);
   }else{
    await page.getByRole('heading',{name:/Sweep (submitted|confirmed)/}).waitFor();
    const sent=await page.evaluate(()=>__broadcasts);assert.equal(sent.length,1);
    const actualFee=100000000n-T.parse(sent[0]).outputs[0].value;
    assert.equal(actualFee,scenario==='high'?24125n:242n);
   }
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: BTC/LTC sweep fee review, high USD warning, $100 hard block, missing/stale quote rejection, exact signed fee and explicit acknowledgment.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
