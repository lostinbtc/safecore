// Disposable public keys and synthetic prices/transactions only.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),accounts=E.accounts(ethers,recipe),destinations=E.accounts(ethers,recipe,1),fixtures={};
 for(const [coin,account]of Object.entries(accounts)){
  const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:20n*T.COIN,script:T.script(coin,account.address)}],locktime:0})).slice(2);
  fixtures[coin]={raw,txid:T.parse(raw,coin).txid};
 }
 await context.addInitScript(({vault,fixtures})=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
  for(const coin of ['bonc','cat','flop','jkc','lky'])localStorage.setItem('corevault.legacy-'+coin+'.v1','true');
  localStorage.setItem('corevault.connections.v1',JSON.stringify(Object.fromEntries(['bonc','cat','flop','jkc','lky'].map(c=>[c,'wss://'+c+'.fixture/']))));
  window.__scenario=JSON.parse(localStorage.getItem('fee-fixture')||'{"price":1}');window.__sent=[];
  window.fetch=async url=>{
   const price=__scenario.price;
   if(String(url).includes('coingecko'))return new Response(JSON.stringify(price===null?{}:Object.fromEntries(new URL(url).searchParams.get('ids').split(',').filter(id=>!(__scenario.omit||[]).includes(id)).map(id=>[id,{usd:price,last_updated_at:Math.floor(Date.now()/1000)}]))));
   return new Response(JSON.stringify({error:[],result:price===null?{}:{PEPUSD:{c:[String(price)]},USDTZUSD:{c:['1']}}}));
  };
  window.WebSocket=class{constructor(){throw Error('Real network forbidden');}};
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){
   Object.defineProperty(window,'WalletNetwork',{value:N,configurable:true});
   N.scan=async(coin,accounts)=>({coin,tip:800000,at:Date.now(),everUsed:[0],confirmed:2000000000n,unconfirmed:0n,feeRate:WalletTransactions.policy(coin).minRate,
    rows:accounts.map((account,i)=>({account,confirmed:i?0n:2000000000n,unconfirmed:0n,history:i?[]:[{tx_hash:fixtures[coin].txid,height:100}],utxos:i?[]:[{...account,value:2000000000n,txid:fixtures[coin].txid,pos:0,height:100,raw:fixtures[coin].raw}]}))});
   N.spendable=async s=>s.rows.flatMap(r=>r.utxos);N.checkInputs=async()=>{};
   N.client=coin=>({call:async(method,args)=>{
    if(method==='blockchain.relayfee')return Number(WalletTransactions.policy(coin).minRate)/1e8;
    if(method==='blockchain.transaction.broadcast'){__sent.push({coin,raw:args[0]});return WalletTransactions.parse(args[0],coin).txid;}
    throw Error('Unexpected fixture RPC '+method);
   }});
  }});
 },{vault:E.unprotected(webcrypto,recipe),fixtures});
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
 await page.goto('http://localhost:8787/');await page.locator('#rescan').waitFor();
 async function review(coin,price){
  await page.evaluate(price=>{
   localStorage.setItem('fee-fixture',JSON.stringify(price!==null&&typeof price==='object'?price:{price}));
   for(const key of Object.keys(localStorage))if(key.startsWith('corevault.send-attempts.'))localStorage.removeItem(key);
  },price);
  await page.evaluate(()=>history.replaceState(null,'','#wallet'));await page.reload();await page.locator('#rescan').waitFor();
  await page.locator('[data-nav=send]').click();await page.locator(`[data-send-coin=${coin}]`).click();
  await page.locator('#send-max:not([disabled])').waitFor();await page.locator('#send-address').fill(destinations[coin].address);
  await page.locator('#send-amount').fill('10');
  if(!T.policy(coin).flatFee){assert.equal(await page.locator('#automatic-fee').evaluate(e=>e.tagName),'OUTPUT');assert.equal(await page.locator('input:not([type=checkbox]):not([type=hidden])').count(),2);}
  await page.locator('#review-send').click();await page.locator('#broadcast-send').waitFor();
 }
 for(const coin of Object.keys(E.NETWORKS)){
  console.log('Fee guards:',coin);
  const rules=T.policy(coin),fee=rules.flatFee?1000000n:rules.roundKilobyte?rules.minRate:(227n*rules.minRate+999n)/1000n;
  if(!['wht','bonc','flop'].includes(coin)){
   await review(coin,1);assert.equal(await page.locator('#fee-usd-notice').isHidden(),true);assert.equal(await page.locator('#missing-price-option').isHidden(),true);
   await review(coin,6*1e8/Number(fee));assert.match(await page.locator('#fee-usd-notice').innerText(),/High fee/);assert.equal(await page.locator('#missing-price-option').isHidden(),true);
   await review(coin,101*1e8/Number(fee));assert.equal(await page.locator('#broadcast-send').isDisabled(),true);assert.match(await page.locator('#fee-usd-notice').innerText(),/exceeds \$100/);
   // Forging the hidden checkbox must not authorize a known excessive fee.
   await page.evaluate(()=>{document.getElementById('missing-price-ack').checked=true;document.getElementById('missing-price-ack').dispatchEvent(new Event('change'));document.getElementById('send-ack').checked=true;document.getElementById('broadcast-form').dispatchEvent(new Event('submit',{cancelable:true}));});
   await page.locator('#error').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>__sent.length),0);
  }
  await review(coin,null);assert.equal(await page.locator('#broadcast-send').isDisabled(),true);assert.equal(await page.locator('#missing-price-ack').isChecked(),false);
  await page.locator('#missing-price-ack').check();await page.locator('#send-ack').check();await page.locator('#broadcast-send').click();
  await page.waitForFunction(()=>__sent.length===1);
  const sent=await page.evaluate(()=>__sent[0]);assert.equal(20n*T.COIN-T.parse(sent.raw,coin).outputs.reduce((n,o)=>n+o.value,0n),fee);
  await review(coin,null);assert.equal(await page.locator('#missing-price-ack').isChecked(),false,'Override must not survive a new review');
 }
 for(const dollars of [6,101]){
  const coin='trmp',fee=227000n;await review(coin,null);
  await page.locator('#missing-price-ack').check();await page.locator('#send-ack').check();
  await page.evaluate(price=>__scenario.price=price,dollars*1e8/Number(fee));await page.clock.runFor(11000);
  await page.locator('#broadcast-send').click();await page.locator('#error').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>__sent.length),0);assert.equal(await page.locator('#missing-price-option').isHidden(),true);
  if(dollars===101)assert.equal(await page.locator('#broadcast-send').isDisabled(),true);
  else {assert.equal(await page.locator('#send-ack').isChecked(),false);assert.match(await page.locator('#fee-usd-notice').innerText(),/High fee/);}
 }
 // A failed refresh prompted by a different asset must not erase a known,
 // still-fresh high quote and turn its hard block into a missing-price waiver.
 await review('trmp',{price:101*1e8/227000,omit:['bitcoin-cash']});
 await page.evaluate(()=>__scenario.price=null);await page.clock.runFor(11000);
 for(const coin of ['bch','trmp']){
  await page.locator('[data-nav=wallet]').click();await page.locator('[data-nav=send]').click();await page.locator(`[data-send-coin=${coin}]`).click();
  await page.locator('#send-max:not([disabled])').waitFor();await page.locator('#send-address').fill(destinations[coin].address);
  await page.locator('#send-amount').fill('10');await page.locator('#review-send').click();await page.locator('#broadcast-send').waitFor();
  if(coin==='bch')assert.equal(await page.locator('#missing-price-option').isVisible(),true);
  else {assert.equal(await page.locator('#missing-price-option').isHidden(),true);assert.equal(await page.locator('#broadcast-send').isDisabled(),true);assert.match(await page.locator('#fee-usd-notice').innerText(),/exceeds \$100/);}
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: all assets read-only automatic fees; quiet normal reviews, $5 warning/$100 unbypassable block, explicit missing-price override, exact signed fee conservation, override reset and recovered-price rechecks.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
