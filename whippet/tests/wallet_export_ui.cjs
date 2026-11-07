// Public fixtures in a disposable profile. Exports intercepted, never user data.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const b=await chromium.launch();try{
 const a='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
 const other='legal winner thank year wave sausage worth useful legal winner thank yellow';
 const vaults=[E.unprotected(webcrypto,E.recipe(ethers,a)),E.unprotected(webcrypto,E.recipe(ethers,other)),await E.encrypt(webcrypto,E.recipe(ethers,a),'Disposable-fixture-password')];
 const c=await b.newContext({viewport:{width:390,height:844},colorScheme:'dark'});await require('./empty_network.cjs')(c);
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:8787/');
 const ids=await p.evaluate(vaults=>{const lib=WalletLibrary.create(localStorage);vaults.forEach((v,i)=>lib.save(v,['Current wallet','Other wallet','Protected wallet'][i]));const ids=vaults.map(v=>WalletLibrary.id(v));lib.activate(ids[0]);return ids;},vaults);
 await p.goto('http://localhost:8787/#security');await p.reload();assert.equal(await p.locator('#export').count(),0);
 await p.evaluate(()=>{window.__exports=[];window.SafeCorePlatform={exportBackup:async raw=>{__exports.push(JSON.parse(raw));}};});
 const storage=await p.evaluate(()=>[localStorage.getItem('whippet.dev.encrypted.v1'),localStorage.getItem('corevault.wallets.v1')]);
 await p.locator('.wallets-shortcut').click();
 const expand=async id=>{const row=p.locator(`.saved-wallet:has([data-export-wallet="${id}"])`);if(!await row.evaluate(el=>el.open))await row.locator(':scope > summary').click();};
 const exportWallet=async id=>{await expand(id);await p.locator(`[data-export-wallet="${id}"]`).click();};
 assert.equal(await p.locator('.saved-wallet[open]').count(),0,'All wallet controls start collapsed');
 assert.equal(await p.locator('.wallet-current').innerText(),'(current)');
 assert.equal(await p.locator('.saved-wallet:has(.wallet-current) strong').innerText(),'Current wallet');
 assert.equal(await p.locator('#wallet-seed').isVisible(),false);
 await expand(ids[0]);
 assert.equal(await p.locator('#wallet-seed').innerText(),'View recovery phrase for Current wallet');
 await expand(ids[1]);
 assert.equal(await p.locator('.saved-wallet[open]').count(),1,'Only selected wallet expands');
 assert.equal(await p.locator('#wallet-seed').isVisible(),false,'Other wallets never show the current wallet recovery control');
 assert.deepEqual(await p.evaluate(()=>[localStorage.getItem('whippet.dev.encrypted.v1'),localStorage.getItem('corevault.wallets.v1')]),storage,'Expanding never activates or changes wallets');
 await expand(ids[0]);
 assert.equal(await p.locator('#current-wallet-name').isVisible(),false,'Rename is collapsed until requested');
 await p.locator('#wallet-rename summary').click();
 const renameBox=await p.locator('#current-wallet-name').boundingBox();assert.ok(renameBox.height<=38&&renameBox.width<=245,'Rename field stays compact');
 assert.ok((await p.locator('#rename-wallet button').boundingBox()).height>=44,'Save keeps a usable touch target');
 await p.screenshot({path:'/tmp/safecore-wallet-rename-compact.png',fullPage:true});
 await p.locator('#current-wallet-name').fill('Renamed fixture');await p.locator('#rename-wallet button').click();
 await p.waitForFunction(()=>document.getElementById('current-wallet-label').textContent==='Renamed fixture');
 assert.equal(await p.locator('#wallet-seed').innerText(),'View recovery phrase for Renamed fixture');
 assert.equal(await p.locator('#current-wallet-name').isVisible(),false);
 await p.locator('#wallet-rename summary').click();await p.locator('#current-wallet-name').fill('Current wallet');await p.locator('#rename-wallet button').click();
 await p.waitForFunction(()=>document.getElementById('current-wallet-label').textContent==='Current wallet');
 for(const width of [320,390,430,1280]){
  await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const wallet of await p.locator('.saved-wallet').all()){
   if(await wallet.evaluate(el=>el.open))await wallet.locator(':scope > summary').click();
   assert.ok((await wallet.boundingBox()).height<=65,'Collapsed wallet rows remain compact');
   await wallet.locator(':scope > summary').click();
   const row=wallet.locator('.wallet-actions');
   const boxes=await row.locator('button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
   assert.equal(boxes.length,3);for(const box of boxes){assert.equal(box.y,boxes[0].y);assert.ok(Math.abs(box.width-boxes[0].width)<1);assert.ok(box.height>=44);}
   await wallet.locator(':scope > summary').click();
  }
 }
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'/tmp/safecore-wallet-export-rows.png',fullPage:true});
 const summary=p.locator('.saved-wallet:has(.wallet-current) > summary');
 await summary.focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#wallet-seed').isVisible(),true,'Wallet expands from the keyboard');
 await p.screenshot({path:'/tmp/safecore-wallet-expanded.png',fullPage:true});
 await p.keyboard.press('Space');assert.equal(await p.locator('#wallet-seed').isVisible(),false,'Wallet collapses from the keyboard');
 for(const index of [1,0]){
  await exportWallet(ids[index]);await p.locator('#confirm-export').waitFor();
  assert.equal(await p.locator('#export-wallet-name').innerText(),index?'Other wallet':'Current wallet');
  const before=await p.evaluate(()=>__exports.length);await p.locator('.export-actions a').click();assert.equal(await p.evaluate(()=>__exports.length),before);
  await exportWallet(ids[index]);await p.locator('#confirm-export').click();
  assert.deepEqual(await p.evaluate(()=>__exports.at(-1)),vaults[index]);await p.locator('.wallets-shortcut').click();
 }
 await exportWallet(ids[2]);assert.deepEqual(await p.evaluate(()=>__exports.at(-1)),vaults[2]);
 assert.equal(await p.locator('#confirm-export').count(),0,'Encrypted export stays encrypted without asking for its seed or password');
 assert.deepEqual(await p.evaluate(()=>[localStorage.getItem('whippet.dev.encrypted.v1'),localStorage.getItem('corevault.wallets.v1')]),storage,'Export never activates or changes any wallet');
 const count=await p.evaluate(()=>__exports.length);
 await exportWallet(ids[1]);
 await p.locator('#confirm-export').waitFor();
 await p.evaluate(()=>{const data=JSON.parse(localStorage.getItem('corevault.wallets.v1'));data.wallets[1].vault.recipe.mnemonic=data.wallets[0].vault.recipe.mnemonic;localStorage.setItem('corevault.wallets.v1',JSON.stringify(data));});
 await p.locator('#confirm-export').click();assert.equal(await p.evaluate(()=>__exports.length),count);assert.match(await p.locator('#error').innerText(),/expired or changed/);
 await p.locator('.wallets-shortcut').click();await exportWallet(ids[1]);
 await p.locator('#confirm-export').waitFor();
 await p.evaluate(id=>WalletLibrary.create(localStorage).remove(id),ids[1]);await p.locator('#confirm-export').click();assert.equal(await p.evaluate(()=>__exports.length),count);
 await p.locator('.wallets-shortcut').click();await exportWallet(ids[0]);
 await p.locator('#confirm-export').waitFor();
 await p.evaluate(()=>window.dispatchEvent(new Event('safecore-pause')));await p.locator('.saved-wallet').first().waitFor();assert.equal(await p.locator('#confirm-export').count(),0);
 await p.evaluate(()=>location.hash='#export');await p.locator('.saved-wallet').first().waitFor();assert.equal(await p.evaluate(()=>__exports.length),count,'Direct route cannot resurrect export approval');
 assert.deepEqual(errors,[]);console.log('PASS: clean wallet action rows, correct active/inactive encrypted/unprotected exports, cancel, unchanged storage/selection, stale/deleted/background/direct-route guards.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
