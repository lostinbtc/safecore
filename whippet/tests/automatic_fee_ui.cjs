// Public fixture and synthetic outputs only. No real network or broadcasts.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const accounts=E.accounts(ethers,recipe),fixtures={};
for(const coin of ['btc','ltc']){
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:500000000n,script:T.script(coin,accounts[coin].address)}],locktime:0})).slice(2);
 fixtures[coin]={raw,txid:T.parse(raw).txid};
}
(async()=>{const b=await chromium.launch();try{
 for(const coin of ['btc','ltc']){
  const c=await b.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await c.addInitScript(({vault,fixtures})=>{
   localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));window.__rate=1000;window.__relay=.00001;window.__broadcasts=0;
   window.fetch=async()=>new Response(JSON.stringify({bitcoin:{usd:100000,last_updated_at:Math.floor(Date.now()/1000)},litecoin:{usd:100,last_updated_at:Math.floor(Date.now()/1000)}}));
   window.WebSocket=class{constructor(){throw Error('Live network forbidden');}};
   Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){Object.defineProperty(window,'WalletNetwork',{value:N});
    N.scan=async(coin,pool)=>({coin,tip:500,at:Date.now(),complete:true,confirmed:fixtures[coin]?500000000n:0n,unconfirmed:0n,everUsed:fixtures[coin]?[0]:[],feeRate:BigInt(__rate),rows:pool.map((account,i)=>({account,checked:true,confirmed:i||!fixtures[coin]?0n:500000000n,unconfirmed:0n,history:[],utxos:i||!fixtures[coin]?[]:[{...fixtures[coin],address:account.address,index:0,pos:0,height:499,value:500000000n}]}))});
    N.spendable=async s=>s.rows.flatMap(r=>r.utxos);N.checkInputs=async()=>{};
    N.client=()=>({call:async(method)=>{if(method==='blockchain.relayfee')return __relay;__broadcasts++;throw Error('No broadcast allowed');}});
   }});
  },{vault:E.unprotected(webcrypto,recipe),fixtures});
  await p.clock.install();await p.clock.pauseAt(new Date());await p.goto('http://localhost:8787/#send');
  await p.locator(`[data-send-coin=${coin}]`).click();await p.locator('#send-address').fill(E.accounts(ethers,recipe,1)[coin].address);
  await p.locator('#send-max').click();
  assert.equal(await p.locator('#send-amount').inputValue(),'5','Max is the payment budget, never the fee');
  assert.equal(await p.locator('#automatic-fee').innerText(),'0.00000227 '+coin.toUpperCase());
  assert.equal(await p.locator('.automatic-fee span').innerText(),'Estimated network fee');
  assert.equal(await p.locator('#automatic-fee').evaluate(el=>el.tagName==='OUTPUT'&&!el.isContentEditable),true);
  for(const theme of ['dark','light'])for(const width of [320,390,430]){
   await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await p.setViewportSize({width,height:844});
   const review=await p.locator('#review-send').boundingBox(),cancel=await p.locator('#send-form .form-actions > a').boundingBox();
   assert.ok(Math.abs(review.width-cancel.width)<1&&Math.abs(review.height-cancel.height)<1,'Matching action dimensions');
   assert.equal(review.y,cancel.y,'Aligned action row');assert.ok(review.height>=44&&cancel.height>=44,'Touch-sized actions');
   assert.ok(cancel.x>=review.x+review.width+9,'Distinct tap targets');
   assert.equal(await p.locator('#send-form .form-actions > a').getAttribute('href'),'#wallet');
   for(const field of await p.locator('#send-address, #send-amount').all()){
    assert.equal((await field.boundingBox()).height,44,'Compact fields keep a usable touch target');
    assert.deepEqual(await field.evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.borderTopWidth,s.borderBottomWidth,s.fontSize];}),['rgba(0, 0, 0, 0)','0px','1px','16px'],'Underline-only fields stay readable in both themes');
   }
   for(const control of await p.locator('#send-form .form-actions > *, #scan-address').all()){
    await control.hover();assert.deepEqual(await control.evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.borderTopWidth,s.borderRadius];}),['rgba(0, 0, 0, 0)','0px','0px'],'Send controls use the unboxed glow style');
   }
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await p.evaluate(()=>document.documentElement.dataset.theme='dark');await p.setViewportSize({width:390,height:844});
  await p.screenshot({path:`/tmp/safecore-automatic-fee-${coin}.png`,fullPage:true});
  assert.equal(await p.locator('#send-form input[inputmode=decimal]').count(),1,'Only one editable monetary input');
  await p.evaluate(()=>__rate=2000);await p.clock.runFor(299000);
  assert.equal(await p.locator('#automatic-fee').innerText(),'0.00000227 '+coin.toUpperCase(),'Estimate holds for five minutes');
  await p.clock.runFor(6000);await p.waitForFunction(()=>document.getElementById('automatic-fee').textContent.startsWith('0.00000454'));
  await p.locator('#review-send').click();await p.locator('#send-ack').check();await p.evaluate(()=>__relay=.001);
  await p.locator('#broadcast-send').click();await p.locator('#error').waitFor({state:'visible'});
  assert.match(await p.locator('#error').innerText(),/higher fee/);assert.equal(await p.evaluate(()=>__broadcasts),0);
  assert.equal(await p.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('corevault.send-attempts.'))),false,'Relay failure must not reserve or broadcast');
  await p.locator('[data-nav=wallet]').click();await p.locator('[data-nav=send]').click();await p.locator(`[data-send-coin=${coin}]`).click();
  await p.locator('#send-address').fill(E.accounts(ethers,recipe,1)[coin].address);await p.locator('#send-max').click();
  await p.clock.runFor(299000);await p.locator('#review-send').click();await p.locator('#send-ack').waitFor();
  await p.clock.runFor(2000);await p.locator('#send-ack').check();await p.locator('#broadcast-send').click();
  await p.locator('#error').waitFor({state:'visible'});assert.match(await p.locator('#error').innerText(),/Fee estimate expired/);
  assert.equal(await p.evaluate(()=>__broadcasts),0,'A fresh review cannot extend an old fee quote');
  assert.deepEqual(errors,[]);await c.close();
 }
 console.log('PASS: BTC/LTC read-only automatic fee, one editable total, Max conservation, five-minute hold/refresh and raised-relay blocking without broadcast.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
