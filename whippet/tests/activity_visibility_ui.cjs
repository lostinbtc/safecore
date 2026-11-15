// Public throwaway seed and synthetic history; no network or broadcasts.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const c=await browser.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const vault=E.unprotected(webcrypto,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
 await c.addInitScript(v=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));
  window.__histories=['pep'];window.__fail=false;window.__hold=true;window.__release=[];
  window.fetch=async()=>new Response('{}');window.WebSocket=class{constructor(){throw Error('Network forbidden');}};
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){
   Object.defineProperty(window,'WalletNetwork',{value:N,configurable:true});N.onChange=fn=>window.__notify=fn;
   N.scan=async(coin,accounts)=>{
    if(__hold)await new Promise(resolve=>__release.push(resolve));
    if(__fail)throw Error('Offline fixture');
    return {coin,tip:100,at:Date.now(),confirmed:0n,unconfirmed:0n,everUsed:__histories.includes(coin)?[0]:[],feeRate:1000000n,
     rows:accounts.map((account,i)=>({account,confirmed:0n,unconfirmed:0n,utxos:[],history:!i&&__histories.includes(coin)?[{tx_hash:(coin==='pep'?'a':'b').repeat(64),height:90}]:[]}))};
   };
  }});
 },vault);
 await p.clock.install();await p.clock.pauseAt(new Date(Date.now()+100));await p.goto('http://localhost:8787/#activity');
 await p.locator('#activity-status').waitFor();assert.match(await p.locator('#activity-status').innerText(),/Checking transactions/);
 assert.equal(await p.locator('[data-activity-coin]').count(),0,'Loading does not create empty coin rows');
 await p.evaluate(()=>{__hold=false;__release.forEach(resolve=>resolve());});
 for(let i=0;i<3;i++)await p.clock.runFor(4001);
 const coins=()=>p.locator('[data-activity-coin]').evaluateAll(rows=>rows.map(row=>row.dataset.activityCoin));
 assert.deepEqual(await coins(),['pep'],'Zero-balance coin with history stays visible; empty coins do not');
 await p.locator('[data-activity-coin=pep] summary').click();
 await p.evaluate(()=>{__histories.push('shic');__notify('shic');});
 for(let i=0;i<3;i++)await p.clock.runFor(4001);
 assert.deepEqual(await coins(),['pep','shic'],'New history adds the coin automatically');
 assert.equal(await p.locator('[data-activity-coin=pep]').evaluate(el=>el.open),true,'Existing expanded history survives a newly arriving coin');
 await p.evaluate(()=>{const key='corevault.send-attempts.'+WalletLibrary.id(JSON.parse(localStorage.getItem('whippet.dev.encrypted.v1')));localStorage.setItem(key,JSON.stringify([{coin:'doge',txid:'c'.repeat(64),outpoints:['d'.repeat(64)+':0'],at:Date.now(),status:'unknown'}]));__notify('doge');});
 for(let i=0;i<3;i++)await p.clock.runFor(4001);
 assert.deepEqual(await coins(),['doge','pep','shic'],'Uncertain submitted sends remain visible without server history');
 await p.locator('[data-activity-coin=doge] summary').click();
 assert.match(await p.locator('[data-activity-coin=doge] .activity-outstanding').innerText(),/Submission uncertain/);
 await p.evaluate(()=>__fail=true);await p.clock.runFor(4001);
 assert.deepEqual(await coins(),['doge','pep','shic'],'A refresh failure does not erase recorded history');
 assert.match(await p.locator('#activity-status').innerText(),/could not be refreshed/);
 await p.evaluate(()=>{__fail=false;__histories=[];const key='corevault.send-attempts.'+WalletLibrary.id(JSON.parse(localStorage.getItem('whippet.dev.encrypted.v1')));localStorage.removeItem(key);});
 for(let i=0;i<3;i++)await p.clock.runFor(4001);
 assert.deepEqual(await coins(),[]);assert.equal(await p.locator('#activity-status').innerText(),'No transactions yet.');
 assert.equal(await p.locator('.activity-coin-heading').isHidden(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: Activity hides empty coins, distinguishes loading/offline/empty states, retains zero-balance history and uncertain sends, and adds new history without collapsing other assets.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
