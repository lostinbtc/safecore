// Public BIP39 vectors in a disposable profile. No screenshots of seed entry.
const assert=require('node:assert/strict'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js'),{webcrypto}=require('node:crypto');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const c=await b.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(c);
  const p=await c.newPage(),errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
  await p.goto('http://localhost:8787/#setup');await p.locator('[data-setup="import"]').click();
  assert.equal(await p.locator('#submit-setup').isDisabled(),true);
  assert.equal(await p.locator('#ack').count(),0);
  const input=p.locator('#phrase');
  // Android IMEs can keep composition active for an entire word. Do not wait
  // for compositionend, a space, a timer or a balance refresh to suggest it.
  await input.focus();
  const immediate=await input.evaluate(el=>{
   el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
   el.value='abandon wo';el.setSelectionRange(el.value.length,el.value.length);
   el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'wo',isComposing:true}));
   return [...document.querySelectorAll('.recovery-choice')].map(b=>b.textContent);
  });
  assert.ok(immediate.includes('wood'));assert.ok(immediate.includes('wool'));
  // Shrinking the viewport models a keyboard; caret and popup must stay visible.
  await p.setViewportSize({width:390,height:420});
  await p.waitForFunction(()=>{const p=document.getElementById('phrase'),r=document.getElementById('phrase-suggestions').getBoundingClientRect(),c=WalletViewport.caret(p),b=WalletViewport.bounds();return c.top>=b.top-1&&r.top>=b.top-1&&r.bottom<=b.bottom+1&&r.left>=b.left-1&&r.right<=b.right+1;});
  await p.getByRole('button',{name:'Use recovery word wool',exact:true}).click();assert.equal(await input.inputValue(),'abandon wool ');
  await input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
  await p.setViewportSize({width:390,height:844});
  await p.locator('#password-lock').check();
  await p.locator('#confirm').focus();await p.setViewportSize({width:390,height:420});
  await p.waitForFunction(()=>{const r=document.getElementById('confirm').getBoundingClientRect(),b=WalletViewport.bounds();return r.top>=b.top-1&&r.bottom<=b.bottom+1;});
  await p.setViewportSize({width:390,height:844});await p.locator('#password-lock').uncheck();
  await input.fill('aban');assert.equal(await input.inputValue(),'aban');
  await p.getByRole('button',{name:'Use recovery word abandon',exact:true}).click();assert.equal(await input.inputValue(),'abandon ');
  await input.fill('abandon abou legal');await input.evaluate(el=>{el.focus();el.setSelectionRange(11,11);el.dispatchEvent(new Event('click'));});
  await p.getByRole('button',{name:'Use recovery word about',exact:true}).click();assert.equal(await input.inputValue(),'abandon about legal');
  await input.fill(phrase.replace('about','abotu'));assert.equal(await p.locator('#submit-setup').isDisabled(),true);assert.match(await p.locator('#phrase-status').innerText(),/word 12/);
  await input.fill(phrase.replace('about','ability'));assert.equal(await p.locator('#submit-setup').isDisabled(),true);assert.match(await p.locator('#phrase-status').innerText(),/do not pass/);
  // Bypassing the disabled button still cannot persist an invalid wallet.
  await p.evaluate(()=>document.getElementById('setup-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));
  assert.equal(await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')),null);
  assert.equal(await p.locator('#submit-setup').isDisabled(),true);
  // Force the browser's delayed select event AFTER ArrowDown moved focus.
  // It must not remove the suggestion button that is now receiving Enter.
  await input.fill('ab');
  const deferredSelection=await input.evaluate(el=>{
   el.focus();el.setSelectionRange(2,2);el.dispatchEvent(new Event('input',{bubbles:true}));
   const first=document.querySelector('.recovery-choice');
   el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
   const entered=document.activeElement===first;
   el.dispatchEvent(new Event('select'));
   return {entered,retained:document.activeElement===first&&first.isConnected,visible:!document.getElementById('phrase-suggestions').hidden};
  });
  assert.deepEqual(deferredSelection,{entered:true,retained:true,visible:true});
  await p.keyboard.press('Enter');assert.equal(await input.inputValue(),'abandon ');
  // Keep the real-keyboard check too, across repeated natural event orderings.
  for(let i=0;i<20;i++){
   await input.fill('ab');await input.press('ArrowDown');assert.equal(await p.evaluate(()=>document.activeElement.classList.contains('recovery-choice')),true);
   await p.keyboard.press('Enter');assert.equal(await input.inputValue(),'abandon ');
  }
  await input.fill('ab');await p.locator('#wallet-name').focus();
  await p.locator('#phrase-suggestions').waitFor({state:'hidden'});
  await input.evaluate(el=>el.dispatchEvent(new Event('select')));
  assert.equal(await p.locator('.recovery-choice').count(),0);
  await input.fill('aban');await input.press('Escape');assert.equal(await p.locator('#phrase-suggestions').isVisible(),false);
  await input.evaluate(el=>el.dispatchEvent(new Event('select')));
  assert.equal(await p.locator('#phrase-suggestions').isVisible(),false);
  // Importing an unprotected backup with bad words must not stage it as valid.
  const vault=E.unprotected(webcrypto,E.recipe(ethers,phrase));vault.recipe.mnemonic=phrase.replace('about','abotu');
  await p.locator('#backup-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(vault))});
  await p.locator('#error').waitFor({state:'visible'});assert.equal(await p.locator('#submit-setup').isDisabled(),true);
  await input.fill(phrase);assert.equal(await p.locator('#submit-setup').isDisabled(),false);
  assert.match(await p.locator('#phrase-status').innerText(),/check passed/);
  for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  assert.ok(requests.every(url=>url.startsWith('http://localhost:8787/')));
  await p.evaluate(()=>window.dispatchEvent(new HashChangeEvent('hashchange',{oldURL:location.origin+'/#send',newURL:location.origin+'/#wallet'})));
  assert.equal(await input.inputValue(),phrase);assert.equal(await p.locator('#submit-setup').isDisabled(),false);
  await p.locator('#submit-setup').click();await p.locator('.holdings').waitFor();
  const expected=E.accounts(ethers,E.recipe(ethers,phrase)).pep.address;
  await p.locator('[data-nav="receive"]').click();await p.locator('#receive-coin').click();await p.locator('[data-coin="pep"]').click();await p.locator('#address').waitFor();assert.equal(await p.locator('#address').textContent(),expected);
  await p.locator('.wallets-shortcut').click();await p.locator('#add-wallet').click();await p.locator('[data-setup="import"]').click();await p.locator('#phrase').fill('aban');
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await p.locator('.recovery-choice').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: deferred select events preserve suggestion focus; 20 ArrowDown/Enter selections; local-only suggestions, middle-word editing, invalid/checksum rejection, valid restore, field/background cleanup and phone layout.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
