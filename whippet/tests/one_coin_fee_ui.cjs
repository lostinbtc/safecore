// Public fixture keys and synthetic outputs only; every broadcast is mocked.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),accounts=E.accounts(ethers,recipe),fixtures={};
for(const coin of Object.keys(E.NETWORKS)){
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:Array.from({length:40},()=>({value:50000000n,script:T.script(coin,accounts[coin].address)})),locktime:0})).slice(2);
 fixtures[coin]={raw,txid:T.parse(raw).txid};
}
(async()=>{const browser=await chromium.launch();try{
 for(const scenario of ['normal','relay-rise']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(({vault,fixtures,scenario})=>{
   localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));window.__broadcasts=[];window.__relayChecks=0;
   window.fetch=async()=>new Response('{}');window.WebSocket=class{constructor(){throw Error('Live network forbidden');}};
   Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){Object.defineProperty(window,'WalletNetwork',{value:N});
    N.scan=async(coin,pool)=>({coin,tip:500,at:Date.now(),complete:true,everUsed:[0],confirmed:2000000000n,unconfirmed:0n,feeRate:['btc','ltc'].includes(coin)?1000n:1000000n,
     rows:pool.map((account,i)=>({account,checked:true,confirmed:i?0n:2000000000n,unconfirmed:0n,history:i?[]:[{tx_hash:fixtures[coin].txid,height:499}],utxos:i?[]:Array.from({length:40},(_,pos)=>({...fixtures[coin],pos,height:499,value:50000000n,address:account.address,index:0}))}))});
    N.spendable=async s=>s.rows.flatMap(r=>r.utxos);N.checkInputs=async()=>{};
    N.client=coin=>({call:async(method,params)=>{
     if(method==='blockchain.relayfee'){__relayChecks++;return scenario==='relay-rise'?.100001:.01;}
     if(method!=='blockchain.transaction.broadcast')throw Error('Unexpected RPC');
     __broadcasts.push({coin,raw:params[0]});return WalletTransactions.parse(params[0]).txid;
    }});
   }});
  },{vault:E.unprotected(webcrypto,recipe),fixtures,scenario});
  await page.goto('http://localhost:8787/');await page.locator('#rescan').waitFor();
  for(const coin of scenario==='normal'?['pep','doge','shic','wht']:['pep']){
   const choose=async()=>{await page.locator('[data-nav=send]').click();await page.locator('#send-coin').click();await page.locator(`[data-send-coin=${coin}]`).click();await page.locator('#send-address').fill(E.accounts(ethers,recipe,1)[coin].address);};
   await choose();assert.equal(await page.locator('#one-coin-fee').isChecked(),false);
   await page.locator('#send-max').click();assert.equal(await page.locator('#send-amount').inputValue(),'3');assert.match(await page.locator('#send-estimate').innerText(),/Default network fee: 0\.01/);
   await page.locator('#one-coin-fee').check();await page.locator('#send-max').click();assert.equal(await page.locator('#send-amount').inputValue(),'20');assert.match(await page.locator('#send-estimate').innerText(),/You are sending 19/);
   await page.locator('[data-nav=wallet]').click();await choose();assert.equal(await page.locator('#one-coin-fee').isChecked(),false,'Higher fee must not persist');
   await page.locator('#one-coin-fee').check();await page.locator('#send-max').click();await page.locator('#review-send').click();await page.locator('#one-coin-fee-notice').waitFor();
   assert.ok((await page.locator('#one-coin-fee-notice').innerText()).includes('1 '+coin.toUpperCase()));
   const before=await page.evaluate(()=>__broadcasts.length);
   await page.locator('#broadcast-send').click();assert.equal(await page.evaluate(()=>__broadcasts.length),before);
   await page.locator('#send-ack').check();await page.locator('#broadcast-send').click();
   if(scenario==='relay-rise'){
    await page.locator('#error').waitFor({state:'visible'});assert.match(await page.locator('#error').innerText(),/relay requirement/);assert.equal(await page.evaluate(()=>__broadcasts.length),0);
    assert.equal(await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('corevault.send-attempts.')).some(([,v])=>JSON.parse(v).length>0)),false);
   }else{
    await page.getByRole('heading',{name:'Transaction submitted'}).waitFor();
    const sent=await page.evaluate(()=>__broadcasts.at(-1)),decoded=T.parse(sent.raw);assert.equal(sent.coin,coin);assert.equal(decoded.inputs.length,40);assert.equal(decoded.outputs[0].value,19n*T.COIN);assert.equal(decoded.outputs.length,1);
   }
   await page.locator('[data-nav=wallet]').click();
  }
  if(scenario==='normal')for(const coin of ['ltc','btc']){
   await page.locator('[data-nav=send]').click();await page.locator('#send-coin').click();await page.locator(`[data-send-coin=${coin}]`).click();assert.equal(await page.locator('#one-coin-fee').count(),0);await page.locator('[data-nav=wallet]').click();
  }
  assert.equal(await page.evaluate(()=>__relayChecks),scenario==='normal'?4:1);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: PEP/DOGE/SHIC/WHT optional exact 1-coin fee, 40-input Max, reset-off behavior, explicit review, live relay recheck/block; no option on LTC/BTC.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
