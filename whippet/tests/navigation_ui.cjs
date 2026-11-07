// Isolated browser only; no personal profile, wallet or real network access.
const assert=require('node:assert/strict'),{chromium}=require('./browser-helper.cjs');
(async()=>{const b=await chromium.launch();try{
 const c=await b.newContext({viewport:{width:390,height:844},colorScheme:'dark'});await require('./empty_network.cjs')(c);
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:8787/');
 await p.evaluate(()=>{const recipe=WalletEngine.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');WalletLibrary.create(localStorage).save(WalletEngine.unprotected(crypto,recipe),'Navigation fixture');});await p.reload();
 for(const theme of ['dark','light']){
  await p.emulateMedia({colorScheme:theme});await p.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
  for(const width of [320,390,430,1280]){
   await p.setViewportSize({width,height:844});
   const nav=await p.locator('.bottom-navigation').evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.borderTopWidth,s.backdropFilter,s.pointerEvents];});
   assert.deepEqual(nav,['rgba(0, 0, 0, 0)','0px','none','none']);
   const links=await p.locator('.bottom-navigation a').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,height:r.height,pointer:s.pointerEvents};}));
   assert.equal(links.length,5);for(let i=0;i<links.length;i++){assert.ok(links[i].width>=44&&links[i].height>=44);assert.equal(links[i].pointer,'auto');assert.ok(links[i].bottom<=844-7);if(i)assert.ok(links[i].x-links[i-1].right>=7);}
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await p.setViewportSize({width:390,height:844});
  for(const route of ['receive','send','activity','security','wallet']){
   await p.locator(`[data-nav=${route}]`).click();await p.waitForFunction(route=>document.querySelector(`[data-nav="${route}"]`)?.getAttribute('aria-current')==='page',route);
   assert.equal(await p.locator('.bottom-navigation a.active').count(),1);
   const style=await p.locator('.bottom-navigation a.active').evaluate(el=>{const s=getComputedStyle(el);return {shadow:s.boxShadow,glow:s.textShadow,filter:getComputedStyle(el.querySelector('svg')).filter};});
   assert.equal(style.shadow,'none');assert.notEqual(style.glow,'none');assert.notEqual(style.filter,'none');
   for(const link of await p.locator('.bottom-navigation a').all()){
    await link.hover();
    assert.deepEqual(await link.evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.boxShadow,s.borderTopWidth,s.borderRadius];}),['rgba(0, 0, 0, 0)','none','0px','0px'],'No bubbles, including active and hovered links');
   }
  }
  await p.screenshot({path:`/tmp/safecore-floating-nav-${theme}.png`});
 }
 assert.deepEqual(errors,[]);console.log('PASS: bubble-free navigation including hover, transparent gaps, active icon/text glow, all routes, dark/light and 320–1280px layouts.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
