// Isolated public fixture; synthetic Electrum responses, no real servers/funds.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const b=await chromium.launch();try{
 const c=await b.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
 const vault=E.unprotected(webcrypto,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
 await c.addInitScript(v=>{
  if(!localStorage.getItem('whippet.dev.encrypted.v1'))localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));
  window.fetch=async()=>new Response(JSON.stringify({error:[],result:{}}));window.__calls=[];window.__scans=0;
  window.WebSocket=class {
   static OPEN=1;
   constructor(url){this.url=url;this.readyState=1;queueMicrotask(()=>this.onopen?.());}
   close(){this.readyState=3;queueMicrotask(()=>this.onclose?.());}
   send(raw){const q=JSON.parse(raw);__calls.push(q);if(this.url.includes('slow'))return;
    const coin=this.url.includes('shic')?'shic':this.url.includes('wht')?'wht':'pep';
    const result=q.method==='server.features'?{genesis_hash:this.url.includes('wrong')?'0'.repeat(64):WalletNetwork.CONFIG[coin].genesis}:q.method==='blockchain.headers.subscribe'?{height:500}:q.method==='blockchain.relayfee'?.001:['fixture','1.4'];
    queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:q.id,result})}));
   }
  };
  Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){Object.defineProperty(window,'WalletNetwork',{value:N});N.scan=async(coin,pool)=>{
   __scans++;return {coin,tip:500,at:Date.now(),complete:true,cached:false,everUsed:[],confirmed:0n,unconfirmed:0n,feeRate:100000n,rows:pool.map(account=>({account,checked:true,confirmed:0n,unconfirmed:0n,history:[],utxos:[]}))};
  };}});
 },vault);
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:8787/#security');
 const key='corevault.connections.v1',pep=p.locator('#endpoint-pep'),use=p.locator('[data-use-connection="pep"]'),test=p.locator('[data-test-connection="pep"]');
 const stored=await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1'));
 await p.locator('#custom-connections > summary').click();assert.equal(await use.isDisabled(),true);
 const checkDefaults=async()=>{
  for(const coin of ['pep','wht','shic']){
   assert.equal(await p.locator('#endpoint-'+coin).inputValue(),'','Built-in addresses are not prefilled');
   assert.equal(await p.locator('#endpoint-current-'+coin).innerText(),'Using default server');
   assert.equal(await p.evaluate(coin=>WalletNetwork.endpoint(coin)===WalletNetwork.CONFIG[coin].url,coin),true,'Built-in connection remains active');
  }
  assert.doesNotMatch(await p.locator('#custom-connections').innerHTML(),/electrum\.pepecoinservice\.org/,'Default host is not advertised in the settings markup');
 };
 await checkDefaults();await test.click();assert.equal(await use.isDisabled(),true);assert.equal(await p.evaluate(()=>__calls.length),0,'An empty custom field does not start a probe');
 assert.equal(await p.locator('#recovery-preferences').evaluate(el=>el.previousElementSibling.querySelector('#screen-protection')!==null&&el.nextElementSibling.querySelector('#custom-connections')!==null),true,'Komodo recovery sits directly below Block screenshots and above Electrum connections');
 await pep.fill('wss://pep.example/');await test.click();await p.waitForFunction(()=>!document.querySelector('[data-use-connection="pep"]').disabled);
 assert.equal(await p.evaluate(()=>WalletNetwork.endpoint('pep')),await p.evaluate(()=>WalletNetwork.CONFIG.pep.url));
 await pep.fill('wss://wrong.example/');assert.equal(await use.isDisabled(),true);await test.click();await p.locator('[data-connection-status="pep"]').filter({hasText:'Wrong blockchain'}).waitFor();assert.equal(await use.isDisabled(),true);
 await pep.fill('wss://slow.example/');await test.click();await pep.fill('wss://pep.example/');await test.click();await p.waitForFunction(()=>!document.querySelector('[data-use-connection="pep"]').disabled);
 await p.evaluate(()=>{const original=Storage.prototype.setItem;window.__setItem=original;Storage.prototype.setItem=function(k,v){if(k==='corevault.connections.v1')throw Error('fixture quota');return original.call(this,k,v);};});
 await use.click();assert.match(await p.locator('[data-connection-status="pep"]').innerText(),/fixture quota/);assert.equal(await p.evaluate(()=>WalletNetwork.endpoint('pep')),await p.evaluate(()=>WalletNetwork.CONFIG.pep.url));
 await p.evaluate(()=>Storage.prototype.setItem=__setItem);const scans=await p.evaluate(()=>__scans);await use.click();
 await p.waitForFunction(()=>WalletNetwork.endpoint('pep')==='wss://pep.example/'&&__scans>2);assert.ok(await p.evaluate(()=>__scans)>scans);
 assert.deepEqual(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),key)),{pep:'wss://pep.example/'});
 await p.locator('#endpoint-wht').fill('wss://wht.example/');await p.locator('[data-test-connection="wht"]').click();await p.waitForFunction(()=>!document.querySelector('[data-use-connection="wht"]').disabled);await p.locator('[data-use-connection="wht"]').click();
 assert.equal(await p.evaluate(()=>WalletNetwork.endpoint('pep')),'wss://pep.example/');await p.reload();await p.locator('#custom-connections > summary').click();assert.equal(await p.locator('#endpoint-wht').inputValue(),'wss://wht.example/');
 await p.locator('#custom-connections').scrollIntoViewIfNeeded();await p.screenshot({path:'/tmp/safecore-custom-connections.png'});
 await pep.fill('wss://slow.example/');await test.click();await p.locator('[data-nav="wallet"]').click();await p.locator('.holdings').waitFor();await p.locator('[data-nav="security"]').click();await p.locator('#custom-connections > summary').click();assert.equal(await use.isDisabled(),true,'Navigation discards tested/draft endpoints');
 const other=await c.newPage();await other.goto('http://localhost:8787/#security');
 await other.evaluate(k=>localStorage.setItem(k,JSON.stringify({pep:'wss://other.example/'})),key);await p.waitForFunction(()=>WalletNetwork.endpoint('pep')==='wss://other.example/');
 await other.evaluate(k=>localStorage.setItem(k,'broken'),key);await p.locator('#connection-error').filter({hasText:'Check your saved connections'}).waitFor({state:'attached'});
 const count=await p.evaluate(()=>__scans);await p.locator('[data-nav="wallet"]').click();await p.locator('.holdings').waitFor();assert.match(await p.locator('#main').innerText(),/Check connection settings/);assert.equal(await p.evaluate(()=>__scans),count,'Invalid saved config blocks refresh');
 await p.locator('[data-nav="security"]').click();await p.locator('#custom-connections > summary').click();await p.locator('#restore-connections').click();assert.equal(await p.evaluate(()=>WalletNetwork.endpoint('pep')),await p.evaluate(()=>WalletNetwork.CONFIG.pep.url));
 await checkDefaults();
 assert.equal(await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')),stored,'Server changes preserve wallet secrets');
 assert.ok((await p.evaluate(()=>__calls)).every(q=>['server.version','server.features','blockchain.headers.subscribe','blockchain.relayfee'].includes(q.method)),'Probes send no wallet queries or transactions');
 assert.deepEqual(errors,[]);console.log('PASS: connection controls, Komodo order, test-before-use, failure/cancel/save rollback, per-coin persistence, cross-tab updates, corrupt-config block, defaults and unchanged wallet.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
