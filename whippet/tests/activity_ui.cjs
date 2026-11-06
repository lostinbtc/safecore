// Synthetic history and an isolated browser. No wallet storage from real users.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const c=await b.newContext({viewport:{width:390,height:844}});await require('./funded_network.cjs')(c);
  const vault=E.unprotected(webcrypto,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
  await c.addInitScript(v=>localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v)),vault);
  await c.route('https://pepecoinservice.org/**',r=>r.fulfill({status:200,body:'Isolated explorer fixture'}));
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install();await p.goto('http://localhost:8787/#activity');
  assert.equal(await p.locator('.page-head').innerText(),'Activity');assert.equal(await p.locator('.activity-asset[open]').count(),0);
  const installHistory=()=>{
   const original=WalletNetwork.scan;WalletNetwork.scan=async(...args)=>{const s=await original(...args);s.rows[0].history=Array.from({length:40},(_,i)=>({tx_hash:(s.coin==='pep'?'a':'b').repeat(62)+i.toString(16).padStart(2,'0'),height:500-i}));return s;};
   const v=JSON.parse(localStorage.getItem('whippet.dev.encrypted.v1'));
   const key='corevault.send-attempts.'+WalletLibrary.id(v);
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify([
    {coin:'pep',txid:'c'.repeat(64),outpoints:['d'.repeat(64)+':0'],at:Date.now(),status:'unknown'},
    {coin:'pep',txid:'a'.repeat(62)+'27',outpoints:['d'.repeat(64)+':1'],at:Date.now(),status:'submitted'},
    {coin:'wht',txid:'b'.repeat(62)+'27',outpoints:['d'.repeat(64)+':2'],at:Date.now(),status:'submitted'},
    {coin:'wht',txid:'b'.repeat(62)+'26',outpoints:['d'.repeat(64)+':3'],at:Date.now(),status:'unknown'},
    {coin:'wht',txid:'e'.repeat(64),outpoints:['d'.repeat(64)+':4'],at:Date.now(),status:'submitted'}
   ]));
  };
  await p.evaluate(installHistory);
  await p.clock.runFor(4001);await p.waitForFunction(()=>[...document.querySelectorAll('.live-tx code')].some(el=>el.textContent==='a'.repeat(62)+'00'));
  assert.equal(await p.locator('.live-tx').count(),62);
  for(const txid of ['a'.repeat(62)+'27','b'.repeat(62)+'27','b'.repeat(62)+'26'])assert.equal(await p.getByText(txid,{exact:true}).count(),0,'Confirmed sends outside the newest 30 must not appear as outstanding.');
  assert.equal(await p.getByText('Submission uncertain — do not resend until checked.',{exact:true}).count(),1);
  assert.equal(await p.getByText('Submitted — awaiting appearance in server history.',{exact:true}).count(),1);
  const pep=p.locator('[data-activity-coin=pep]'),wht=p.locator('[data-activity-coin=wht]');
  await pep.locator('summary').click();assert.equal(await pep.locator('.activity-list').isVisible(),true);assert.equal(await wht.locator('.activity-list').isVisible(),false);
  assert.equal(await wht.locator('a').count(),0);assert.equal(await pep.locator('a').count(),31);
  assert.equal(await pep.locator('.activity-list').evaluate(el=>el.scrollHeight>el.clientHeight),true);
  await pep.locator('.activity-list').evaluate(el=>{el.scrollTop=450;});await p.clock.runFor(4001);
  assert.equal(await pep.getAttribute('open'),'');assert.equal(await pep.locator('.activity-list').evaluate(el=>el.scrollTop),450);
  assert.equal(await wht.getAttribute('open'),null);
  const link=pep.locator('a').first();assert.equal(await link.getAttribute('rel'),'noopener noreferrer');assert.equal(await link.getAttribute('referrerpolicy'),'no-referrer');
  const popup=c.waitForEvent('page');await link.click();const explorer=await popup;await explorer.waitForLoadState();
  assert.match(explorer.url(),/^https:\/\/pepecoinservice\.org\/explorer\/tx\/[0-9a-f]{64}\/$/);await explorer.close();
  assert.equal(await p.evaluate(()=>location.hash),'#activity');
  for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await p.screenshot({path:'whippet/test-results/activity-assets.png',fullPage:true});
  await p.reload();await p.locator('.page-head').waitFor();await p.evaluate(installHistory);
  await p.clock.runFor(4001);await p.waitForFunction(()=>[...document.querySelectorAll('.live-tx code')].some(el=>el.textContent==='a'.repeat(62)+'00'));
  assert.equal(await p.locator('.live-tx').count(),62);
  for(const txid of ['a'.repeat(62)+'27','b'.repeat(62)+'27','b'.repeat(62)+'26'])assert.equal(await p.getByText(txid,{exact:true}).count(),0,'Reload must not revive confirmed sends as outstanding.');
  assert.equal(await p.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([key])=>key.startsWith('corevault.send-attempts.'))[1]).length),5,'Public send records must remain intact.');
  assert.deepEqual(errors,[]);console.log('PASS: Activity checks full server history before limiting display to 30; old confirmed sends stay resolved after reload; unseen submitted/uncertain warnings and send records retained; refresh preserves open/scroll; mobile layouts and PEP-only explorer links.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
