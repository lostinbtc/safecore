// Disposable public WIF/seed fixtures only. No real wallet, camera or mainnet send.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js'),U=ethers.utils;
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const bytes=U.concat([[158],U.zeroPad([1],32),[1]]),wif=U.base58.encode(U.concat([bytes,U.arrayify(U.sha256(U.sha256(bytes))).slice(0,4)]));
(async()=>{const browser=await chromium.launch();try{
 for(const scenario of ['pep','wht-pinned','progress','many','fee-rise','fee-cushion','timeout','changed','full','cancel','protected','expiry','background']){
  console.log('Sweep UI scenario:',scenario);
  const coin=scenario==='pep'?'pep':'wht',key=T.sweepKey(coin,wif),password='Public-fixture-password';
  const vault=scenario==='protected'?await E.encrypt(webcrypto,recipe,password):E.unprotected(webcrypto,recipe);
  const funding={version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:'',sequence:0xffffffff}],outputs:Array.from({length:scenario==='many'?121:1},()=>({value:500000000n,script:T.script(coin,key.address)})),locktime:0};
  const raw=U.hexlify(T.serialize(funding)).slice(2),txid=T.parse(raw).txid;
  const c=await browser.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await c.addInitScript(({vault,raw,txid,address,scenario})=>{
   localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
   window.fetch=async()=>new Response(JSON.stringify({error:[],result:{}}));
   window.WebSocket=class{constructor(){throw Error('No live network allowed');}};
   window.__broadcasts=[];window.__rescan=[];window.__sourceChecks=0;window.__confirmationMode='pending';window.__confirmationChecks=0;
   Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){Object.defineProperty(window,'WalletNetwork',{value:N});
    N.scan=async(coin,accounts,previous,options)=>{if(options?.full)__rescan.push({coin,count:accounts.length});const used=scenario==='full'?accounts.map(a=>a.index):[0];return {coin,tip:500,at:Date.now(),everUsed:used,confirmed:0n,unconfirmed:0n,feeRate:1000000n,rows:accounts.map(account=>({account,checked:true,confirmed:0n,unconfirmed:0n,history:used.includes(account.index)?[{tx_hash:txid,height:499}]:[],utxos:[]}))};};
    N.sweepSource=async(coin,source)=>{if(source!==address)throw Error('Wrong source');__sourceChecks++;if(scenario==='progress'&&__sourceChecks>1)await new Promise(resolve=>window.__finishSource=resolve);return {snapshot:{tip:500,feeRate:__sourceChecks>1&&scenario==='fee-rise'?1300000n:__sourceChecks>1&&scenario==='fee-cushion'?1100000n:1000000n},utxos:scenario==='changed'&&__sourceChecks>1?[]:Array.from({length:scenario==='many'?121:1},(_,pos)=>({index:0,address,txid,pos,height:499,value:500000000n,raw}))};};
    N.checkInputs=async()=>{};
    N.confirmation=async(coin,id,destination)=>{__confirmationChecks++;const sent=WalletTransactions.parse(__broadcasts[0]);if(sent.txid!==id||sent.outputs[0].script!==WalletTransactions.script(coin,destination))throw Error('Wrong confirmation target');if(__confirmationMode==='hold')await new Promise(resolve=>window.__finishConfirmation=resolve);if(__confirmationMode==='offline')throw Error('Offline fixture');return {seen:__confirmationMode!=='missing',confirmations:__confirmationMode==='confirmed'?1:0};};
    N.client=()=>({call:async(method,params)=>{if(method!=='blockchain.transaction.broadcast')throw Error('Unexpected request');__broadcasts.push(params[0]);if(scenario==='progress')await new Promise(resolve=>window.__finishBroadcast=resolve);if(scenario==='timeout')throw Error('Fixture timeout');return WalletTransactions.parse(params[0]).txid;}});
   }});
  },{vault,raw,txid,address:key.address,scenario});
  if(scenario==='expiry')await p.clock.install();
  await p.goto('http://localhost:8787/');
  if(scenario==='protected'){await p.locator('#lock').click();await p.locator('#unlock-password').fill(password);await p.locator('#unlock-submit').click();}
  await p.waitForFunction(()=>__rescan.length===3);
  await p.locator('#rescan').waitFor();await p.locator('#rescan').click();await p.waitForFunction(()=>__rescan.length===6);
  assert.equal(await p.evaluate(()=>__rescan.every(c=>c.count===200)),true);
  if(scenario==='full')assert.match(await p.locator('#main').innerText(),/wallet addresses are full \(200 used\)/);
  await p.locator('[data-nav=receive]').click();await p.locator('#receive-coin').click();await p.locator(`[data-coin=${coin}]`).click();
  if(scenario==='wht-pinned')await p.locator('#reuse-first').check();
  await p.locator('#sweep-open').click();await p.locator('#sweep-key').waitFor();
  assert.equal(await p.locator('#sweep-key').getAttribute('type'),'password');
  assert.match(await p.locator('#main').innerText(),/Review the estimated network fee before confirming/);
  assert.doesNotMatch(await p.locator('#main').innerText(),/25%|per estimated byte|200 bytes/);
  await p.locator('#sweep-key').fill('invalid');await p.locator('#review-sweep').click();await p.locator('#error').waitFor({state:'visible'});
  assert.equal(await p.evaluate(()=>__sourceChecks),0);
  if(scenario==='wht-pinned'){
   // Feed a rendered WIF QR through the real camera decoder using a synthetic stream.
   await p.evaluate(wif=>{
    const scene=document.createElement('canvas');scene.width=scene.height=480;const ctx=scene.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,480,480);
    const host=document.createElement('div');new QRCode(host,{text:wif,width:320,height:320,correctLevel:QRCode.CorrectLevel.M});ctx.drawImage(host.querySelector('canvas'),80,80);
    window.__tracks=[];navigator.mediaDevices.getUserMedia=async()=>{const stream=scene.captureStream(10);__tracks.push(...stream.getTracks());const pulse=setInterval(()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,1,1);},100);const track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(pulse);stop();};return stream;};
   },wif);
   await p.locator('#scan-key').click();await p.waitForFunction(()=>document.getElementById('scan-status').textContent.includes('Private key scanned'));
   assert.equal(await p.evaluate(()=>__tracks.every(t=>t.readyState==='ended')),true);
  }else await p.locator('#sweep-key').fill(wif);
  if(scenario==='cancel'){
   await p.locator('#review-sweep').click();await p.getByRole('heading',{name:'Review sweep'}).waitFor();
   await p.locator('[data-nav=wallet]').click();await p.locator('[data-nav=receive]').click();await p.locator('#receive-coin').click();await p.locator(`[data-coin=${coin}]`).click();await p.locator('#sweep-open').click();
   assert.equal(await p.locator('#sweep-key').inputValue(),'');assert.equal(await p.evaluate(()=>__broadcasts.length),0);
  }else{
   await p.locator('#review-sweep').click();
   if(scenario==='full'){await p.locator('#error').waitFor({state:'visible'});assert.match(await p.locator('#error').innerText(),/addresses are full/);}
   else{
    await p.getByRole('heading',{name:'Review sweep'}).waitFor();assert.equal(await p.evaluate(()=>__broadcasts.length),0);
    const target=E.accounts(ethers,recipe,scenario==='wht-pinned'?0:1)[coin].address;
    assert.match(await p.locator('#main').innerText(),new RegExp(target));assert.match(await p.locator('#main').innerText(),scenario==='many'?/604\.7740875/:/4\.9975875/);
    assert.doesNotMatch(await p.locator('#main').innerText(),/25%|per estimated byte/);
    assert.equal(await p.locator('#sweep-fee-estimate').innerText(),`Estimated network fee: ${scenario==='many'?'0.2259125':'0.0024125'} ${coin.toUpperCase()}, deducted from the swept balance.`);
    assert.match(await p.locator('#main').innerText(),/Your wallet receives/);
    assert.equal(await p.locator('#broadcast-send').innerText(),'Confirm sweep');
    await p.locator('#broadcast-send').click(); // Missing explicit acknowledgment must not submit.
    assert.equal(await p.evaluate(()=>__broadcasts.length),0);
    assert.equal(await p.locator('#sweep-key').count(),0);
    if(scenario==='expiry'){
     await p.clock.runFor(90001);await p.locator('#sweep-key').waitFor();assert.equal(await p.locator('#sweep-key').inputValue(),'');assert.equal(await p.locator('#broadcast-send').count(),0);assert.equal(await p.evaluate(()=>__broadcasts.length),0);await c.close();continue;
    }
    if(scenario==='background'){
     await p.evaluate(()=>window.dispatchEvent(new Event('safecore-pause')));assert.equal(await p.locator('#broadcast-send').count(),0);
     await p.evaluate(()=>window.dispatchEvent(new Event('safecore-resume')));await p.locator('#receive-coin').click();await p.locator(`[data-coin=${coin}]`).click();await p.locator('#sweep-open').click();assert.equal(await p.locator('#sweep-key').inputValue(),'');assert.equal(await p.evaluate(()=>__broadcasts.length),0);await c.close();continue;
    }
    await p.locator('#send-ack').check();
    if(scenario==='protected'){await p.locator('#send-password').fill('wrong');await p.locator('#broadcast-send').click();await p.locator('#error').waitFor({state:'visible'});assert.equal(await p.evaluate(()=>__broadcasts.length),0);await p.locator('#send-password').fill(password);}
    await p.locator('#broadcast-send').click();
    if(scenario==='progress'){
     await p.waitForFunction(()=>typeof __finishSource==='function');assert.match(await p.locator('#sweep-progress').innerText(),/Rechecking/);assert.equal(await p.locator('#broadcast-send').isDisabled(),true);assert.equal(await p.evaluate(()=>__broadcasts.length),0);
     await p.evaluate(()=>__finishSource());await p.waitForFunction(()=>typeof __finishBroadcast==='function');assert.match(await p.locator('#sweep-progress').innerText(),/Submitting/);assert.equal(await p.locator('#broadcast-send').isDisabled(),true);
     await p.evaluate(()=>document.getElementById('broadcast-send').click());assert.equal(await p.evaluate(()=>__broadcasts.length),1);await p.evaluate(()=>__finishBroadcast());
    }
    if(['timeout','changed','fee-rise'].includes(scenario)){await p.locator('#error').waitFor({state:'visible'});assert.match(await p.locator('#error').innerText(),scenario==='timeout'?/uncertain/:scenario==='fee-rise'?/fee increased/:/outputs changed/);assert.equal(await p.evaluate(()=>__broadcasts.length),scenario==='timeout'?1:0);if(scenario==='timeout')assert.equal(await p.locator('#broadcast-send').isDisabled(),true);}
    else{
     await p.getByRole('heading',{name:'Sweep submitted'}).waitFor();await p.waitForFunction(()=>document.getElementById('sweep-confirmation').textContent.includes('first confirmation'));
     const sent=await p.evaluate(()=>__broadcasts);assert.equal(sent.length,1);const decoded=T.parse(sent[0]);assert.equal(decoded.outputs[0].script,T.script(coin,target));assert.equal(decoded.inputs.length,scenario==='many'?121:1);assert.equal(decoded.outputs.length,1);assert.equal(decoded.outputs[0].value,scenario==='many'?60477408750n:499758750n);
     assert.equal(await p.locator('#broadcast-send').count(),0);assert.match(await p.locator('#main').innerText(),/Closing this page will not cancel/);
     if(['pep','wht-pinned'].includes(scenario)){
      await p.evaluate(()=>__confirmationMode='offline');await p.waitForFunction(()=>document.getElementById('sweep-confirmation').textContent.includes('Retrying automatically'));
      assert.equal(await p.evaluate(()=>__broadcasts.length),1);
      await p.evaluate(()=>__confirmationMode='missing');await p.waitForFunction(()=>document.getElementById('sweep-confirmation').textContent.includes('appear in transaction history'));
      await p.evaluate(()=>__confirmationMode='confirmed');await p.getByRole('heading',{name:'Sweep confirmed',exact:true}).waitFor();assert.equal(await p.evaluate(()=>__broadcasts.length),1);
     }else if(scenario==='progress'){
      await p.evaluate(()=>__confirmationMode='hold');await p.waitForFunction(()=>typeof __finishConfirmation==='function');await p.locator('[data-nav=wallet]').click();
      // Hash navigation renders asynchronously. Resolve the held check only
      // after Overview appears, then prove its late result cannot replace it.
      await p.locator('[data-overview-coin=pep]').waitFor();
      await p.evaluate(()=>{__confirmationMode='confirmed';__finishConfirmation();});assert.equal(await p.locator('#sweep-confirmation').count(),0);assert.equal(await p.locator('[data-overview-coin=pep]').count(),1);
     }
    }
   }
  }
  assert.equal(await p.evaluate(wif=>JSON.stringify({...localStorage}).includes(wif),wif),false);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);await c.close();
 }
 console.log('PASS: main-page Rescan, 200-address full warning, PEP/WHT sweeps, private-key QR decoding, pinned/next-empty destinations, password gate, cancellation, changed-source rejection, uncertain-send guard and no key persistence.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
