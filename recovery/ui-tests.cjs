'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),{webcrypto}=require('node:crypto'),{chromium}=require('playwright');
const ethers=require('./assets/ethers.umd.min.js'),G=require('./wallet.js'),F=require('./formats.js'),E=require('./wallet-format.js');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
(async()=>{
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844}}),page=await context.newPage();
  const errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();});
  await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  assert.equal(await page.locator('#coin').inputValue(),'pep');
  assert.deepEqual(await page.locator('#coin option').evaluateAll(options=>options.map(option=>option.value)),['pep','shic','wht']);
  await page.locator('#phrase').fill(phrase);await page.locator('#count').fill('3');
  await page.locator('#derive').click();await page.getByRole('heading',{name:'Pepecoin addresses',exact:true}).waitFor();
  const pep=G.derive(ethers,phrase,{coin:'pep',count:3});
  assert.deepEqual(await page.locator('.address').allTextContents(),pep.wallets.map(w=>w.address));
  assert.equal(await page.locator('.key:visible').count(),0);
  for(const [id,suffix] of [['download','private-backup.json'],['download-text','private-keys.txt'],['download-address-text','addresses-and-private-keys.txt'],['download-csv','addresses-and-private-keys.csv']]){
   const downloaded=page.waitForEvent('download');await page.locator('#'+id).click();const file=await downloaded;
   assert.equal(file.suggestedFilename(),'pepecoin-'+suffix);
   const raw=await fs.readFile(await file.path(),'utf8');
   if(id==='download')assert.deepEqual(await F.importJSON(ethers,G,E,webcrypto,JSON.parse(raw)),pep);
   else assert.ok(raw.includes(pep.wallets[0].wif));
  }
  await page.locator('#coin').selectOption('wht');assert.equal(await page.locator('#results').isHidden(),true);
  await page.locator('#derive').click();await page.getByRole('heading',{name:'Whippet addresses',exact:true}).waitFor();
  assert.deepEqual(await page.locator('.address').allTextContents(),G.derive(ethers,phrase,{count:3}).wallets.map(w=>w.address));
  // A saved bundle selects its recorded asset, regardless of the previous selection.
  await page.locator('#restore').setInputFiles({name:'throwaway-pepecoin.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(F.exportJSON(ethers,E,webcrypto,pep)))});
  await page.getByRole('heading',{name:'Pepecoin addresses',exact:true}).waitFor();assert.equal(await page.locator('#coin').inputValue(),'pep');
  const password='Public-fixture-password-123',encrypted=await E.encrypt(webcrypto,E.recipe(ethers,phrase),password);
  await page.locator('#restore').setInputFiles({name:'throwaway-encrypted.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(encrypted))});
  await page.locator('#backup-password').fill(password);await page.locator('#unlock-backup').click();await page.waitForFunction(()=>!document.getElementById('backup-password-dialog').open);
  assert.deepEqual(await page.locator('.address').allTextContents(),pep.wallets.map(w=>w.address));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No narrow-screen horizontal overflow');
  await page.locator('#coin').selectOption('shic');assert.equal(await page.locator('#results').isHidden(),true);
  await page.locator('#derive').click();await page.getByRole('heading',{name:'Shibacoin addresses',exact:true}).waitFor();
  const shic=G.derive(ethers,phrase,{coin:'shic',count:3});
  assert.deepEqual(await page.locator('.address').allTextContents(),shic.wallets.map(w=>w.address));
  for(const id of ['download','download-text','download-address-text','download-csv']){
   const pending=page.waitForEvent('download');await page.locator('#'+id).click();const file=await pending;
   assert.ok(file.suggestedFilename().startsWith('shibacoin-'));
   const raw=await fs.readFile(await file.path(),'utf8');
   if(id==='download')assert.deepEqual(await F.importJSON(ethers,G,E,webcrypto,JSON.parse(raw)),shic);
   else assert.ok(raw.includes(shic.wallets[0].wif));
  }
  await page.locator('#coin').selectOption('pep');
  await page.locator('#restore').setInputFiles({name:'throwaway-shibacoin.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(F.exportJSON(ethers,E,webcrypto,shic)))});
  await page.getByRole('heading',{name:'Shibacoin addresses',exact:true}).waitFor();assert.equal(await page.locator('#coin').inputValue(),'shic');
  await page.locator('#clear').click();assert.equal(await page.locator('#phrase').inputValue(),'');assert.equal(await page.locator('#results').isHidden(),true);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/safecore-recovery-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  console.log('PASS: file:// offline UI, all three assets, private exports, plain/encrypted JSON imports, clearing and mobile layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
