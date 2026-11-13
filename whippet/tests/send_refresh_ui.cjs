// Disposable public seed and send-record fixtures; no live network or broadcasts.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const vault=E.unprotected(webcrypto,recipe),sent='cd'.repeat(32),funding='ab'.repeat(32);
(async()=>{const browser=await chromium.launch();try{for(const scenario of ['pep','wht','reload','offline','background']){
 const coin=scenario==='wht'?'wht':'pep';console.log('Send refresh UI:',scenario);
 const context=await browser.newContext({viewport:{width:390,height:844}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(({vault,coin,sent,funding})=>{
  if(!localStorage.getItem('whippet.dev.encrypted.v1'))localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
  window.fetch=async()=>new Response(JSON.stringify({error:[],result:{}}));
  window.WebSocket=class{constructor(){throw Error('No real network in send refresh test');}};
  window.__confirmed=false;window.__offline=false;window.__hold=false;window.__holdFocused=false;window.__focused=[];window.__full=0;window.__broadcasts=0;
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){Object.defineProperty(window,'WalletNetwork',{value:N});
   const storageKey='corevault.send-attempts.'+WalletLibrary.id(vault);
   if(!localStorage.getItem(storageKey))localStorage.setItem(storageKey,JSON.stringify([{txid:sent,coin,status:'submitted',outpoints:[funding+':0'],refreshIndices:[2,0],balanceRefreshed:false}]));
   N.scan=async(asset,accounts,previous,options={})=>{
    if(options.full)__full++;
    const focused=Boolean(options.indices),confirmed=__confirmed;
    if(focused){__focused.push({coin:asset,indices:options.indices});if(__holdFocused)await new Promise(resolve=>window.__finishFocused=resolve);}
    else if(__hold&&asset===coin&&!options.full)await new Promise(resolve=>window.__finishOld=resolve);
    const rows=accounts.map(account=>{const i=account.index,value=asset!==coin?0n:i===55?900000000n:i===2?(confirmed?0n:500000000n):i===0?(confirmed?400000000n:100000000n):0n;
     return {account,checked:true,confirmed:value,unconfirmed:0n,history:[0,2,55].includes(i)?[{tx_hash:funding,height:490},...(confirmed&&i!==55?[{tx_hash:sent,height:500}]:[])]:[],utxos:[]};});
    return {coin:asset,rows,tip:500,at:Date.now(),everUsed:[0,2,55],confirmed:rows.reduce((n,r)=>n+r.confirmed,0n),unconfirmed:0n,feeRate:1000000n};
   };
   N.confirmation=async(asset,id,address)=>{
    if(asset!==coin||id!==sent||address!==WalletEngine.accounts(ethers,WalletEngine.validateRecipe(ethers,vault.recipe),2)[coin].address)throw Error('Wrong confirmation target');
    if(__offline)throw Error('Offline fixture');return {seen:true,confirmations:__confirmed?1:0};
   };
   N.client=()=>({call:async()=>{__broadcasts++;throw Error('No broadcast allowed');}});
  }});
 },{vault,coin,sent,funding});
 await p.clock.install();await p.goto('http://localhost:8787/');
 const balance=p.locator(`[data-overview-coin=${coin}] .holding-balance`);
 await p.waitForFunction(coin=>document.querySelector(`[data-overview-coin=${coin}] .holding-balance`)?.textContent===`15 ${coin.toUpperCase()}`,coin);
 await p.clock.runFor(4001);assert.equal(await p.evaluate(()=>__focused.length),0,'No focused scan before confirmation');
 if(scenario==='reload'){await p.reload();await p.waitForFunction(()=>__full===4);}
 // Leave an old 200-pool routine call in flight. The focused refresh must not queue behind it.
 await p.evaluate(()=>__hold=true);await p.clock.runFor(4001);await p.waitForFunction(()=>typeof __finishOld==='function');
 if(scenario==='offline'){
  await p.evaluate(()=>{__confirmed=true;__offline=true;});await p.clock.runFor(4001);assert.equal(await p.evaluate(()=>__focused.length),0);
  await p.evaluate(()=>__offline=false);
 }
 if(scenario==='background')await p.evaluate(()=>__holdFocused=true);
 await p.evaluate(()=>__confirmed=true);await p.clock.runFor(4001);await p.waitForFunction(()=>__focused.length>0);
 if(scenario==='background'){
  await p.waitForFunction(()=>typeof __finishFocused==='function');await p.evaluate(()=>window.dispatchEvent(new Event('safecore-pause')));
  await p.evaluate(()=>{__hold=false;__holdFocused=false;__finishFocused();__finishOld();});
  assert.equal(await p.evaluate(()=>document.documentElement.dataset.walletState),'locked');
  await p.evaluate(()=>window.dispatchEvent(new Event('safecore-resume')));await p.waitForFunction(()=>__full===8);
 }else{
  assert.equal(await balance.textContent(),`15 ${coin.toUpperCase()}`,'Changed balances retain the fresh-match delay');
  await p.evaluate(()=>{__hold=false;__finishOld();});
  assert.equal(await balance.textContent(),`15 ${coin.toUpperCase()}`);
 }
 for(let i=0;i<3;i++)await p.clock.runFor(4001);
 await p.waitForFunction(coin=>document.querySelector(`[data-overview-coin=${coin}] .holding-balance`)?.textContent===`13 ${coin.toUpperCase()}`,coin);
 assert.equal(await p.evaluate(coin=>__focused.every(f=>f.coin===coin&&JSON.stringify(f.indices)==='[2,0]'),coin),true);
 // Publishing the balance precedes the serialized send-record write.
 await p.waitForFunction(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('corevault.send-attempts.')).every(([,v])=>JSON.parse(v)[0].balanceRefreshed));
 assert.equal(await p.evaluate(()=>__broadcasts),0);assert.deepEqual(errors,[]);await context.close();
}console.log('PASS: PEP/WHT confirmation-triggered source/change refresh, pending/offline retries, stale-scan suppression, restart/background handling and no rebroadcast.');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
