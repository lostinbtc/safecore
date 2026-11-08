// Real browser UI/bridge protocol with an in-memory native-store fixture.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),L=require('../www/library.js'),ethers=require('../www/assets/ethers.umd.min.js');
const ORIGIN='https://appassets.androidplatform.net',URL=ORIGIN+'/assets/wallet/index.html';
(async()=>{
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
 const a=E.unprotected(webcrypto,recipe),b=await E.encrypt(webcrypto,recipe,'Public-test-password-123');
 const records={[L.ACTIVE]:JSON.stringify(a),[L.COLLECTION]:JSON.stringify({version:1,wallets:[{id:L.id(a),name:'Open fixture',vault:a},{id:L.id(b),name:'Protected fixture',vault:b}]})};
 const browser=await chromium.launch();
 try {
  const context=await browser.newContext();await require('./empty_network.cjs')(context);
  const root=path.resolve(__dirname,'../www');
  await context.route(ORIGIN+'/**',async route=>{
   const file=new global.URL(route.request().url()).pathname.replace('/assets/wallet/','');
   if(!path.resolve(root,file).startsWith(root+path.sep))return route.abort();
   const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'};
   return route.fulfill({contentType:types[path.extname(file)]||'text/plain',body:await fs.readFile(path.join(root,file))});
  });
  let state=null,serial=0,failWrite=false,failRead=false,exported=null,gate=null;
  let authAvailable=true,authEnabled=false,cancelAuth=false,firstWalletDefault=false,authChanges=0;
  await context.exposeBinding('__fixtureNative',async(_,{action,value})=>{
   if(action==='readWalletStore'){if(failRead)throw Error('Fixture key unavailable');return {state:structuredClone(state)};}
   if(action==='getDeviceAuthentication')return {available:authAvailable,enabled:authEnabled,firstWalletDefault};
   if(action==='setDeviceAuthentication'){
    if(cancelAuth)return {ok:false,code:'AUTH_CANCELLED',error:'Fixture authentication cancelled'};
    const request=JSON.parse(value);assert.equal(request.revision,state.revision);authEnabled=request.enabled;authChanges++;firstWalletDefault=false;
    state={...state,revision:String(++serial)};return {revision:state.revision};
   }
   if(action==='authenticateWalletAction'&&cancelAuth)return {ok:false,code:'AUTH_CANCELLED',error:'Fixture authentication cancelled'};
   if(action==='writeWalletStore'){
    if(gate)await gate;if(failWrite)throw Error('Fixture disk failure');
    const request=JSON.parse(value);assert.equal(request.revision,state?.revision??null);
    state={revision:String(++serial),records:request.records};return {revision:state.revision};
   }
   if(action==='exportBackup'){exported=value;return {};}
   return {enabled:true};
  });
  await context.addInitScript(records=>{
   if(!localStorage.getItem('fixture.seeded')){for(const [k,v]of Object.entries(records))localStorage.setItem(k,v);localStorage.setItem('fixture.seeded','1');}
   window.SafeCoreNative={postMessage(raw){const request=JSON.parse(raw);if(request.action==='writeWalletStore')window.__fixtureWriting=true;window.__fixtureNative(request).then(result=>SafeCoreNative.onmessage({data:JSON.stringify({id:request.id,ok:true,...result})}),()=>SafeCoreNative.onmessage({data:JSON.stringify({id:request.id,ok:false,error:'Fixture storage failure'})}));}};
  },records);
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  console.log('Device storage UI: migration');
  await page.goto(URL+'#wallets');await page.locator('.saved-wallet').first().waitFor();
  assert.equal(await page.locator('.saved-wallet').count(),2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')===null&&localStorage.getItem('corevault.wallets.v1')===null),true);
  console.log('Device storage UI: export');
  await page.locator('.saved-wallet > summary').first().click();await page.locator('[data-export-wallet]').first().click();
  await page.locator('#confirm-export').click();await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Backup'));
  assert.deepEqual(JSON.parse(exported),a,'Export remains portable, not device ciphertext');
  await page.goto(URL+'#security');await page.locator('#password-protection').waitFor();
  assert.match(await page.locator('#password-protection').textContent(),/Device-encrypted storage/);
  await page.waitForFunction(()=>!document.getElementById('device-authentication').disabled);
  assert.equal(await page.evaluate(()=>Boolean(document.getElementById('theme-choice').compareDocumentPosition(document.getElementById('device-authentication')) & Node.DOCUMENT_POSITION_FOLLOWING)),true,'Appearance precedes device authentication');
  const beforeAuth=structuredClone(state.records);
  await page.locator('#device-authentication').click();await page.waitForFunction(()=>document.getElementById('device-authentication').checked&&!document.getElementById('device-authentication').disabled);
  assert.equal(authEnabled,true);assert.deepEqual(state.records,beforeAuth);
  cancelAuth=true;await page.locator('#device-authentication').click();await page.waitForFunction(()=>!document.getElementById('device-authentication').disabled);
  assert.equal(await page.locator('#device-authentication').isChecked(),true);assert.equal(authEnabled,true);
  cancelAuth=false;await page.locator('#device-authentication').click();await page.waitForFunction(()=>!document.getElementById('device-authentication').disabled);assert.equal(authEnabled,false);
  authAvailable=false;await page.reload();await page.getByText('Set up a phone screen lock to enable.').waitFor();assert.equal(await page.locator('#device-authentication').isDisabled(),true);authAvailable=true;
  console.log('Device storage UI: password');
  await page.goto(URL+'#wallets');await page.locator('.saved-wallet > summary').nth(1).click();await page.locator('[data-open-wallet]').nth(1).click();
  await page.locator('#unlock-password').fill('Public-test-password-123');await page.locator('#unlock-submit').click();await page.waitForFunction(()=>document.documentElement.dataset.walletState==='unlocked');
  assert.equal(JSON.parse(state.records[L.ACTIVE]).format,E.FORMAT);
  console.log('Device storage UI: create');
  await page.goto(URL+'#wallets');await page.locator('#add-wallet').click();await page.locator('#ack').check();
  let release;gate=new Promise(resolve=>release=resolve);await page.evaluate(()=>window.__fixtureWriting=false);await page.locator('#submit-setup').click();
  await page.waitForFunction(()=>window.__fixtureWriting);
  assert.equal(await page.locator('#recovery-words').count(),0,'No recovery reveal before durable save');
  release();gate=null;await page.locator('#recovery-words').waitFor();
  assert.equal(JSON.parse(state.records[L.COLLECTION]).wallets.length,3);
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.walletState==='unlocked');
  // Backgrounding during a save must not reveal a phrase when the reply arrives.
  await page.goto(URL+'#wallets');await page.locator('#add-wallet').click();await page.locator('#ack').check();
  gate=new Promise(resolve=>release=resolve);await page.evaluate(()=>window.__fixtureWriting=false);await page.locator('#submit-setup').click();
  await page.waitForFunction(()=>window.__fixtureWriting);
  await page.evaluate(()=>window.dispatchEvent(new Event('safecore-pause')));
  release();gate=null;
  await page.waitForFunction(()=>document.documentElement.dataset.walletState==='locked');
  assert.equal(await page.locator('#recovery-words').count(),0);
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.walletState==='unlocked');
  assert.equal(JSON.parse(state.records[L.COLLECTION]).wallets.length,4);
  console.log('Device storage UI: failures');
  await page.goto(URL+'#wallets');await page.locator('.saved-wallet').last().locator('summary').first().click();
  await page.locator('#wallet-rename summary').click();await page.locator('#current-wallet-name').fill('Must not persist');
  const before=structuredClone(state);failWrite=true;await page.locator('#rename-wallet button').click();
  await page.getByRole('heading',{name:'Wallet storage unavailable'}).waitFor();assert.deepEqual(state,before);assert.equal(await page.locator('#recovery-words').count(),0);
  failWrite=false;await page.reload();await page.locator('.saved-wallet').first().waitFor();assert.equal(await page.getByText('Must not persist',{exact:true}).count(),0);
  console.log('Device storage UI: disposable JSON imports');
  for(const [name,vault] of [['throwaway-open.json',a],['throwaway-encrypted.json',b]]){
   await page.locator('#add-wallet').click();await page.locator('[data-setup="import"]').click();
   await page.locator('#backup-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(vault))});
   await page.waitForFunction(()=>document.getElementById('file-status').textContent.includes('backup selected'));
   if(vault.format===E.FORMAT){await page.locator('#password').fill('Public-test-password-123');await page.locator('#confirm').fill('Public-test-password-123');}
   await page.locator('#submit-setup').click();await page.waitForFunction(()=>location.hash==='#wallet');
   const restored=JSON.parse(state.records[L.ACTIVE]);
   assert.equal(restored.format,vault.format);assert.deepEqual(await E.decrypt(webcrypto,restored,'Public-test-password-123'),recipe);
   assert.equal(await page.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')===null&&localStorage.getItem('corevault.wallets.v1')===null),true);
   await page.goto(URL+'#wallets');await page.locator('.saved-wallet').first().waitFor();
  }
  assert.equal(JSON.parse(state.records[L.COLLECTION]).wallets.length,6);
  failRead=true;await page.reload();await page.getByRole('heading',{name:'Wallet storage unavailable'}).waitFor();assert.equal(await page.locator('#submit-setup, #confirm-remove').count(),0);
  failRead=false;
  console.log('Device storage UI: first-wallet defaults and cancellation');
  for(const firstMode of ['create','import','no-screen-lock','opted-out']){
   state={revision:String(++serial),records:{[L.ACTIVE]:null,[L.COLLECTION]:null}};
   authEnabled=false;authAvailable=firstMode!=='no-screen-lock';firstWalletDefault=['create','import'].includes(firstMode);cancelAuth=firstWalletDefault;
   await page.goto(URL+'#setup');await page.reload();await page.goto(URL+'#setup');await page.locator('#ack').waitFor();
   if(firstMode==='import'){
    await page.locator('[data-setup="import"]').click();
    const G=require('../../recovery/wallet.js'),F=require('../../recovery/formats.js');
    const backup=F.exportJSON(ethers,E,webcrypto,G.derive(ethers,recipe.mnemonic,{coin:'pep',count:3}));
    await page.locator('#backup-file').setInputFiles({name:'throwaway-pepecoin-recovery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await page.waitForFunction(()=>document.getElementById('file-status').textContent.includes('backup selected'));
   }else await page.locator('#ack').check();
   const changes=authChanges;
   if(cancelAuth){
    await page.locator('#submit-setup').click();await page.getByText('Fixture authentication cancelled',{exact:true}).waitFor();
    assert.equal(state.records[L.ACTIVE],null,'Cancelled first-wallet auth must not save a wallet');
    assert.equal(authEnabled,false);cancelAuth=false;
   }
   await page.locator('#submit-setup').click();
   if(firstMode==='import')await page.waitForFunction(()=>location.hash==='#wallet');else await page.locator('#recovery-words').waitFor();
   assert.equal(authChanges-changes,['create','import'].includes(firstMode)?1:0);
   assert.ok(state.records[L.ACTIVE]);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: native-origin bootstrap/migration, settings, portable export, password unlock, durable create, reload and failed-save/read UI without plaintext fallback.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
