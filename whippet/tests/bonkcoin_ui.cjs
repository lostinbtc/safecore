// Disposable browser and public seed; synthetic Electrum, no real funds.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844}});await require('./empty_network.cjs')(context);
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');delete recipe.paths.bonc;
 const owner=E.accounts(ethers,recipe).bonc;
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:10n*T.COIN,script:T.script('bonc',owner.address)}],locktime:0})).slice(2);
 const vault=E.unprotected(webcrypto,recipe),f={raw,txid:T.parse(raw).txid,sh:T.scriptHash('bonc',owner.address)};
 await context.addInitScript(({vault,f})=>{
  localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));window.__boncCalls=[];window.__broadcasts=[];
  const EmptySocket=window.WebSocket;
  window.WebSocket=class extends EmptySocket{
   send(raw){if(!this.url.includes('.fixture'))return super.send(raw);const q=JSON.parse(raw);__boncCalls.push(q);const owned=q.params[0]===f.sh;let result;
    if(q.method==='server.version')result=['fixture','1.4'];
    else if(q.method==='server.features')result={genesis_hash:this.url.includes('wrong')?WalletNetwork.CONFIG.pep.genesis:WalletNetwork.CONFIG.bonc.genesis};
    else if(q.method==='blockchain.headers.subscribe')result={height:500};
    else if(q.method==='blockchain.scripthash.subscribe')result=owned?WalletTransactions.historyStatus([{tx_hash:f.txid,height:100}]):null;
    else if(q.method==='blockchain.scripthash.get_history')result=owned?[{tx_hash:f.txid,height:100}]:[];
    else if(q.method==='blockchain.scripthash.get_balance')result={confirmed:owned?1000000000:0,unconfirmed:0};
    else if(q.method==='blockchain.scripthash.listunspent')result=owned?[{tx_hash:f.txid,tx_pos:0,height:100,value:1000000000}]:[];
    else if(q.method==='blockchain.transaction.get')result=f.raw;
    else if(q.method==='blockchain.relayfee')result=.001;
    else if(q.method==='blockchain.estimatefee')result=-1;
    else if(q.method==='blockchain.transaction.broadcast'){__broadcasts.push(q.params[0]);result=WalletTransactions.parse(q.params[0]).txid;}
    else throw Error('Unexpected BONC fixture call');
    queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:q.id,result})}));
   }
  };
 },{vault,f});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://localhost:8787/#coins');await p.locator('#coin-search').waitFor();
 assert.equal(await p.locator('[data-select-coin=bonc]').count(),0);
 assert.equal(await p.evaluate(()=>__boncCalls.length),0);
 const settings=async()=>{await p.locator('[data-nav=security]').click();await p.locator('#legacy-assets > summary').click();};
 await settings();assert.equal(await p.locator('#enable-bonc').isChecked(),false);assert.equal(await p.locator('#endpoint-bonc').count(),0);
 await p.locator('#enable-bonc').check();await p.locator('#endpoint-bonc').waitFor();
 assert.equal(await p.locator('#endpoint-bonc').inputValue(),'');assert.match(await p.locator('#endpoint-current-bonc').innerText(),/required/);
 await p.locator('[data-nav=wallet]').click();await p.locator('#header-add-coins').click();
 assert.deepEqual(await p.locator('[data-select-coin]').evaluateAll(rows=>rows.map(r=>r.dataset.selectCoin)),['bel','btc','bch','bonc','dash','dgb','dingo','doge','ltc','pep','rvn','shic','trmp','wht']);
 await p.locator('[data-select-coin=bonc]').click();
 assert.equal(await p.locator('[data-overview-coin=bonc]').isDisabled(),true);
 await p.locator('[data-nav=receive]').click();assert.equal(await p.locator('[data-coin=bonc]').count(),0);
 await p.locator('[data-nav=send]').click();assert.equal(await p.locator('[data-send-coin=bonc]').count(),0);
 assert.equal(await p.evaluate(()=>__boncCalls.length),0,'Opt-in without endpoint must not connect');
 await p.locator('[data-nav=security]').click();await p.locator('#custom-connections > summary').click();
 const endpoint=p.locator('#endpoint-bonc'),test=p.locator('[data-test-connection=bonc]'),use=p.locator('[data-use-connection=bonc]'),status=p.locator('[data-connection-status=bonc]');
 assert.equal(await use.isDisabled(),true);
 await endpoint.fill('wss://wrong.fixture/');await test.click();await p.waitForFunction(()=>document.querySelector('[data-connection-status=bonc]').textContent.includes('genesis'));
 assert.equal(await use.isDisabled(),true);assert.ok(await p.evaluate(()=>__boncCalls.every(q=>q.method.startsWith('server.'))));
 await endpoint.fill('wss://bonc.fixture/');await test.click();await use.waitFor({state:'visible'});await p.waitForFunction(()=>!document.querySelector('[data-use-connection=bonc]').disabled);
 assert.match(await status.innerText(),/Connected/);assert.ok(await p.evaluate(()=>__boncCalls.every(q=>!q.method.includes('scripthash'))),'Testing must not disclose addresses');
 await endpoint.fill('wss://changed.fixture/');assert.equal(await use.isDisabled(),true);
 await endpoint.fill('wss://bonc.fixture/');await test.click();await p.waitForFunction(()=>!document.querySelector('[data-use-connection=bonc]').disabled);await use.click();
 await p.locator('[data-nav=wallet]').click();await p.waitForFunction(()=>document.querySelector('[data-overview-coin=bonc] .holding-balance')?.textContent==='10 BONC');
 await p.locator('[data-overview-coin=bonc]').click();await p.locator('#address').waitFor();assert.equal(await p.locator('#address').innerText(),E.accounts(ethers,recipe,1).bonc.address,'Used address advances to the first unused address');
 assert.equal(await p.locator('#komodo-open').count(),0);
 await p.locator('[data-nav=send]').click();await p.locator('[data-send-coin=bonc]').click();await p.locator('#send-max:not([disabled])').waitFor();
 await p.locator('#send-address').fill(E.accounts(ethers,recipe,1).bonc.address);await p.locator('#send-max').click();
 assert.equal(await p.locator('#send-amount').inputValue(),'10');assert.equal(await p.locator('#automatic-fee').innerText(),'0.00227 BONC');assert.equal(await p.locator('#one-coin-fee').count(),0);
 await p.locator('#review-send').click();await p.locator('#broadcast-send').waitFor();assert.match(await p.locator('.send-review').innerText(),/9.99773 BONC/);
 // Another tab disabling the feature must cancel this still-open review too.
 await p.evaluate(()=>{const key='corevault.legacy-bonc.v1';localStorage.setItem(key,'false');window.dispatchEvent(new StorageEvent('storage',{key,newValue:'false'}));});
 assert.equal(await p.locator('#broadcast-send').count(),0);
 assert.equal(await p.evaluate(()=>{try{WalletNetwork.client('bonc');return false;}catch(_){return true;}}),true);
 await p.locator('[data-nav=send]').click();assert.equal(await p.locator('[data-send-coin=bonc], #broadcast-send').count(),0);assert.equal(await p.evaluate(()=>__broadcasts.length),0);
 await settings();await p.locator('#enable-bonc').check();assert.equal(await p.locator('#endpoint-bonc').inputValue(),'wss://bonc.fixture/');
 await p.locator('[data-nav=send]').click();await p.locator('[data-send-coin=bonc]').click();await p.locator('#send-max:not([disabled])').waitFor();
 await p.locator('#send-address').fill(E.accounts(ethers,recipe,1).bonc.address);await p.locator('#send-max').click();await p.locator('#review-send').click();await p.locator('#send-ack').check();await require('./accept_missing_price.cjs')(p);await p.locator('#broadcast-send').click();
 await p.waitForFunction(()=>__broadcasts.length===1);const sent=T.parse(await p.evaluate(()=>__broadcasts[0]));assert.equal(sent.inputs[0].txid,f.txid);assert.equal(sent.outputs[0].value,999773000n);
 await p.reload();await p.locator('[data-nav=security]').click();assert.equal(await p.locator('#enable-bonc').isChecked(),true);
 await p.locator('#legacy-assets > summary').click();await p.locator('#enable-bonc').uncheck();await p.reload();await p.locator('[data-nav=wallet]').click();await p.locator('#header-add-coins').click();assert.equal(await p.locator('[data-select-coin=bonc]').count(),0);
 assert.equal(await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')),JSON.stringify(vault),'Opt-in never rewrites a wallet');
 assert.deepEqual(errors,[]);console.log('PASS: hidden BONC opt-in, endpoint-required UI, wrong-chain/test-before-use gates, no default queries, automatic-fee simulated send, disable cancels review, persisted endpoint and unchanged wallet.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
