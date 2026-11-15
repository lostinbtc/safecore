// Empty-chain fixture: receiving must work without an existing balance.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(context);
  const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),accounts=E.accounts(ethers,recipe);
  await context.addInitScript(v=>{if(!localStorage.getItem('whippet.dev.encrypted.v1'))localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));},E.unprotected(webcrypto,recipe));
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const choose=async coin=>{await p.locator(`[data-coin="${coin}"]`).click();await p.locator('#address').waitFor();};
  const empty=async()=>{assert.match(await p.locator('#receive-coin').innerText(),/Choose an asset/);assert.equal(await p.locator('#address, #qr, #copy-address, #reuse-first').count(),0);};
  const settled=()=>p.waitForFunction(()=>{
   const vault=JSON.parse(localStorage.getItem('whippet.dev.encrypted.v1')),id=WalletLibrary.id(vault);
   return Object.keys(WalletEngine.NETWORKS).filter(coin=>!['bonc','jkc','lky','cat','flop'].includes(coin)).every(coin=>{
    const snapshot=JSON.parse(localStorage.getItem('corevault.balance.'+id+'.'+coin)||'null');
    return snapshot?.complete===true&&snapshot.rows.length===200&&snapshot.rows.every(row=>row.checked!==false);
   });
  });
  await p.goto('http://localhost:8787/');
  await settled(); // A partial discovery must not hide an invalid final fixture fee.
  await p.locator('[data-nav="receive"]').click();await empty();
  assert.equal(await p.locator('.page-head').innerText(),'Receive');
  assert.equal(await p.locator('[data-coin]').count(),13);
  assert.equal(await p.locator('details.wallet-coin-switch, .picker-chevron').count(),0);
  assert.equal(await p.locator('[data-coin=pep]').isVisible(),true);
  assert.equal(await p.locator('[data-coin=wht]').isVisible(),true);
  assert.equal(await p.locator('.wallet-coin-switch > p').count(),0,'Redundant Receive helper removed');
  for(const el of await p.locator('[data-coin]').all()){const box=await el.boundingBox();assert.ok(box.height>=44&&box.height<=48,'Compact asset rows retain touch height');}
  assert.deepEqual(await p.locator('[data-coin]').evaluateAll(rows=>rows.map(row=>row.dataset.coin)),['bel','btc','bch','dash','dgb','dingo','doge','ltc','pep','rvn','shic','trmp','wht']);
  const boxes=await Promise.all((await p.locator('[data-coin]').all()).map(row=>row.boundingBox()));
  for(let i=1;i<boxes.length;i++){const gap=boxes[i].y-boxes[i-1].y-boxes[i-1].height;assert.ok(gap>=0&&gap<=4,'Adjacent asset rows have a compact gap');}
  for(const theme of ['dark','light']){
   await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await p.locator('[data-coin=wht]').hover();
   assert.deepEqual(await p.locator('[data-coin=wht]').evaluate(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.boxShadow,s.backgroundColor];}),['0px','none','rgba(0, 0, 0, 0)'],'Coin choices remain unboxed, including hover and light theme');
  }
  await p.evaluate(()=>document.documentElement.dataset.theme='dark');
  await p.screenshot({path:'/tmp/safecore-receive-choices.png'});
  await choose('pep');assert.equal(await p.locator('#address').textContent(),accounts.pep.address);
  assert.equal(await p.locator('[data-coin]').count(),0,'Selected Receive has no other coin touch targets');
  assert.equal(await p.locator('#receive-selected-name').innerText(),'Pepecoin');
  await p.locator('#receive-selected-name').click();
  assert.equal(await p.locator('#address').textContent(),accounts.pep.address,'Selected asset name is not a switch');
  for(const theme of ['dark','light']){
   await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   for(const id of ['copy-address','sweep-open']){
    const control=p.locator('#'+id);await control.hover();
    assert.deepEqual(await p.evaluate(id=>{const s=getComputedStyle(document.getElementById(id));return [s.backgroundColor,s.borderTopWidth,s.textDecorationLine,s.fontSize];},id),['rgba(0, 0, 0, 0)','0px','none','14px']);
    assert.ok((await control.boundingBox()).height>=44);
   }
   assert.equal(await p.evaluate(()=>{const a=document.getElementById('copy-address').getAnimations()[0],b=document.getElementById('sweep-open').getAnimations()[0];return a?.startTime===0&&b?.startTime===0;}),true,'Receive controls share the continuous glow timeline');
   assert.equal(await p.locator('#copy-address svg').evaluate(el=>el.getAnimations().some(a=>a.animationName==='control-icon-glow'&&a.startTime===0)),true,'Clipboard icon shares the text glow phase');
  }
  await p.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await p.locator('#copy-address svg').evaluate(el=>getComputedStyle(el).animationName),'none');
  await p.emulateMedia({reducedMotion:'no-preference'});
  await p.locator('#reuse-first').check();
  assert.equal(await p.locator('[data-coin]').count(),0,'Address preference changes do not reopen asset picker');
  await require('./open_receive_picker.cjs')(p);await empty();
  await choose('wht');assert.equal(await p.locator('#address').textContent(),accounts.wht.address);assert.equal(await p.locator('#reuse-first').isChecked(),false);await p.locator('#reuse-first').check();
  await p.locator('[data-nav="wallet"]').click();await p.locator('.holdings').waitFor();assert.equal(await p.locator('.holding-row').count(),13);
  await p.locator('[data-nav="receive"]').click();await empty();await choose('pep');assert.equal(await p.locator('#reuse-first').isChecked(),true);
  await p.reload();await settled();await empty();await choose('wht');assert.equal(await p.locator('#reuse-first').isChecked(),true);
  assert.equal(await p.locator('#previous-address').isDisabled(),true);assert.equal(await p.locator('#next-address').isDisabled(),true);
  assert.equal(await p.locator('#address').textContent(),accounts.wht.address);
  for(const coin of ['bel','btc','bch','dash','dgb','dingo','doge','ltc','pep','rvn','shic','trmp','wht']){
   await p.locator('[data-nav=wallet]').click();await p.locator(`[data-overview-coin=${coin}]`).click();
   await p.locator('#asset-receive').click();
   await p.locator('#address').waitFor();assert.equal(await p.locator('#address').textContent(),accounts[coin].address,coin+' receiving address after completed discovery');
   assert.equal(await p.locator('[data-coin]').count(),0,'Direct Receive is locked to its selected coin');
   assert.equal(await p.locator('#receive-selected-name').innerText(),E.NETWORKS[coin].name);
   for(const width of [320,390,430]){
    await p.setViewportSize({width,height:844});
    // Measure one DOM snapshot; a live poll may replace Receive between awaits.
    const [row,label,back]=await p.evaluate(()=>['.receive-selected-coin','.receive-selected-label','#receive-overview'].map(s=>document.querySelector(s).getBoundingClientRect().toJSON()));
    assert.ok(Math.abs(label.x+label.width/2-row.x-row.width/2)<1,'Selected asset stays centered independently of Overview');
    assert.ok(back.x===row.x&&back.x+back.width<=label.x,'Overview is left aligned and does not overlap the asset');
    assert.ok(back.height>=44);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   await p.setViewportSize({width:390,height:844});
   const [qr,addressNav,address]=await p.evaluate(()=>['#qr','.address-navigation','#address'].map(s=>document.querySelector(s).getBoundingClientRect().toJSON()));
   assert.equal(qr.width,176,'QR scanning size is unchanged');
   assert.ok(addressNav.y>=qr.y+qr.height&&address.y>=addressNav.y+addressNav.height,'QR, full Previous/number/Next row, then address');
   for(const height of [740,844]){
    await p.setViewportSize({width:390,height});
    assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false,'Normal Receive fits without scrolling');
    const [sweep,nav]=await p.evaluate(()=>['#sweep-open','.bottom-navigation'].map(s=>document.querySelector(s).getBoundingClientRect().toJSON()));
    assert.ok(sweep.y+sweep.height<=nav.y,'Sweep control clears navigation');
   }
   await p.setViewportSize({width:390,height:420});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight>innerHeight),true,'Short screens retain necessary scrolling');
   await p.setViewportSize({width:390,height:844});
   if(coin==='bel')await p.screenshot({path:'/tmp/safecore-receive-compact.png'});
   assert.equal(await p.locator('.page-head').innerText(),'Receive');
   await p.locator('#receive-overview').click();await p.locator('.holdings').waitFor();
   assert.equal(await p.locator('#address').count(),0,'Overview leaves the selected Receive screen');
  }
  await p.locator('[data-nav=send]').click();await p.locator('#send-coin').waitFor();assert.equal(await p.locator('.page-head').innerText(),'Send');
  await p.locator('[data-nav=receive]').click();await empty();
  assert.deepEqual(errors,[]);console.log('PASS: Receive requires an explicit asset choice; zero-balance coins supported; correct per-network address; independent Overview selection; first-address pins survive route changes and reload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
