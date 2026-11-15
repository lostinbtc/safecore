// Fake clocks, generated public fixture and fake balances; no live coins.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const c=await b.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const vault=E.unprotected(webcrypto,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
  await c.addInitScript(v=>{
   window.__balances={pep:1000,wht:1000,shic:0,ltc:0,doge:0,btc:0,bel:0,dingo:0};window.__calls={};window.__quotes={pep:'.01',usdt:'.5'};
   window.fetch=async(url,options)=>{if(!String(url).endsWith('?pair=PEPUSD,USDTUSD')||options.credentials!=='omit'||options.referrerPolicy!=='no-referrer')throw Error('Unexpected price request');return new Response(JSON.stringify({error:[],result:{PEPUSD:{c:[__quotes.pep]},USDTZUSD:{c:[__quotes.usdt]}}}));};
   window.WebSocket=class{constructor(){throw Error('Real connection prohibited');}};
   Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){Object.defineProperty(window,'WalletNetwork',{value:N,configurable:true});N.scan=async(coin,accounts)=>{
    __calls[coin]=(__calls[coin]||0)+1;const amount=window.__baseBalances?.[coin]??BigInt(__balances[coin]??0)*100000000n;
    return {coin,tip:500,at:Date.now(),confirmed:amount,unconfirmed:0n,everUsed:amount?[0]:[],feeRate:1000000n,rows:accounts.map((account,i)=>({account,confirmed:i?0n:amount,unconfirmed:0n,history:[],utxos:[]}))};
   };}});
  },vault);
  await p.clock.install();await p.clock.pauseAt(new Date(Date.now()+100));
  await p.goto('http://localhost:8787/#setup');
  await p.locator('[data-setup="import"]').click();await p.locator('[data-restore-word="0"]').fill(vault.recipe.mnemonic);await p.locator('#restore-done').click();
  const restoredAt=await p.evaluate(()=>Date.now());
  await p.locator('#submit-setup').click();await p.waitForFunction(()=>__calls.pep&&__calls.wht);
  await require('./coin-selection-helper.cjs')(p,['pep','wht']);
  await p.waitForFunction(()=>document.querySelector('[data-overview-coin=pep] .holding-balance')?.textContent==='1,000 PEP');
  assert.ok(await p.evaluate(t=>Date.now()-t<4000,restoredAt),'restore must not wait for the reporting delay');
  assert.equal(await p.evaluate(()=>__calls.pep),1);assert.equal(await p.evaluate(()=>__calls.wht),1);
  assert.equal(await p.locator('#wallet-worth').innerText(),'≈ 20.00 USDT*');
  assert.equal(await p.locator('.wallet-worth').evaluate(el=>getComputedStyle(el).textAlign),'center');
  const worthBox=await p.locator('.wallet-worth').boundingBox(),barBox=await p.locator('.topbar').boundingBox(),mainBox=await p.locator('#main').boundingBox();
  assert.ok(Math.abs(worthBox.x+worthBox.width/2-mainBox.x-mainBox.width/2)<1,'Wallet value centered in the app');
  assert.ok(worthBox.y-barBox.y-barBox.height<=16,'Compact spacing below header');
  assert.equal(await p.locator('[data-overview-coin=pep] .holding-values > small').innerText(),'20.00 USDT');
  assert.equal(await p.locator('[data-overview-coin=pep] .holding-name > small').first().innerText(),'0.02 USDT');
  assert.equal(await p.locator('#home-coin, .home-balance, .home-actions').count(),0);
  assert.equal(await p.locator('[data-overview-coin=wht] .holding-balance').innerText(),'1,000 WHT');
  await p.evaluate(()=>{__balances.wht=0;});await p.clock.runFor(3999);
  assert.equal(await p.evaluate(()=>__calls.wht),1,'no periodic query before 4 seconds');
  await p.clock.runFor(1);
  await p.waitForFunction(()=>__calls.wht===2);
  assert.equal(await p.locator('[data-overview-coin=wht] .holding-balance').innerText(),'1,000 WHT');
  await p.clock.runFor(3999);
  assert.equal(await p.locator('[data-overview-coin=wht] .holding-balance').innerText(),'1,000 WHT');
  assert.equal(await p.evaluate(()=>__calls.wht),2);
  await p.clock.runFor(1);
  await p.waitForFunction(()=>document.querySelector('[data-overview-coin=wht] .holding-balance').textContent==='0 WHT');
  assert.equal(await p.evaluate(()=>__calls.wht),3,'publication requires a fresh query at the 4-second boundary');
  assert.equal(await p.locator('#wallet-worth').innerText(),'≈ 20.00 USDT');
  await p.evaluate(()=>{window.__baseBalances={pep:470900000000n,wht:193992200111100n};});
  // Allow each asynchronous polling batch to finish before the next matching
  // observation; the exact four-second publication boundary is asserted above.
  for(let i=0;i<3;i++)await p.clock.runFor(4001);
  await p.waitForFunction(()=>document.querySelector('[data-overview-coin=wht] .holding-balance').textContent==='1,939,922.001111 WHT');
  assert.equal(await p.locator('[data-overview-coin=pep] .holding-balance').innerText(),'4,709 PEP');
  for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await p.screenshot({path:'whippet/test-results/wallet-usdt-total.png',fullPage:true});
  assert.equal(await p.locator('.overview-rescan').evaluate(el=>getComputedStyle(el).borderRadius),'0px');
  for(const theme of ['dark','light'])for(const width of [320,390,430]){
   await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await p.setViewportSize({width,height:844});
   const rescan=await p.locator('#rescan').boundingBox(),nav=await p.locator('.bottom-navigation').boundingBox();
   assert.ok(Math.abs(rescan.x+rescan.width/2-width/2)<1,'Rescan centered on the overview');
   assert.ok(rescan.height>=44&&rescan.y+rescan.height<=nav.y,'Rescan stays clear of navigation');
   assert.deepEqual(await p.locator('#rescan').evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.borderBottomWidth,s.animationName,s.fontSize,s.textDecorationLine];}),['rgba(0, 0, 0, 0)','0px','control-glow','14px','none']);
   assert.deepEqual(await p.locator('#rescan').evaluate(el=>{const s=getComputedStyle(el,'::after');return [s.animationName,s.pointerEvents,s.filter];}),['control-haze','none','blur(5px)']);
   assert.ok(await p.locator('.holding-row').evaluateAll(rows=>rows.every(el=>getComputedStyle(el).borderBottomWidth==='0px')),'No asset separators');
   if(theme==='light'){
    const row=p.locator('.holding-row').first();await row.hover();
    assert.ok(await p.locator('.holding-row').evaluateAll(rows=>rows.every(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)')),'Light-mode assets stay transparent, including hover');
   }
   assert.ok(await p.locator('.holding-row').evaluateAll(rows=>rows.every(el=>getComputedStyle(el).paddingTop==='10px'&&el.getBoundingClientRect().height>=44)),'Compact rows preserve touch targets');
   assert.equal(await p.locator('#rescan').evaluate(el=>getComputedStyle(el).animationDuration),'3.4s');
   assert.equal(await p.locator('.holdings').evaluate(el=>getComputedStyle(el).borderTopWidth),'1px','Keep wallet total divider');
  }
  await p.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await p.locator('#rescan').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await p.locator('#rescan').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
  await p.emulateMedia({reducedMotion:'no-preference'});
  await p.waitForFunction(()=>document.getElementById('rescan').getAnimations().some(a=>a.animationName==='control-glow'&&a.startTime===0));
  await p.evaluate(()=>{window.__oldRescan=document.getElementById('rescan');});
  await p.clock.runFor(4001);
  assert.equal(await p.evaluate(()=>document.getElementById('rescan')===window.__oldRescan),true,'Unchanged polling must preserve the control and its phase');
  const refreshedGlow=await p.evaluate(()=>{const el=document.getElementById('rescan');return {disabled:el.disabled,classes:el.className,css:getComputedStyle(el).animationName,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,animations:el.getAnimations({subtree:true}).map(a=>({name:a.animationName,start:a.startTime}))};});
  assert.equal(refreshedGlow.animations.find(a=>a.name==='control-glow')?.start,0,'Polling retains shared phase: '+JSON.stringify(refreshedGlow));
  assert.equal(refreshedGlow.animations.find(a=>a.name==='control-haze')?.start,0,'Haze shares the same persistent phase');
  const glow=await p.evaluate(()=>{
   const el=document.getElementById('rescan');
   const a=el.getAnimations().find(a=>a.animationName==='control-glow');a.pause();
   const result=[0,850,1700,2550,3400].map(t=>{a.currentTime=t;return {shadow:getComputedStyle(el).textShadow,opacity:getComputedStyle(el).opacity};});
   a.play();a.startTime=0;return result;
  });
  assert.equal(glow[0].shadow,glow[4].shadow,'Loop boundary has no jump');
  assert.equal(glow[1].shadow,glow[3].shadow,'Fade-up and fade-down mirror one another');
  assert.notEqual(glow[1].shadow,glow[2].shadow,'Glow fades rather than holding then dropping');
  assert.ok(glow.every(frame=>frame.opacity==='1'),'Text stays legible while its glow phases');
  await p.evaluate(()=>{const b=document.createElement('button');b.id='glow-fixture';b.className='glow-control';b.textContent='Fixture';document.body.append(b);});
  await p.waitForFunction(()=>document.getElementById('glow-fixture').getAnimations().some(a=>a.startTime===0));
  await p.locator('#glow-fixture').evaluate(el=>el.disabled=true);
  assert.equal(await p.locator('#glow-fixture').evaluate(el=>getComputedStyle(el).animationName),'none','Disabled controls do not glow');
  await p.locator('#glow-fixture').evaluate(el=>el.remove());
  assert.doesNotMatch(await p.locator('#main').innerText(),/4 second|settling|reporting delay|—/i);
  await p.locator('[data-nav=send]').click();await p.locator('#send-coin').click();
  assert.match(await p.locator('[data-send-coin=pep]').innerText(),/4,709 PEP/);
  assert.match(await p.locator('[data-send-coin=wht]').innerText(),/1,939,922\.001111 WHT/);
  await p.locator('[data-send-coin=wht]').click();
  assert.match(await p.locator('[data-send-coin=wht][aria-pressed=true]').innerText(),/1,939,922\.001111 WHT/);
  await p.locator('[data-nav=wallet]').click();
  await p.evaluate(()=>{__quotes={pep:'.0000796',usdt:'.9995'};__baseBalances={pep:470928561204n,wht:115562605382265915n};});
  await p.clock.runFor(65000);
  await p.waitForFunction(()=>document.getElementById('wallet-worth').textContent.includes('0.38'));
  assert.equal(await p.locator('[data-overview-coin=pep] .holding-values > small').innerText(),'0.38 USDT');
  assert.equal(await p.locator('[data-overview-coin=pep] .holding-name > small').first().innerText(),'0.00007963982 USDT');
  assert.equal(await p.locator('[data-overview-coin=wht] .holding-values > small').innerText(),'*');
  assert.doesNotMatch(await p.locator('.holdings').innerText(),/\$/);
  for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await p.evaluate(()=>{__quotes.usdt=null;});await p.clock.runFor(65000);
  assert.equal(await p.locator('#wallet-worth').innerText(),'* USDT');
  assert.equal(await p.locator('[data-overview-coin=pep] .holding-values > small').innerText(),'*','No USD fallback mislabeled as USDT');
  assert.deepEqual(errors,[]);console.log('PASS: exact grouped PEP/WHT balances and send picker; narrow layouts; immediate restore balances; 4-second fresh-match publication; cumulative USDT, zero-balance exclusion and unpriced holdings.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
