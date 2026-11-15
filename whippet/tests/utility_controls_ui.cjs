// Disposable public seed, synthetic balances, no live requests or broadcasts.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const b=await chromium.launch();try{
 const c=await b.newContext({viewport:{width:390,height:844}});await require('./funded_network.cjs')(c);
 const vault=E.unprotected(webcrypto,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
 await c.addInitScript(v=>localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v)),vault);
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const plain=async id=>{
  const el=p.locator('#'+id);await el.waitFor();
  for(const theme of ['light','dark']){
   await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await el.hover();
   assert.deepEqual(await el.evaluate(e=>{const s=getComputedStyle(e);return [e.classList.contains('glow-control'),s.backgroundColor,s.borderTopWidth,s.fontSize,e.getBoundingClientRect().height>=44];}),[true,'rgba(0, 0, 0, 0)','0px','14px',true],id+' uses the shared glow style');
  }
 };
 await p.goto('http://localhost:8787/#security');await plain('wallet-information');
 await p.locator('#wallet-information').click();await plain('information-back');await p.locator('#information-back').click();
 await p.locator('.wallets-shortcut').click();await plain('add-wallet');await p.locator('#add-wallet').click();await plain('cancel-setup');
 for(const tab of await p.locator('[data-setup]').all())assert.deepEqual(await tab.evaluate(e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.borderTopWidth,e.getBoundingClientRect().height>=44];}),['rgba(0, 0, 0, 0)','0px',true]);
 assert.equal(await p.locator('#submit-setup').evaluate(e=>e.classList.contains('primary')),true,'Actual wallet creation retains its explicit primary action');
 await p.locator('#cancel-setup').click();await p.locator('[data-nav=receive]').click();await p.locator('[data-coin=pep]').click();await plain('sweep-open');
 await p.locator('#sweep-open').click();await plain('review-sweep');
 await p.locator('[data-nav=security]').click();await p.locator('#komodo-recovery-enabled').check();
 await p.locator('[data-nav=receive]').click();await p.locator('[data-coin=pep]').click();await plain('komodo-open');
 await p.locator('#komodo-open').click();await plain('review-komodo-sweep');
 assert.deepEqual(errors,[]);
 console.log('PASS: shared unboxed glow controls for Create/Restore, Information, private-key/Komodo sweep and review; compact setup tabs; creation approval stays distinct.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
