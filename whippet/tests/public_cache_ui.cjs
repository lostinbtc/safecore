// Disposable browser, public seed, unavailable network; never real keys or sends.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
(async()=>{const b=await chromium.launch();try{
 const vault=E.unprotected(webcrypto,recipe),accounts=E.accounts(ethers,recipe),c=await b.newContext(),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await c.addInitScript(v=>{
  if(!localStorage.getItem('whippet.dev.encrypted.v1'))localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));
  window.fetch=async()=>{throw Error('Fixture offline');};window.WebSocket=class{constructor(){throw Error('Fixture offline');}};
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});
 },vault);
 await p.goto('http://localhost:8787/#receive');
 for(const coin of ['pep','doge','ltc','shic','wht','btc']){
  await p.locator(`[data-coin=${coin}]`).click();assert.equal(await p.locator('#address').innerText(),accounts[coin].address);
  await p.locator('#copy-address').click();assert.equal(await p.evaluate(()=>__copied),accounts[coin].address);
  assert.match(await p.locator('#receive-history-status').innerText(),/History refresh pending/);
 }
 const key=E.PUBLIC_CACHE_PREFIX+vault.id;
 assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).body.pools.pep.length,key),200);
 await p.reload();await p.locator('[data-coin=pep]').click();assert.equal(await p.locator('#address').innerText(),accounts.pep.address);
 const attacker=E.accounts(ethers,E.recipe(ethers,'legal winner thank year wave sausage worth useful legal winner thank yellow')).pep.address;
 await p.evaluate(({key,attacker})=>{const cache=JSON.parse(localStorage.getItem(key));cache.body.pools.pep[0].address=attacker;localStorage.setItem(key,JSON.stringify(cache));},{key,attacker});
 await p.reload();await p.locator('[data-coin=pep]').click();assert.equal(await p.locator('#address').innerText(),accounts.pep.address,'Modified cache cannot replace the receiving address');
 await p.locator('#copy-address').click();assert.equal(await p.evaluate(()=>__copied),accounts.pep.address);
 const protectedVault=await E.encrypt(webcrypto,recipe,'Public-test-password-123');
 await p.evaluate(v=>localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v)),protectedVault);
 await p.reload();await p.locator('[data-coin=pep]').click();assert.equal(await p.locator('#address').count(),0,'Public cache does not bypass wallet unlock');
 await p.locator('#receive-setup').click();await p.locator('#unlock-password').fill('Public-test-password-123');await p.locator('#unlock-submit').click();
 await p.waitForFunction(()=>document.documentElement.dataset.walletState==='unlocked');
 await p.locator('[data-nav=receive]').click();await p.locator('[data-coin=pep]').click();assert.equal(await p.locator('#address').innerText(),accounts.pep.address);
 assert.deepEqual(errors,[]);
 console.log('PASS: all six Receive addresses/clipboard work offline immediately, authenticated reload, tamper rejection and locked-wallet gating; no network history claimed fresh.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
