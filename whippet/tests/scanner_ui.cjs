// Generated public-fixture QR frames; no real camera, mainnet broadcast or seed screenshots.
const assert=require('node:assert/strict'),{chromium}=require('./browser-helper.cjs'),{webcrypto}=require('node:crypto');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),accounts=E.accounts(ethers,recipe);
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});await require('./funded_network.cjs')(context);
  await context.addInitScript(v=>localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v)),E.unprotected(webcrypto,recipe));
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const choose=async coin=>{if(await p.locator('#change-send-coin').isVisible()&&await p.locator('#send-coin-options').isHidden())await p.locator('#change-send-coin').click();await p.locator(`[data-send-coin="${coin}"]`).click();};
  await p.goto('http://localhost:8787/#send');await choose('pep');await p.locator('#scan-address').waitFor();
  assert.deepEqual(await p.locator('.bottom-navigation [data-nav]').evaluateAll(links=>links.map(a=>a.dataset.nav)),['wallet','receive','send','activity','security']);
  assert.equal(await p.locator('[data-nav="send"]').getAttribute('aria-current'),'page');
  // Manually entered bad addresses must never reach review, signing or broadcast.
  for(const coin of ['pep','wht']){
   await p.locator('[data-nav="receive"]').click();await p.locator('#receive-coin').click();await p.locator(`[data-coin="${coin}"]`).click();await p.locator('[data-nav="send"]').click();
   await choose(coin);
   for(const address of [accounts[coin==='pep'?'wht':'pep'].address,'bad-address',accounts[coin].address.slice(0,-1)+'0']){
    await p.locator('#send-address').fill(address);await p.locator('#send-amount').fill('1');await p.locator('#review-send').click();
    await p.locator('#error').waitFor({state:'visible'});assert.equal(await p.locator('#broadcast-send').count(),0);assert.equal(await p.locator('.send-review').count(),0);
   }
  }
  await p.locator('[data-nav="receive"]').click();await p.locator('#receive-coin').click();await p.locator('[data-coin="pep"]').click();await p.locator('[data-nav="send"]').click();
  await choose('pep');
  await p.evaluate(()=>{
   window.__scene=document.createElement('canvas');__scene.width=__scene.height=480;
   window.__tracks=[];window.__cameraCalls=0;window.__cameraMode='normal';
   window.__draw=text=>{
    const ctx=__scene.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,__scene.width,__scene.height);
    if(text){const size=Math.round(Math.min(__scene.width,__scene.height)*2/3),host=document.createElement('div');new QRCode(host,{text,width:size,height:size,correctLevel:QRCode.CorrectLevel.M});ctx.drawImage(host.querySelector('canvas'),(__scene.width-size)/2,(__scene.height-size)/2);}
   };__draw('');
   navigator.mediaDevices.getUserMedia=async constraints=>{
    __cameraCalls++;if(constraints.audio!==false||constraints.video.facingMode.ideal!=='environment')throw Error('Unsafe camera request');
    if(__cameraMode==='denied')throw new DOMException('Fixture denial','NotAllowedError');
    const stream=__scene.captureStream(10);__tracks.push(...stream.getTracks());
    const pulse=setInterval(()=>{const ctx=__scene.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1,1);},100);
    const track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(pulse);stop();};
    if(__cameraMode==='late')await new Promise(resolve=>window.__resolveCamera=resolve);
    return stream;
   };
  });
  assert.equal(await p.evaluate(()=>__cameraCalls),0);
  await p.locator('#send-amount').fill('1');
  await p.evaluate(text=>__draw(text),`pepecoin:${accounts.pep.address}?amount=99`);
  await p.locator('#scan-address').click();await p.waitForFunction(()=>document.getElementById('scan-status').textContent.includes('Address scanned'),null,{timeout:10000}).catch(async e=>{
   console.error(await p.evaluate(()=>({status:document.getElementById('scan-status').textContent,ready:document.getElementById('scan-video').readyState,width:document.getElementById('scan-video').videoWidth,error:document.getElementById('scan-video').error?.message,calls:__cameraCalls,tracks:__tracks.map(t=>t.readyState),fixtureDecodes:!!jsQR(__scene.getContext('2d').getImageData(0,0,480,480).data,480,480)})));throw e;
  });
  assert.equal(await p.locator('#send-address').inputValue(),accounts.pep.address);
  assert.equal(await p.locator('#send-amount').inputValue(),'1');assert.equal(await p.locator('#broadcast-send').count(),0);
  assert.equal(await p.evaluate(()=>__tracks.every(t=>t.readyState==='ended')),true);
  // A pending play() promise must not prevent decoding available camera frames.
  await p.evaluate(()=>{
   window.__originalPlay=HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play=function(){const promise=__originalPlay.call(this);promise.catch(()=>{});return new Promise(()=>{});};
  });
  await p.locator('#scan-address').click();await p.waitForFunction(()=>document.getElementById('scan-status').textContent.includes('Address scanned'));
  assert.equal(await p.locator('#send-address').inputValue(),accounts.pep.address);
  await p.evaluate(()=>{HTMLMediaElement.prototype.play=__originalPlay;});
  for(const [width,height] of [[1080,1920],[1920,1080]]){
   await p.evaluate(({width,height,address})=>{__scene.width=width;__scene.height=height;__draw(address);},{width,height,address:accounts.pep.address});
   await p.locator('#scan-address').click();await p.waitForFunction(()=>document.getElementById('scan-status').textContent.includes('Address scanned'));
   assert.equal(await p.locator('#send-address').inputValue(),accounts.pep.address);
  }
  await p.evaluate(text=>__draw(text),accounts.wht.address);await p.locator('#scan-address').click();
  await p.waitForFunction(()=>document.getElementById('scan-status').textContent.includes('Not a valid address'));
  assert.equal(await p.locator('#send-address').inputValue(),accounts.pep.address);
  await p.locator('#cancel-scan').click();assert.equal(await p.evaluate(()=>__tracks.every(t=>t.readyState==='ended')),true);
  await p.evaluate(()=>__cameraMode='denied');await p.locator('#scan-address').click();
  await p.waitForFunction(()=>document.getElementById('scan-status').textContent.includes('Camera access denied'));
  assert.equal(await p.locator('#scan-address').isDisabled(),false);assert.equal(await p.locator('#send-address').isEnabled(),true);
  // Cancellation while permission/opening is unresolved must stop the late stream.
  await p.evaluate(()=>__cameraMode='late');await p.locator('#scan-address').click();await p.locator('#cancel-scan').click();
  await p.evaluate(()=>__resolveCamera());await p.waitForFunction(()=>__tracks.every(t=>t.readyState==='ended'));
  await p.evaluate(()=>{__cameraMode='normal';__draw('');});await p.locator('#scan-address').click();
  await p.waitForFunction(()=>document.getElementById('scan-video').srcObject?.active);
  await p.waitForFunction(()=>Number(document.getElementById('scan-video').dataset.scanFrames)>0);
  assert.match(await p.locator('#scan-hint').innerText(),/Scanning PEP/);
  assert.equal(await p.locator('#scan-video').evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.width-r.height)<2&&getComputedStyle(el).objectFit==='cover';}),true);
  for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await p.screenshot({path:'whippet/test-results/send-camera.png',fullPage:true});
  await choose('wht');await p.waitForFunction(()=>__tracks.every(t=>t.readyState==='ended'));
  assert.equal(await p.locator('#send-address').inputValue(),'');
  assert.equal(await p.locator('#send-amount').inputValue(),'');
  await p.locator('[data-nav="receive"]').click();await p.waitForFunction(()=>__tracks.every(t=>t.readyState==='ended'));
  await p.locator('#receive-coin').click();await p.locator('[data-coin="wht"]').click();await p.locator('[data-nav="send"]').click();
  await choose('wht');
  await p.evaluate(text=>__draw(text),`whippet:${accounts.wht.address}`);await p.locator('#scan-address').click();
  await p.waitForFunction(()=>document.getElementById('scan-status').textContent.includes('Address scanned'));
  assert.equal(await p.locator('#send-address').inputValue(),accounts.wht.address);
  // Reopening with a filled recipient must keep scanning blank frames. It may
  // close only when another valid QR is decoded (even if it is the same address).
  await p.evaluate(()=>__draw(''));await p.locator('#scan-address').click();
  await p.waitForFunction(()=>Number(document.getElementById('scan-video').dataset.scanFrames)>=5);
  assert.equal(await p.locator('#scan-panel').isVisible(),true);
  assert.equal(await p.locator('#send-address').inputValue(),accounts.wht.address);
  await p.evaluate(text=>__draw(text),accounts.wht.address);
  await p.waitForFunction(()=>document.getElementById('scan-status').textContent.includes('Same address confirmed'));
  assert.equal(await p.locator('#toast').innerText(),'Same address confirmed.');
  assert.equal(await p.evaluate(()=>__tracks.every(t=>t.readyState==='ended')),true);
  await p.evaluate(()=>__draw(''));await p.locator('#scan-address').click();await p.waitForFunction(()=>document.getElementById('scan-video').srcObject?.active);
  await p.evaluate(()=>window.dispatchEvent(new Event('safecore-pause')));await p.waitForFunction(()=>__tracks.every(t=>t.readyState==='ended'));
  await p.goto('http://localhost:8787/#send');
  // No persistent camera authorization/action is stored in the wallet settings.
  assert.equal(await p.locator('#scan-panel').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: actual QR frame decode into address only, wrong coin rejection, permission denial, cancel/late-stream/navigation cleanup, no automatic send, phone layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
