// Disposable browser plus a simulated native setting; no device or wallet data.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {chromium}=require('./browser-helper.cjs');
(async()=>{
 const source=fs.readFileSync('whippet/www/native.js','utf8'),sent=[];
 const scope={location:{origin:'https://appassets.androidplatform.net'},addEventListener(){},SafeCoreNative:{postMessage:raw=>sent.push(JSON.parse(raw))}};
 scope.window=scope;vm.createContext(scope);vm.runInContext(source,scope);
 const read=scope.SafeCorePlatform.getScreenProtection();assert.equal(sent[0].action,'getScreenProtection');
 scope.SafeCoreNative.onmessage({data:JSON.stringify({id:sent[0].id,ok:true,enabled:true})});assert.equal(await read,true);
 const change=scope.SafeCorePlatform.setScreenProtection(false);assert.equal(sent[1].value,'false');
 scope.SafeCoreNative.onmessage({data:JSON.stringify({id:sent[1].id,ok:true,enabled:false})});assert.equal(await change,false);
 await assert.rejects(()=>scope.SafeCorePlatform.setScreenProtection('false'),/Invalid/);
 const malformed=scope.SafeCorePlatform.getScreenProtection();scope.SafeCoreNative.onmessage({data:JSON.stringify({id:sent.at(-1).id,ok:true,enabled:'false'})});await assert.rejects(()=>malformed,/Could not read/);
 const ordinary={window:{},location:{origin:'http://localhost:8788'}};vm.createContext(ordinary);vm.runInContext(source,ordinary);assert.equal(ordinary.window.SafeCorePlatform,undefined);
 const browser=await chromium.launch();try{
  const context=await browser.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(context);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8787/#security');
  assert.equal(await page.locator('#screen-protection').isDisabled(),true);assert.equal(await page.locator('#screen-protection-note').textContent(),'');
  await page.screenshot({path:'/tmp/safecore-security-screen-control.png'});
  await context.addInitScript(()=>{window.SafeCorePlatform={
   getScreenProtection:async()=>{if(window.__failRead)throw Error('Fixture read failure');return localStorage.getItem('fixture.screen')!=='false';},
   setScreenProtection:async enabled=>{if(window.__cancel)throw Error('Screenshot setting unchanged.');localStorage.setItem('fixture.screen',String(enabled));return enabled;}
  };});
  await page.reload();await page.waitForFunction(()=>!document.getElementById('screen-protection').disabled);
  assert.equal(await page.locator('#screen-protection').isChecked(),true);
  await page.locator('#screen-protection').uncheck();await page.waitForFunction(()=>!document.getElementById('screen-protection').disabled);
  assert.equal(await page.locator('#screen-protection').isChecked(),false);await page.reload();
  await page.waitForFunction(()=>!document.getElementById('screen-protection').disabled);assert.equal(await page.locator('#screen-protection').isChecked(),false);
  await page.locator('#screen-protection').check();await page.waitForFunction(()=>!document.getElementById('screen-protection').disabled);
  await page.evaluate(()=>window.__cancel=true);await page.locator('#screen-protection').click();
  await page.waitForFunction(()=>!document.getElementById('screen-protection').disabled);assert.equal(await page.locator('#screen-protection').isChecked(),true,'Cancellation cannot falsely show protection off');
  await page.evaluate(()=>{window.__failRead=true;location.hash='wallet';});await page.locator('#screen-protection').waitFor({state:'detached'});await page.locator('[data-nav="security"]').click();
  await page.waitForFunction(()=>document.getElementById('screen-protection-note')?.textContent.includes('unavailable'));assert.equal(await page.locator('#screen-protection').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: native adapter validation/origin guard, browser unavailable state, confirmed toggle persistence, cancellation and read-failure handling.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
