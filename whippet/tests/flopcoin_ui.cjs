// Disposable browser and public seed; synthetic Electrum, no real funds.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(context);
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');delete recipe.paths.flop;
 const owner=E.accounts(ethers,recipe).flop;
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:10n*T.COIN,script:T.script('flop',owner.address)}],locktime:0})).slice(2);
 const vault=E.unprotected(webcrypto,recipe),f={raw,txid:T.parse(raw).txid,sh:T.scriptHash('flop',owner.address)};
 await context.addInitScript(({vault,f})=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));window.__flopCalls=[];window.__broadcasts=[];
  const EmptySocket=window.WebSocket;
  window.WebSocket=class extends EmptySocket{
   send(raw){if(!this.url.includes('.fixture'))return super.send(raw);const q=JSON.parse(raw);__flopCalls.push(q);const owned=q.params[0]===f.sh;let result;
    if(q.method==='server.version')result=['fixture','1.4'];
    else if(q.method==='server.features')result={genesis_hash:this.url.includes('wrong')?WalletNetwork.CONFIG.pep.genesis:WalletNetwork.CONFIG.flop.genesis};
    else if(q.method==='blockchain.headers.subscribe')result={height:500};
    else if(q.method==='blockchain.scripthash.subscribe')result=owned?WalletTransactions.historyStatus([{tx_hash:f.txid,height:100}]):null;
    else if(q.method==='blockchain.scripthash.get_history')result=owned?[{tx_hash:f.txid,height:100}]:[];
    else if(q.method==='blockchain.scripthash.get_balance')result={confirmed:owned?1000000000:0,unconfirmed:0};
    else if(q.method==='blockchain.scripthash.listunspent')result=owned?[{tx_hash:f.txid,tx_pos:0,height:100,value:1000000000}]:[];
    else if(q.method==='blockchain.transaction.get')result=f.raw;
    else if(q.method==='blockchain.relayfee')result=.001;
    else if(q.method==='blockchain.estimatefee')result=-1;
    else if(q.method==='blockchain.transaction.broadcast'){__broadcasts.push(q.params[0]);result=WalletTransactions.parse(q.params[0]).txid;}
    else throw Error('Unexpected FLOP fixture call');
    queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:q.id,result})}));
   }
  };
 },{vault,f});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://localhost:8787/#coins');await p.locator('#coin-search').waitFor();
 assert.equal(await p.locator('[data-select-coin=flop]').count(),0);
 assert.equal(await p.evaluate(()=>__flopCalls.length),0);
 const settings=async()=>{await p.locator('[data-nav=security]').click();await p.locator('#legacy-assets > summary').click();};
 await settings();assert.equal(await p.locator('#enable-flop').isChecked(),false);assert.equal(await p.locator('#endpoint-flop').count(),0);
 await p.locator('#enable-flop').check();await p.locator('#endpoint-flop').waitFor();
 assert.equal(await p.locator('#endpoint-flop').inputValue(),'');assert.match(await p.locator('#endpoint-current-flop').innerText(),/required/);
 await p.locator('[data-nav=wallet]').click();await p.locator('#header-add-coins').click();
 assert.deepEqual(await p.locator('[data-select-coin]').evaluateAll(rows=>rows.map(r=>r.dataset.selectCoin)),['bel','btc','bch','dash','dgb','dingo','doge','flop','ltc','pep','rvn','shic','trmp','wht']);
 await p.locator('[data-select-coin=flop]').click();
 assert.equal(await p.locator('[data-overview-coin=flop]').isDisabled(),true);
 await p.locator('[data-nav=receive]').click();assert.equal(await p.locator('[data-coin=flop]').count(),0);
 await p.locator('[data-nav=send]').click();assert.equal(await p.locator('[data-send-coin=flop]').count(),0);
 assert.equal(await p.evaluate(()=>__flopCalls.length),0,'Opt-in without endpoint must not connect');
 await p.locator('[data-nav=security]').click();await p.locator('#custom-connections > summary').click();
 const endpoint=p.locator('#endpoint-flop'),test=p.locator('[data-test-connection=flop]'),use=p.locator('[data-use-connection=flop]'),status=p.locator('[data-connection-status=flop]');
 assert.equal(await use.isDisabled(),true);
 await endpoint.fill('wss://wrong.fixture/');await test.click();await p.waitForFunction(()=>document.querySelector('[data-connection-status=flop]').textContent.includes('genesis'));
 assert.equal(await use.isDisabled(),true);assert.ok(await p.evaluate(()=>__flopCalls.every(q=>q.method.startsWith('server.'))));
 await endpoint.fill('wss://flop.fixture/');await test.click();await use.waitFor({state:'visible'});await p.waitForFunction(()=>!document.querySelector('[data-use-connection=flop]').disabled);
 assert.match(await status.innerText(),/Connected/);assert.ok(await p.evaluate(()=>__flopCalls.every(q=>!q.method.includes('scripthash'))),'Testing must not disclose addresses');
 await endpoint.fill('wss://changed.fixture/');assert.equal(await use.isDisabled(),true);
 await endpoint.fill('wss://flop.fixture/');await test.click();await p.waitForFunction(()=>!document.querySelector('[data-use-connection=flop]').disabled);await use.click();
 await p.locator('[data-nav=wallet]').click();await p.waitForFunction(()=>document.querySelector('[data-overview-coin=flop] .holding-balance')?.textContent==='10 FLOP');
 await p.locator('[data-overview-coin=flop]').click();await p.locator('#address').waitFor();assert.equal(await p.locator('#address').innerText(),E.accounts(ethers,recipe,1).flop.address,'Used address advances to the first unused address');
 assert.equal(await p.locator('#komodo-open').count(),0);
 await p.locator('[data-nav=send]').click();await p.locator('[data-send-coin=flop]').click();await p.locator('#send-max:not([disabled])').waitFor();
 await p.locator('#send-address').fill(E.accounts(ethers,recipe,1).flop.address);await p.locator('#send-max').click();
 assert.equal(await p.locator('#send-amount').inputValue(),'10');assert.equal(await p.locator('#automatic-fee').innerText(),'0.00227 FLOP');assert.equal(await p.locator('#one-coin-fee').count(),0);
 await p.locator('#review-send').click();await p.locator('#broadcast-send').waitFor();assert.match(await p.locator('.send-review').innerText(),/9.99773 FLOP/);
 // Another tab disabling the feature must cancel this still-open review too.
 await p.evaluate(()=>{const key='corevault.legacy-flop.v1';localStorage.setItem(key,'false');window.dispatchEvent(new StorageEvent('storage',{key,newValue:'false'}));});
 assert.equal(await p.locator('#broadcast-send').count(),0);
 assert.equal(await p.evaluate(()=>{try{WalletNetwork.client('flop');return false;}catch(_){return true;}}),true);
 await p.locator('[data-nav=send]').click();assert.equal(await p.locator('[data-send-coin=flop], #broadcast-send').count(),0);assert.equal(await p.evaluate(()=>__broadcasts.length),0);
 await settings();await p.locator('#enable-flop').check();assert.equal(await p.locator('#endpoint-flop').inputValue(),'wss://flop.fixture/');
 await p.locator('[data-nav=send]').click();await p.locator('[data-send-coin=flop]').click();await p.locator('#send-max:not([disabled])').waitFor();
 await p.locator('#send-address').fill(E.accounts(ethers,recipe,1).flop.address);await p.locator('#send-max').click();await p.locator('#review-send').click();await p.locator('#send-ack').check();await require('./accept_missing_price.cjs')(p);await p.locator('#broadcast-send').click();
 await p.waitForFunction(()=>__broadcasts.length===1);const sent=T.parse(await p.evaluate(()=>__broadcasts[0]));assert.equal(sent.inputs[0].txid,f.txid);assert.equal(sent.outputs[0].value,999773000n);
 await p.reload();await p.locator('[data-nav=security]').click();assert.equal(await p.locator('#enable-flop').isChecked(),true);
 await p.locator('#legacy-assets > summary').click();await p.locator('#enable-flop').uncheck();await p.reload();await p.locator('[data-nav=wallet]').click();await p.locator('#header-add-coins').click();assert.equal(await p.locator('[data-select-coin=flop]').count(),0);
 assert.equal(await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')),JSON.stringify(vault),'Opt-in never rewrites a wallet');
 assert.deepEqual(errors,[]);console.log('PASS: hidden FLOP opt-in, endpoint-required UI, wrong-chain/test-before-use gates, no default queries, automatic-fee simulated send, disable cancels review, persisted endpoint and unchanged wallet.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
