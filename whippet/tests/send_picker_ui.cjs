// Disposable profile, public seed and mocked balances. Never broadcast.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await require('./funded_network.cjs')(context);
  const vault=E.unprotected(webcrypto,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
  await context.addInitScript(v=>{if(!localStorage.getItem('whippet.dev.encrypted.v1'))localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));},vault);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));await page.goto('http://localhost:8787/#send');
  const choose=async coin=>{if(await page.locator('#change-send-coin').isVisible()&&await page.locator('#send-coin-options').isHidden())await page.locator('#change-send-coin').click();await page.locator(`[data-send-coin="${coin}"]`).tap();};
  await page.waitForFunction(()=>document.querySelectorAll('[data-send-coin]').length===2);
  assert.match(await page.locator('#send-coin').innerText(),/Choose an asset/);
  assert.equal(await page.locator('details.wallet-coin-switch, .picker-chevron').count(),0);
  assert.equal(await page.locator('[data-send-coin=pep]').isVisible(),true);
  assert.equal(await page.locator('[data-send-coin=wht]').isVisible(),true);
  assert.equal(await page.locator('#change-send-coin').isVisible(),false);
  // Shared layout across navigation-only asset lists, including light-theme hover.
  for(const theme of ['dark','light'])for(const width of [320,390,430]){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:844});
   const metrics=[];
   for(const [route,selector] of [['send','[data-send-coin=pep]'],['receive','[data-coin=pep]'],['activity','[data-activity-coin=pep] > summary']]){
    await page.locator(`[data-nav=${route}]`).click();const row=page.locator(selector);await row.waitFor();
    metrics.push(await row.evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),i=el.querySelector('img').getBoundingClientRect();return {x:r.x,y:r.y,height:r.height,iconX:i.x,iconWidth:i.width,font:s.fontSize,weight:s.fontWeight};}));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(route==='activity')assert.equal(await row.evaluate(el=>getComputedStyle(el.parentElement).borderBottomWidth),'0px');
    if(theme==='light'){await row.hover();assert.equal(await row.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');}
   }
   for(const m of metrics.slice(1))for(const key of ['x','y','height','iconX','iconWidth','font','weight'])assert.equal(m[key],metrics[0][key],`Shared asset row ${key}`);
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.setViewportSize({width:390,height:844});await page.locator('[data-nav=send]').click();
  for(const el of await page.locator('[data-send-coin]').all()){const box=await el.boundingBox();assert.ok(box.height>=44&&box.height<=48,'Compact asset rows retain usable touch height');}
  assert.deepEqual(await page.locator('[data-send-coin=pep]').evaluate(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.boxShadow,s.backgroundColor];}),['0px','none','rgba(0, 0, 0, 0)']);
  await page.screenshot({path:'/tmp/safecore-send-choices.png'});
  assert.equal(await page.locator('#send-form').count(),0);
  assert.match(await page.locator('[data-send-coin="wht"]').textContent(),/50 WHT/);
  await page.evaluate(()=>localStorage.setItem('corevault.hidden-coins.v1',JSON.stringify(['wht','doge'])));
  assert.equal(await page.locator('[data-send-coin="wht"]').count(),1);
  assert.equal(await page.locator('[data-send-coin="doge"]').count(),0);
  // Hold a press across a balance poll: the release must still choose this row.
  const target=await page.locator('[data-send-coin=pep]').boundingBox();
  await page.mouse.move(target.x+target.width/2,target.y+target.height/2);await page.mouse.down();
  await page.clock.runFor(4001);await page.mouse.up();
  await page.locator('#send-address').fill('old-recipient');await page.locator('#send-amount').fill('2');
  assert.equal(await page.locator('#send-coin-options').isVisible(),false);
  assert.match(await page.locator('#send-selected-coin').innerText(),/Pepecoin PEP/);
  assert.equal(await page.locator('label[for=send-address]').innerText(),'Pepecoin receiving address');
  await page.locator('#change-send-coin').click();
  assert.equal(await page.locator('#send-form').isVisible(),false,'Only show one coin context while changing');
  await page.evaluate(()=>{window.__originalCoinButton=document.querySelector('[data-send-coin=wht]');});
  await page.locator('[data-send-coin=wht]').focus();await page.clock.runFor(8001);
  assert.equal(await page.evaluate(()=>__originalCoinButton===document.querySelector('[data-send-coin=wht]')),true,'Refresh must not replace buttons under a tap');
  assert.equal(await page.locator('[data-send-coin=wht]').evaluate(el=>el===document.activeElement),true,'Refresh preserves keyboard focus');
  await page.locator('#change-send-coin').click();
  assert.equal(await page.locator('#send-address').inputValue(),'old-recipient','Closing choices retains draft');
  // A stale response from the previous asset must not overwrite the new form.
  await page.evaluate(()=>{const original=WalletNetwork.spendable;WalletNetwork.spendable=s=>s.coin==='wht'?new Promise(resolve=>{window.__releaseSpend=()=>resolve([]);}):original(s);});
  await choose('wht');assert.equal(await page.locator('#send-address').inputValue(),'');assert.equal(await page.locator('#send-amount').inputValue(),'');
  assert.match(await page.locator('#send-selected-coin').innerText(),/Whippet WHT/);
  assert.equal(await page.locator('[data-send-coin=wht]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-send-coin=pep]').getAttribute('aria-pressed'),'false');
  await page.locator('#change-send-coin').click();
  assert.equal(await page.locator('[data-send-coin=wht] .send-choice-state').innerText(),'✓ Selected');
  await page.locator('[data-send-coin=pep]').hover();
  assert.notEqual(await page.locator('[data-send-coin=pep]').evaluate(el=>getComputedStyle(el).color),await page.locator('[data-send-coin=wht]').evaluate(el=>getComputedStyle(el).color),'Hover must not impersonate selection');
  await page.locator('#change-send-coin').click();
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
  await page.evaluate(()=>{for(const coin of Object.keys(__balances))__balances[coin]=coin==='wht'?6339444087:50;});await page.clock.runFor(8001);
  await page.waitForFunction(()=>document.querySelectorAll('[data-send-coin]').length===6);
  for(const theme of ['dark','light']){
   await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
   for(const coin of ['pep','doge','ltc','shic','wht','btc']){
    await choose(coin);
    assert.equal(await page.locator('#send-selected-coin').getAttribute('data-coin'),coin);
    assert.deepEqual(await page.locator('[data-send-coin][aria-pressed=true]').evaluateAll(rows=>rows.map(r=>r.dataset.sendCoin)),[coin]);
    assert.match(await page.locator('label[for=send-amount]').innerText(),new RegExp(E.NETWORKS[coin].ticker));
    for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
   }
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.setViewportSize({width:390,height:844});await choose('doge');
  await page.screenshot({path:'/tmp/safecore-send-form-clean.png',fullPage:true});
  await page.locator('#change-send-coin').click();await page.screenshot({path:'/tmp/safecore-send-change-clean.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: stable taps/focus across polls; explicit selected asset/Change; all six coins/dark/light/narrow touch layout; cleared cross-coin drafts; late callback protection; preserved same-coin draft; zero/stub exclusion.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
