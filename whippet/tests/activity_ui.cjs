// Synthetic history and an isolated browser. No wallet storage from real users.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const explorers={bch:'https://blockchair.com/bitcoin-cash/transaction/',dash:'https://blockchair.com/dash/transaction/',dgb:'https://digiexplorer.info/tx/',rvn:'https://ravencoinexplorer.com/tx/',pep:'https://pepecoinservice.org/explorer/tx/',btc:'https://mempool.space/tx/',doge:'https://dogechain.com/tx/',ltc:'https://litecoinspace.org/tx/',shic:'https://explorer.shibacoinshic.org/tx/'};
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const c=await b.newContext({viewport:{width:390,height:844}});await require('./funded_network.cjs')(c);
  const vault=E.unprotected(webcrypto,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
  await c.addInitScript(v=>localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v)),vault);
  const visits=[];
  for(const base of Object.values(explorers))await c.route(new URL(base).origin+'/**',r=>{visits.push(r.request().url());return r.fulfill({status:200,body:'Isolated explorer fixture'});});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install();await p.goto('http://localhost:8787/#activity');
  assert.equal(await p.locator('.page-head').innerText(),'Activity');assert.equal(await p.locator('.activity-asset[open]').count(),0);
  const installHistory=()=>{
   const original=WalletNetwork.scan;WalletNetwork.scan=async(...args)=>{const s=await original(...args);s.rows[0].history=Array.from({length:window.__historyCount??40},(_,i)=>({tx_hash:(s.coin==='pep'?'a':'b').repeat(62)+i.toString(16).padStart(2,'0'),height:500-i+(window.__historyShift||0)}));if(s.coin==='btc')s.rows[0].history[1].tx_hash=s.rows[0].history[1].tx_hash.toUpperCase();if(window.__badTxid)s.rows[0].history[0].tx_hash=window.__badTxid;return s;};
   const v=JSON.parse(localStorage.getItem('whippet.dev.encrypted.v1'));
   const key='corevault.send-attempts.'+WalletLibrary.id(v);
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify([
    {coin:'pep',txid:'c'.repeat(64),outpoints:['d'.repeat(64)+':0'],at:Date.now(),status:'unknown'},
    {coin:'pep',txid:'a'.repeat(62)+'27',outpoints:['d'.repeat(64)+':1'],at:Date.now(),status:'submitted'},
    {coin:'wht',txid:'b'.repeat(62)+'27',outpoints:['d'.repeat(64)+':2'],at:Date.now(),status:'submitted'},
    {coin:'wht',txid:'b'.repeat(62)+'26',outpoints:['d'.repeat(64)+':3'],at:Date.now(),status:'unknown'},
    {coin:'wht',txid:'e'.repeat(64),outpoints:['d'.repeat(64)+':4'],at:Date.now(),status:'submitted'},
    {coin:'doge',txid:'f'.repeat(64),outpoints:['d'.repeat(64)+':5'],at:Date.now(),status:'unknown'}
   ]));
  };
  await p.evaluate(installHistory);
  await p.clock.runFor(4001);await p.waitForFunction(()=>[...document.querySelectorAll('.live-tx code')].some(el=>el.textContent==='a'.repeat(62)+'00'));
  assert.equal(await p.locator('.live-tx').count(),133);
  for(const txid of ['a'.repeat(62)+'27','b'.repeat(62)+'27','b'.repeat(62)+'26'])assert.equal(await p.getByText(txid,{exact:true}).count(),0,'Confirmed sends outside the first 10 must not appear as outstanding.');
  assert.equal(await p.getByText('Submission uncertain — do not resend until checked.',{exact:true}).count(),2);
  assert.equal(await p.getByText('Submitted — awaiting appearance in server history.',{exact:true}).count(),1);
  const pep=p.locator('[data-activity-coin=pep]'),wht=p.locator('[data-activity-coin=wht]');
  await pep.locator('summary').click();assert.equal(await pep.locator('.activity-list').isVisible(),true);assert.equal(await wht.locator('.activity-list').isVisible(),false);
  assert.equal(await wht.locator('a').count(),0);assert.equal(await pep.locator('a').count(),11);
  assert.equal(await pep.locator('.activity-list').evaluate(el=>el.scrollHeight>el.clientHeight),false);
  assert.equal(await pep.locator('.activity-list').evaluate(el=>getComputedStyle(el).overflowY),'visible');
  assert.equal(await pep.locator('.activity-list').getAttribute('tabindex'),null);
  assert.ok(await pep.evaluate(el=>el.querySelector('.activity-pager').getBoundingClientRect().top>=el.querySelector('.activity-list').getBoundingClientRect().bottom));
  await p.evaluate(()=>window.scrollTo(0,100));await p.clock.runFor(4001);
  assert.equal(await pep.getAttribute('open'),'');assert.equal(await p.evaluate(()=>window.scrollY),100);
  assert.equal(await wht.getAttribute('open'),null);
  // Changed history must update without replacing the expanded list or moving the page.
  const beforeHistory=await pep.locator('.activity-list').innerText();
  await pep.locator('.activity-list').evaluate(el=>{window.__activityList=el;window.__historyShift=-1;});
  await p.clock.runFor(4001);
  await p.waitForFunction(before=>document.querySelector('[data-activity-coin=pep] .activity-list').innerText!==before,beforeHistory);
  assert.equal(await pep.locator('.activity-list').evaluate(el=>el===window.__activityList&&el.scrollTop===0&&window.scrollY===100),true);
  const pageInput=pep.locator('.activity-pager input'),nextPage=pep.locator('[data-page-step="1"]'),previousPage=pep.locator('[data-page-step="-1"]'),goPage=pep.locator('.activity-pager button[type=submit]');
  for(const theme of ['light','dark']){
   await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   for(const width of [320,390,430]){
    await p.setViewportSize({width,height:844});
    const pager=await pep.locator('.activity-pager').boundingBox(),group=await pep.locator('.activity-page-jump').boundingBox(),prev=await previousPage.boundingBox(),next=await nextPage.boundingBox();
    assert.ok(Math.abs(group.x+group.width/2-pager.x-pager.width/2)<1,'Page jump stays centered');
    assert.ok(prev.x+prev.width<=group.x&&group.x+group.width<=next.x,'Paging controls do not overlap');
    assert.equal(prev.y,next.y,'Paging actions share a baseline');
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   await p.setViewportSize({width:390,height:844});
   assert.equal(await pageInput.evaluate(el=>getComputedStyle(el).color===getComputedStyle(document.body).color),true,'Page number stays readable in each theme');
   for(const control of await pep.locator('.activity-pager button, .activity-pager input').all()){
    const plain=()=>control.evaluate(el=>{const s=getComputedStyle(el);return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.borderTopWidth==='0px'&&s.borderRadius==='0px'&&s.boxShadow==='none'&&el.getBoundingClientRect().height>=44;});
    assert.equal(await plain(),true,'Paging controls are borderless with usable touch targets');await control.hover();assert.equal(await plain(),true,'Hover must not restore bubbles');
   }
  }
  assert.equal(await previousPage.isDisabled(),true);assert.equal(await pageInput.getAttribute('max'),'4');
  await nextPage.click();assert.equal(await pageInput.inputValue(),'2');
  assert.equal(await pep.locator('.activity-list .live-tx code').first().innerText(),'a'.repeat(62)+'0a');
  assert.equal(await pep.locator('.activity-list .live-tx').count(),10);assert.equal(await pep.locator('.activity-list').evaluate(el=>el.scrollTop),0);
  assert.equal(await pep.locator('.activity-outstanding .live-tx').count(),1,'Uncertain send remains outside paged history');
  await pageInput.fill('4');await goPage.click();assert.equal(await nextPage.isDisabled(),true);
  assert.equal(await pep.locator('.activity-list .live-tx code').last().innerText(),'a'.repeat(62)+'27');
  assert.equal(await pep.locator('.activity-outstanding').getByText('a'.repeat(62)+'27',{exact:true}).count(),0,'Old confirmed sends remain history, not new outstanding warnings');
  await pageInput.fill('3');await p.clock.runFor(4001);
  assert.equal(await pageInput.inputValue(),'3','Refresh must preserve a focused page-entry draft');
  assert.equal(await pep.locator('.activity-list .live-tx code').first().innerText(),'a'.repeat(62)+'1e');
  await goPage.click();assert.equal(await pep.locator('.activity-list .live-tx code').first().innerText(),'a'.repeat(62)+'14');
  assert.equal(await wht.locator('.activity-pager input').inputValue(),'1','Paging is independent per coin');
  await previousPage.click();assert.equal(await pageInput.inputValue(),'2');
  await pageInput.fill('0');await goPage.click();assert.equal(await pageInput.evaluate(el=>el.validity.valid),false);
  assert.equal(await pep.locator('.activity-list .live-tx code').first().innerText(),'a'.repeat(62)+'0a');
  await pageInput.fill('1');await goPage.click();assert.equal(await previousPage.isDisabled(),true);
  assert.deepEqual(visits,[],'No explorer traffic before a user clicks');
  for(const [coin,base] of Object.entries(explorers)){
   const section=p.locator(`[data-activity-coin=${coin}]`);
   if(await section.getAttribute('open')===null)await section.locator('summary').click();
   const links=section.locator('a');assert.equal(await links.count(),coin==='pep'||coin==='doge'?11:10);
   for(const link of await links.all()){
    const hash=await link.locator('code').innerText();
    assert.equal(await link.getAttribute('href'),base+hash.toLowerCase()+(coin==='pep'?'/':''));
    assert.equal(await link.getAttribute('rel'),'noopener noreferrer');assert.equal(await link.getAttribute('referrerpolicy'),'no-referrer');
    assert.equal(await link.getAttribute('aria-label'),`View ${E.NETWORKS[coin].name} transaction ${hash}`);
   }
   const link=links.first(),expected=await link.getAttribute('href');assert.equal(await link.getAttribute('target'),'_blank');
   const popup=c.waitForEvent('page');await link.click();const explorer=await popup;await explorer.waitForLoadState();
   assert.equal(explorer.url(),expected);await explorer.close();
  }
  assert.equal(visits.length,Object.keys(explorers).length);assert.equal(await wht.locator('a').count(),0);
  assert.equal(await p.evaluate(()=>location.hash),'#activity');
  for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await p.setViewportSize({width:320,height:844});await pep.screenshot({path:'whippet/test-results/activity-pagination.png'});
  await p.screenshot({path:'whippet/test-results/activity-assets.png',fullPage:true});
  await p.reload();await p.locator('.page-head').waitFor();await p.evaluate(installHistory);
  await p.clock.runFor(4001);await p.waitForFunction(()=>[...document.querySelectorAll('.live-tx code')].some(el=>el.textContent==='a'.repeat(62)+'00'));
  assert.equal(await p.locator('.live-tx').count(),133);
  for(const txid of ['a'.repeat(62)+'27','b'.repeat(62)+'27','b'.repeat(62)+'26'])assert.equal(await p.getByText(txid,{exact:true}).count(),0,'Reload must not revive confirmed sends as outstanding.');
  assert.equal(await p.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([key])=>key.startsWith('corevault.send-attempts.'))[1]).length),6,'Public send records must remain intact.');
  await pep.locator('summary').click();await pageInput.fill('4');await goPage.click();
  await p.evaluate(()=>window.__historyCount=12);await p.clock.runFor(4001);
  await p.waitForFunction(()=>document.querySelector('[data-activity-coin=pep] .activity-pager input')?.value==='2');
  assert.equal(await pep.locator('.activity-list .live-tx').count(),2,'Shrinking history clamps the selected page');
  await p.evaluate(()=>window.__historyCount=8);await p.clock.runFor(4001);
  await pep.locator('.activity-pager').waitFor({state:'detached'});assert.equal(await pep.locator('.activity-list .live-tx').count(),8);
  await p.evaluate(()=>window.__historyCount=40);await p.clock.runFor(4001);await pep.locator('.activity-pager').waitFor();
  await p.evaluate(()=>{window.SafeCorePlatform={};location.hash='wallet';});await p.locator('.holdings').waitFor();await p.locator('[data-nav=activity]').click();
  await p.locator('.activity-asset').first().waitFor();
  assert.ok(await p.locator('.live-tx a').evaluateAll(links=>links.length>0&&links.every(link=>link.target==='_self')),'Android routes tapped links to its external-browser guard');
  await p.evaluate(()=>{delete window.SafeCorePlatform;window.__badTxid='"><img src=x>';});await p.clock.runFor(4001);
  await p.waitForFunction(()=>[...document.querySelectorAll('.activity-list > p.subtle')].filter(el=>el.textContent.startsWith('Last updated')).length===13);
  assert.equal(await p.locator('.live-tx code').filter({hasText:'<img'}).count(),0,'Malformed server IDs are rejected before rendering');
  assert.equal(await p.locator('.live-tx img').count(),0);assert.equal(await p.locator('.live-tx a').filter({hasText:'<img'}).count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: 10 fully expanded rows, no inner scrolling, borderless controls in both themes/hover, Previous/Next/jump, refresh stability, page bounds, outstanding sends and explorer links.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
