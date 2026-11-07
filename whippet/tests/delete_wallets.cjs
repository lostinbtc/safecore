// Disposable browser and public fixtures only. Never deletes a user's wallet.
const assert=require('node:assert/strict'),{chromium}=require('./browser-helper.cjs');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const c=await b.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(c);
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://localhost:8787/');
  const ids=await p.evaluate(()=>{
   const recipe=WalletEngine.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),lib=WalletLibrary.create(localStorage),ids=[];
   for(const name of ['First fixture','Second fixture','Active fixture']){const v=WalletEngine.unprotected(crypto,recipe);lib.save(v,name);ids.push(WalletLibrary.id(v));}
   for(const id of ids){localStorage.setItem('corevault.receive.'+id,'{}');localStorage.setItem('corevault.send-attempts.'+id,'[]');localStorage.setItem('corevault.komodo-recovery.'+id,'true');}
   localStorage.setItem('unrelated','preserve');return ids;
  });
  await p.goto('http://localhost:8787/#wallets');
  await p.reload();
  const initial=await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1'));
  await p.locator(`.saved-wallet:has([data-delete-wallet="${ids[0]}"]) > summary`).click();
  await p.locator(`[data-delete-wallet="${ids[0]}"]`).click();
  assert.match(await p.locator('.notice').innerText(),/First fixture/);
  for(const height of [844,420,320]){
   await p.setViewportSize({width:390,height});await p.locator('#delete-confirm').focus();
   await p.waitForFunction(()=>{const r=document.getElementById('delete-confirm').getBoundingClientRect(),b=WalletViewport.bounds();return r.top>=b.top&&r.top<=b.top+42&&r.bottom<=b.bottom;});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await p.screenshot({path:'/tmp/safecore-delete-focused.png',fullPage:false});
  await p.setViewportSize({width:390,height:844});
  await p.locator('#confirm-remove').click();
  assert.equal(await p.evaluate(()=>WalletLibrary.create(localStorage).list().length),3);
  await p.locator('#delete-confirm').fill('REMOVE');await p.locator('#delete-ack').check();await p.locator('#confirm-remove').click();
  await p.waitForFunction(()=>document.querySelectorAll('.saved-wallet').length===2);
  assert.equal(await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')),initial);
  assert.equal(await p.evaluate(id=>localStorage.getItem('corevault.receive.'+id),ids[0]),null);
  assert.equal(await p.evaluate(id=>localStorage.getItem('corevault.receive.'+id),ids[1]),'{}');
  assert.equal(await p.evaluate(id=>localStorage.getItem('corevault.komodo-recovery.'+id),ids[0]),null);
  assert.equal(await p.evaluate(id=>localStorage.getItem('corevault.komodo-recovery.'+id),ids[1]),'true');
  await p.locator(`.saved-wallet:has([data-delete-wallet="${ids[1]}"]) > summary`).click();
  await p.locator(`[data-delete-wallet="${ids[1]}"]`).click();await p.locator('#cancel-remove').click();
  await p.locator('.saved-wallet').first().waitFor();
  assert.equal(await p.locator('.saved-wallet').count(),2);
  for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await p.screenshot({path:'whippet/test-results/wallet-delete-list.png',fullPage:true});
  await p.locator(`.saved-wallet:has([data-delete-wallet="${ids[2]}"]) > summary`).click();
  await p.locator(`[data-delete-wallet="${ids[2]}"]`).click();await p.locator('#delete-confirm').fill('REMOVE');await p.locator('#delete-ack').check();await p.locator('#confirm-remove').click();
  await p.locator('#security-cta').waitFor();
  assert.equal(await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')),null);
  assert.equal(await p.evaluate(()=>WalletLibrary.create(localStorage).list().length),1);
  assert.equal(await p.evaluate(()=>localStorage.getItem('unrelated')),'preserve');
  await p.reload();await p.locator('.wallets-shortcut').click();await p.locator('.saved-wallet').first().waitFor();assert.equal(await p.locator('.saved-wallet').count(),1);
  assert.deepEqual(errors,[]);console.log('PASS: targeted inactive/active wallet deletion, cancel/confirmation guards, scoped cache cleanup, other-wallet preservation and phone layout.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
