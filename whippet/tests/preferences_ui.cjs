const assert=require('node:assert/strict'),{chromium}=require('./browser-helper.cjs');
(async()=>{const b=await chromium.launch();try{
 for(const initial of ['dark','light']){
  const c=await b.newContext({viewport:{width:390,height:844},colorScheme:initial});await require('./empty_network.cjs')(c);
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://localhost:8787/#security');
  const theme=()=>p.evaluate(()=>document.documentElement.dataset.theme);
  assert.equal(await theme(),initial);assert.equal(await p.locator('#theme-choice').inputValue(),'system');
  assert.equal(await p.locator('h1').innerText(),'Settings');assert.equal(await p.locator('.eyebrow').count(),0);
  assert.doesNotMatch(await p.locator('#main').innerText(),/browser profile|backgrounded|Live mode|development wallet/);
  assert.equal(await p.locator('.facts').count(),0);
  assert.equal(await p.locator('#remove-start').count(),0);assert.doesNotMatch(await p.locator('#main').innerText(),/Wallet settings|Remove local wallet/);
  for(const colorScheme of ['light','dark']){
   await p.emulateMedia({colorScheme});await p.waitForFunction(theme=>document.documentElement.dataset.theme===theme,colorScheme);assert.equal(await theme(),colorScheme);
   assert.deepEqual(await p.locator('#theme-choice').evaluate(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.backgroundColor];}),['0px','rgba(0, 0, 0, 0)']);
   assert.equal(await p.locator('#theme-choice option').first().evaluate(el=>{const s=getComputedStyle(el);return s.color!==s.backgroundColor&&s.backgroundColor!=='rgba(0, 0, 0, 0)';}),true);
  }
  await p.locator('#theme-choice').selectOption('light');await p.emulateMedia({colorScheme:'dark'});assert.equal(await theme(),'light');
  await p.reload();assert.equal(await theme(),'light');assert.equal(await p.locator('#theme-choice').inputValue(),'light');
  await p.locator('#theme-choice').selectOption('system');assert.equal(await theme(),'dark');
  const other=await c.newPage();await other.goto('http://localhost:8787/#security');await other.locator('#theme-choice').selectOption('light');await p.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await p.locator('#theme-choice').selectOption('system');
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('safecore-theme',{detail:'light'})));assert.equal(await theme(),'light');
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('safecore-theme',{detail:'dark'})));assert.equal(await theme(),'dark');
  await p.locator('#theme-choice').selectOption('light');await p.evaluate(()=>window.dispatchEvent(new CustomEvent('safecore-theme',{detail:'dark'})));assert.equal(await theme(),'light','Native device updates must honor manual override');
  await p.locator('#wallet-information').click();assert.doesNotMatch(await p.locator('#main').innerText(),/Acknowledgment is saved/);
  await p.goto('http://localhost:8787/#setup');await p.locator('[data-setup=import]').click();await p.locator('[data-restore-word="0"]').fill('tre');
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('safecore-theme',{detail:'light'})));
  assert.equal(await p.locator('[data-restore-word="0"]').inputValue(),'tre','Theme updates do not rebuild recovery entry');
  assert.deepEqual(errors,[]);await c.close();
 }
 console.log('PASS: system theme default/live updates, native theme events, persistent/cross-tab overrides, unboxed readable menu, removed duplicate settings/copy, unchanged recovery draft.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
