// Reset only an isolated test profile; never the user's browser.
const assert=require('node:assert/strict'),{chromium}=require('./browser-helper.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const context=await browser.newContext();await require('./empty_network.cjs')(context);
  const page=await context.newPage();await page.goto('http://localhost:8787/');
  await page.evaluate(()=>{
    const recipe=WalletEngine.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    const lib=WalletLibrary.create(localStorage);lib.save(WalletEngine.unprotected(crypto,recipe),'Fixture A');lib.save(WalletEngine.unprotected(crypto,recipe),'Fixture B');
    for(const key of ['corevault.balance.fixture.pep','corevault.receive.fixture','corevault.send-attempts.fixture','corevault.live.fixture','corevault.komodo-recovery.fixture','corevault.theme','corevault.hidden-coins.v1'])localStorage.setItem(key,'fixture');
    localStorage.setItem('unrelated-setting','keep');
    localStorage.setItem('corevault.connections.v1',JSON.stringify({pep:'wss://fixture.example/'}));
    localStorage.setItem('corevault.hide-balances.v1','true');
  });
  await page.goto('http://localhost:8787/#reset-tests');
  await page.locator('#reset-tests-confirm').click();await page.locator('#error').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('corevault.wallets.v1')).wallets.length),2);
  await page.locator('#reset-backup').check();await page.locator('#reset-tests-confirm').click();
  await page.locator('#security-cta').waitFor();
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),['unrelated-setting']);
  assert.equal(await page.evaluate(()=>WalletNetwork.endpoint('pep')),await page.evaluate(()=>WalletNetwork.CONFIG.pep.url));
  assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-setting')),'keep');
  await page.reload();assert.equal(await page.locator('[data-overview-coin=pep] .holding-balance').innerText(),'* PEP');
  console.log('PASS: explicit local reset removes only wallet/test keys, requires backup confirmation, preserves unrelated origin storage, and stays cleared on reload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
