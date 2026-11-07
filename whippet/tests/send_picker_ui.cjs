// Disposable profile, public seed and mocked balances. Never broadcast.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await require('./funded_network.cjs')(context);
  const vault=E.unprotected(webcrypto,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
  await context.addInitScript(v=>{if(!localStorage.getItem('whippet.dev.encrypted.v1'))localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));},vault);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));await page.goto('http://localhost:8787/#send');
  const choose=async coin=>{await page.locator(`[data-send-coin="${coin}"]`).click();};
  await page.waitForFunction(()=>document.querySelectorAll('[data-send-coin]').length===2);
  assert.match(await page.locator('#send-coin').innerText(),/Choose an asset/);
  assert.equal(await page.locator('details.wallet-coin-switch, .picker-chevron').count(),0);
  assert.equal(await page.locator('[data-send-coin=pep]').isVisible(),true);
  assert.equal(await page.locator('[data-send-coin=wht]').isVisible(),true);
  assert.equal(await page.locator('.wallet-coin-switch > p').innerText(),'With a balance');
  for(const el of await page.locator('[data-send-coin]').all()){const box=await el.boundingBox();assert.ok(box.height>=48&&box.height<=54,'Compact asset rows retain touch height');}
  assert.deepEqual(await page.locator('[data-send-coin=pep]').evaluate(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.boxShadow,s.backgroundColor];}),['0px','none','rgba(0, 0, 0, 0)']);
  await page.screenshot({path:'/tmp/safecore-send-choices.png'});
  assert.equal(await page.locator('#send-form').count(),0);
  assert.match(await page.locator('[data-send-coin="wht"]').textContent(),/50 WHT/);
  await page.evaluate(()=>localStorage.setItem('corevault.hidden-coins.v1',JSON.stringify(['wht','doge'])));
  assert.equal(await page.locator('[data-send-coin="wht"]').count(),1);
  assert.equal(await page.locator('[data-send-coin="doge"]').count(),0);
  await choose('pep');await page.locator('#send-address').fill('old-recipient');await page.locator('#send-amount').fill('2');
  // A stale response from the previous asset must not overwrite the new form.
  await page.evaluate(()=>{const original=WalletNetwork.spendable;WalletNetwork.spendable=s=>s.coin==='wht'?new Promise(resolve=>{window.__releaseSpend=()=>resolve([]);}):original(s);});
  await choose('wht');assert.equal(await page.locator('#send-address').inputValue(),'');assert.equal(await page.locator('#send-amount').inputValue(),'');
  await page.waitForFunction(()=>window.__releaseSpend);await choose('pep');
  await page.locator('#send-address').fill('keep-this');await page.locator('#send-amount').fill('3');
  await page.evaluate(()=>__releaseSpend());await page.clock.runFor(4000);
  assert.equal(await page.locator('[data-send-coin=pep]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#send-address').inputValue(),'keep-this');assert.equal(await page.locator('#send-amount').inputValue(),'3');
  // Accepted zero balances disappear without choosing a different asset for us.
  await page.evaluate(()=>{__balances.wht=0;});await page.clock.runFor(4000);
  assert.equal(await page.locator('[data-send-coin="wht"]').count(),1);
  await page.clock.runFor(4001);assert.equal(await page.locator('[data-send-coin="wht"]').count(),0);
  await page.locator('[data-nav="receive"]').click();await page.locator('[data-nav="send"]').click();
  assert.match(await page.locator('#send-coin').innerText(),/Choose an asset/);assert.equal(await page.locator('#send-form').count(),0);
  // A known zero is not an unknown balance, and neither may authorize a send.
  await page.evaluate(()=>{__balances.pep=0;});await page.clock.runFor(8001);
  assert.equal(await page.locator('[data-send-coin]').count(),0);await page.locator('#send-coin').click();
  assert.match(await page.locator('#send-picker').innerText(),/No assets with a balance/);
  for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.reload();assert.match(await page.locator('#send-coin').innerText(),/Choose an asset/);
  assert.deepEqual(errors,[]);
  console.log('PASS: no default send asset; funded picker; zero/stub exclusion; independent network switching; cleared drafts; late callback protection; background refresh preserves input; 4-second polling/stability; phone layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
