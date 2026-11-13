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
  await p.goto('http://localhost:8787/');
  await p.locator('[data-nav="receive"]').click();await empty();
  assert.equal(await p.locator('.page-head').innerText(),'Receive');
  assert.equal(await p.locator('[data-coin]').count(),4);
  assert.equal(await p.locator('details.wallet-coin-switch, .picker-chevron').count(),0);
  assert.equal(await p.locator('[data-coin=pep]').isVisible(),true);
  assert.equal(await p.locator('[data-coin=wht]').isVisible(),true);
  assert.equal(await p.locator('.wallet-coin-switch > p').count(),0,'Redundant Receive helper removed');
  for(const el of await p.locator('[data-coin]').all()){const box=await el.boundingBox();assert.ok(box.height>=48&&box.height<=54,'Compact asset rows retain touch height');}
  assert.deepEqual(await p.locator('[data-coin]').evaluateAll(rows=>rows.map(row=>row.dataset.coin)),['pep','ltc','shic','wht']);
  const boxes=await Promise.all((await p.locator('[data-coin]').all()).map(row=>row.boundingBox()));
  for(let i=1;i<boxes.length;i++){const gap=boxes[i].y-boxes[i-1].y-boxes[i-1].height;assert.ok(gap>=0&&gap<=4,'Adjacent asset rows have a compact gap');}
  for(const theme of ['dark','light']){
   await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await p.locator('[data-coin=wht]').hover();
   assert.deepEqual(await p.locator('[data-coin=wht]').evaluate(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.boxShadow,s.backgroundColor];}),['0px','none','rgba(0, 0, 0, 0)'],'Coin choices remain unboxed, including hover and light theme');
  }
  await p.evaluate(()=>document.documentElement.dataset.theme='dark');
  await p.screenshot({path:'/tmp/safecore-receive-choices.png'});
  await choose('pep');assert.equal(await p.locator('#address').textContent(),accounts.pep.address);await p.locator('#reuse-first').check();
  await choose('wht');assert.equal(await p.locator('#address').textContent(),accounts.wht.address);assert.equal(await p.locator('#reuse-first').isChecked(),false);await p.locator('#reuse-first').check();
  await p.locator('[data-nav="wallet"]').click();await p.locator('.holdings').waitFor();assert.equal(await p.locator('.holding-row').count(),4);
  await p.locator('[data-nav="receive"]').click();await empty();await choose('pep');assert.equal(await p.locator('#reuse-first').isChecked(),true);
  await p.reload();await empty();await choose('wht');assert.equal(await p.locator('#reuse-first').isChecked(),true);
  assert.equal(await p.locator('#previous-address').isDisabled(),true);assert.equal(await p.locator('#next-address').isDisabled(),true);
  assert.equal(await p.locator('#address').textContent(),accounts.wht.address);
  for(const coin of ['pep','wht','shic']){
   await p.locator('[data-nav=wallet]').click();await p.locator(`[data-overview-coin=${coin}]`).click();
   await p.locator('#address').waitFor();assert.equal(await p.locator('#address').textContent(),accounts[coin].address);
   assert.equal(await p.locator('.page-head').innerText(),'Receive');
  }
  await p.locator('[data-nav=send]').click();await p.locator('#send-coin').waitFor();assert.equal(await p.locator('.page-head').innerText(),'Send');
  await p.locator('[data-nav=receive]').click();await empty();
  assert.deepEqual(errors,[]);console.log('PASS: Receive requires an explicit asset choice; zero-balance coins supported; correct per-network address; independent Overview selection; first-address pins survive route changes and reload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
