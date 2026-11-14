// Isolated profile; icon choices must never change saved wallet data.
const assert=require('node:assert/strict'),{chromium}=require('./browser-helper.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(context);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('corevault.icon.v1','3');localStorage.setItem('corevault.icon.v2','26');});
  await page.goto('http://localhost:8787/#icons');
  assert.equal(await page.locator('.mobile-brand img').getAttribute('src'),'assets/safecore.png');
  assert.equal(await page.locator('.mobile-brand').innerText(),'SafeCore');
  assert.equal(await page.title(),'SafeCore · Multi-coin wallet');
  assert.equal(await page.locator('[data-brand]').count(),31);
  assert.equal(await page.locator('[data-brand]').first().getAttribute('data-brand'),'31');
  await page.waitForFunction(()=>[...document.querySelectorAll('.brand-grid img')].every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('type'),'image/png');
  await page.locator('[data-brand="31"]').click();assert.equal(await page.locator('.mobile-brand img').getAttribute('src'),'assets/safecore.png');
  for(let i=1;i<=30;i++){
    await page.locator(`[data-brand="${i}"]`).click();
    assert.equal(await page.locator(`[data-brand="${i}"]`).getAttribute('aria-pressed'),'true');
    assert.ok((await page.locator('.mobile-brand img').getAttribute('src')).endsWith(`safecore-${String(i).padStart(2,'0')}.svg`));
  }
  await page.getByRole('link',{name:'Cancel',exact:true}).click();
  await page.locator('.brand-grid').first().waitFor({state:'detached'});
  assert.equal(await page.locator('.mobile-brand img').getAttribute('src'),'assets/safecore.png');
  await page.goto('http://localhost:8787/#icons');await page.locator('[data-brand="30"]').click();await page.locator('#save-brand').click();
  await page.locator('.holdings').waitFor();await page.reload();
  assert.equal(await page.locator('.mobile-brand img').getAttribute('src'),'assets/icons/safecore-30.svg');
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),'assets/icons/safecore-30.svg');
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('type'),'image/svg+xml');
  await page.evaluate(()=>{
    const recipe=WalletEngine.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    WalletLibrary.create(localStorage).save(WalletEngine.unprotected(crypto,recipe),'Public fixture');
  });
  await page.reload();assert.equal(await page.locator('#mode-pill').count(),0);
  const wallet=await page.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1'));
  await page.goto('http://localhost:8787/#icons');
  for(const width of [320,390,430,1440]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.setViewportSize({width:430,height:900});
  await page.screenshot({path:'whippet/test-results/icons-dark.png',fullPage:true});
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await page.screenshot({path:'whippet/test-results/icons-light.png',fullPage:true});
  await page.locator('#original-brand').click();await page.locator('#save-brand').click();await page.locator('.holdings').waitFor();
  assert.equal(await page.locator('.mobile-brand img').getAttribute('src'),'assets/corevault.svg');
  assert.ok(wallet===await page.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')));
  assert.deepEqual(errors,[]);console.log('PASS: new SC globe plus 30 SVG options, header previews, cancel/save/original, persistence, favicon, phone widths, hidden development label and unchanged wallet.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
