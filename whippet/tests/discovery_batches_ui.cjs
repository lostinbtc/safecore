// Isolated public fixtures only: delayed scan batches never use a real wallet.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
 const vault=E.unprotected(webcrypto,recipe),other=E.unprotected(webcrypto,recipe);
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(vault=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
  window.fetch=async()=>new Response(JSON.stringify({error:[],result:{}}));
  window.WebSocket=class{constructor(){throw Error('Real network forbidden');}};
  window.__runs=[];
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){
   Object.defineProperty(window,'WalletNetwork',{value:N});
   N.scan=(coin,accounts,previous,options)=>new Promise((resolve,reject)=>__runs.push({coin,accounts,previous,options,resolve,reject}));
  }});
  window.__emit=(index,count,finish=false)=>{
   const run=__runs[index],used=[0,35].filter(i=>i<count);
   const rows=run.accounts.map((account,i)=>({account,checked:i<count,confirmed:used.includes(i)?100000000n:0n,unconfirmed:0n,
    history:used.includes(i)?[{tx_hash:(i+1).toString(16).padStart(64,'0'),height:499}]:[],utxos:[]}));
   const snapshot={coin:run.coin,at:Date.now(),complete:finish,cached:false,tip:500,rows,everUsed:used,
    confirmed:BigInt(used.length)*100000000n,unconfirmed:0n,feeRate:1000000n};
   if(finish)run.resolve(snapshot);else run.options.onBatch(snapshot);
  };
 },vault);
 await page.clock.install();await page.clock.pauseAt(new Date());
 await page.goto('http://localhost:8787/#wallet');await page.waitForFunction(()=>__runs.length===3);
 const pep=await page.evaluate(()=>__runs.findIndex(r=>r.coin==='pep')),wht=await page.evaluate(()=>__runs.findIndex(r=>r.coin==='wht'));
 const pepRow=page.locator('[data-overview-coin="pep"]');
 await page.evaluate(i=>__emit(i,20),pep);
 assert.match(await pepRow.locator('.holding-balance').innerText(),/^1 PEP$/);
 assert.equal(await pepRow.locator('.holding-status').innerText(),'','No progress alert or status clutter');
 assert.equal(await page.locator('#toast').innerText(),'');
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('corevault.balance.'))),false,'Partial scans are not cached');
 await page.locator('[data-nav="send"]').click();assert.equal(await page.locator('[data-send-coin="pep"]').isDisabled(),true);
 await page.locator('[data-nav="receive"]').click();await page.locator('[data-coin="pep"]').click();
 await page.locator('#address').waitFor();assert.equal(await page.locator('#address-number').innerText(),'Address #2','Receive uses checked unused address while discovery continues');
 await page.locator('[data-nav="wallet"]').click();await page.evaluate(i=>__emit(i,40),pep);
 assert.match(await pepRow.locator('.holding-balance').innerText(),/^2 PEP$/);
 await page.evaluate(i=>__emit(i,200,true),wht);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.endsWith('.wht')&&k.startsWith('corevault.balance.')));
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.endsWith('.pep')&&k.startsWith('corevault.balance.'))),false,'Coins finish independently');
 await page.clock.runFor(4100);assert.equal(await page.evaluate(()=>__runs.filter(r=>r.coin==='pep').length),1,'Routine polling does not duplicate discovery');
 await page.evaluate(i=>__runs[i].reject(Error('Fixture timeout')),pep);
 await page.waitForFunction(()=>document.querySelector('[data-overview-coin="pep"] .holding-status').textContent.includes('Unable to refresh'));
 assert.match(await pepRow.locator('.holding-balance').innerText(),/^2 PEP$/,'Failure keeps already discovered balance');
 await page.clock.runFor(4100);
 const retry=await page.evaluate(()=>__runs.findLastIndex(r=>r.coin==='pep'));
 assert.notEqual(retry,pep);assert.equal(await page.evaluate(i=>__runs[i].options.full,retry),true);
 await page.evaluate(i=>{__emit(i,200);__emit(i,200,true);},retry);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.endsWith('.pep')&&k.startsWith('corevault.balance.')));
 await page.locator('[data-nav="send"]').click();assert.equal(await page.locator('[data-send-coin="pep"]').isDisabled(),false);
 await page.locator('[data-nav="security"]').click();assert.equal(await page.locator('#show-seed').count(),0);
 // New wallet starts independently; a late old-wallet batch cannot populate it.
 await page.evaluate(v=>{localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));dispatchEvent(new StorageEvent('storage',{key:'whippet.dev.encrypted.v1'}));},other);
 await page.locator('[data-nav="wallet"]').click();
 await page.evaluate(i=>__emit(i,200),pep);
 assert.match(await pepRow.locator('.holding-balance').innerText(),/^\* PEP$/);
 const newPep=await page.evaluate(()=>__runs.findLastIndex(r=>r.coin==='pep'));
 assert.equal(await page.evaluate(i=>__runs[i].options.isActive(),pep),false);
 await page.evaluate(i=>__emit(i,20),newPep);assert.match(await pepRow.locator('.holding-balance').innerText(),/^1 PEP$/);
 await page.evaluate(()=>dispatchEvent(new Event('safecore-pause')));
 await page.evaluate(i=>__emit(i,200),newPep);
 assert.equal(await page.evaluate(i=>__runs[i].options.isActive(),newPep),false,'Backgrounding invalidates in-flight work');
 const otherId=await page.evaluate(v=>WalletLibrary.id(v),other);
 assert.equal(await page.evaluate(id=>localStorage.getItem('corevault.balance.'+id+'.pep'),otherId),null);
 assert.deepEqual(errors,[]);
 console.log('PASS: quiet batch balances, early verified Receive, Send/cache gate, independent assets, retry, no duplicate scans, stale-wallet/background guards, no duplicate Security recovery.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
