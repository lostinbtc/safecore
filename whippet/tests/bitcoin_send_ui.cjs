// Public fixtures and mocked transport only. This test must never broadcast live.
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const password='Public-test-password-123';
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
  try{
    for(const coin of ['btc','ltc']){
    const account=E.accounts(ethers,recipe,0)[coin];
    const destination=E.accounts(ethers,E.recipe(ethers,'legal winner thank year wave sausage worth useful legal winner thank yellow'),0)[coin].address;
    const funding={version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:'',sequence:0xffffffff}],outputs:[{value:500000000n,script:T.script(coin,account.address)}],locktime:0};
    const raw=ethers.utils.hexlify(T.serialize(funding)).slice(2),txid=T.parse(raw).txid;
    for(const scenario of ['open','protected','timeout','changed-input','reserved-input','high-fee','blocked-fee','no-price','stale-before-broadcast','price-rise','price-rise-block']){
      const protectedMode=scenario==='protected';
      const vault=protectedMode?await E.encrypt(webcrypto,recipe,password):E.unprotected(webcrypto,recipe);
      const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await context.addInitScript(({vault,raw,txid,scenario,coin})=>{
        window.fetch=async url=>new Response(JSON.stringify(url.includes('coingecko')?
          (scenario==='no-price'?{}:{[coin==='btc'?'bitcoin':'litecoin']:{usd:scenario==='blocked-fee'?500000:scenario==='high-fee'?200000:100000,last_updated_at:Math.floor(Date.now()/1000)}}):
          {error:[],result:{PEPUSD:{c:['0.0001']},USDTZUSD:{c:['0.5']}}}),{status:200});
        localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
        window.WebSocket=class{constructor(){throw Error('Unexpected real network access in mocked send test.');}};
        Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){
        Object.defineProperty(window,'WalletNetwork',{value:N,writable:true,configurable:true});
        const T=WalletTransactions;
        window.__broadcasts=[];window.__checks=0;
        N.scan=async(coin,accounts)=>({coin,tip:500,at:Date.now(),everUsed:[0],confirmed:500000000n,unconfirmed:0n,feeRate:['high-fee','blocked-fee'].includes(scenario)?100000n:1000n,rows:accounts.map((account,index)=>({account,confirmed:index?0n:500000000n,unconfirmed:0n,history:index?[]:[{tx_hash:txid,height:499}],utxos:index?[]:[{txid,pos:0,height:499,value:500000000n,address:account.address,index:0}]}))});
        N.spendable=async snapshot=>snapshot.rows.flatMap(r=>r.utxos.map(u=>({...u,raw})));
        N.checkInputs=async()=>{window.__checks++;if(scenario==='changed-input')throw Error('An input changed or was spent. Build a fresh review.');if(scenario==='stale-before-broadcast'){
          // Price ages out during the final input recheck, without expiring review.
          const original=WalletReporting.feeUsd;WalletReporting.feeUsd=(coin,fee,q)=>original(coin,fee,q?{...q,at:Date.now()-300000}:q);
        }else if(scenario.startsWith('price-rise')&&window.__checks===1){
          const original=WalletReporting.feeUsd;WalletReporting.feeUsd=(coin,fee,q)=>original(coin,fee,q?{...q,value:scenario==='price-rise'?3000000:50000000}:q);
        }};
        N.client=()=>({call:async(method,params)=>{if(method==='blockchain.relayfee')return .00001;if(method!=='blockchain.transaction.broadcast')throw Error('Unexpected method');window.__broadcasts.push({method,params});if(scenario==='timeout')throw Error('Fixture timeout');return T.parse(params[0]).txid;}});
        }});
      },{vault,raw,txid,scenario,coin});
      await page.clock.install();
      await page.goto('http://localhost:8787/');
      if(protectedMode){await page.locator('#lock').click();await page.locator('#unlock-password').fill(password);await page.locator('#unlock-submit').click();await page.locator('.holdings').waitFor();}
      assert.equal(await page.locator('#live-ack').count(),0);
      await page.locator('[data-nav="receive"]').click();await page.locator('#receive-coin').click();await page.locator(`[data-coin="${coin}"]`).click();await page.locator('#address').waitFor();
      await page.clock.runFor(4001);
      await page.locator('[data-nav="wallet"]').click();
      await page.waitForFunction(coin=>document.querySelector(`[data-overview-coin=${coin}] .holding-balance`)?.textContent==='5 '+coin.toUpperCase(),coin);
      await page.locator('[data-nav="receive"]').click();
      await page.locator('#receive-coin').click();await page.locator(`[data-coin="${coin}"]`).click();
      assert.equal(await page.locator('#address-number').textContent(),'Address #2');
      assert.equal(await page.locator('#address').textContent(),E.accounts(ethers,recipe,1)[coin].address);
      await page.locator('#reuse-first').check();assert.equal(await page.locator('#address').textContent(),account.address);
      await page.locator('#reuse-first').uncheck();assert.equal(await page.locator('#address-number').textContent(),'Address #2');
      await page.locator('[data-nav="wallet"]').click();await page.locator('[data-nav=send]').click();
      await page.locator('#send-coin').click();await page.locator(`[data-send-coin="${coin}"]`).click();
      await page.locator('#send-address').fill(destination);
      if(scenario==='open'){
        await page.locator('#send-max').click();
        assert.equal(await page.locator('#send-amount').inputValue(),'5');
        assert.ok((await page.locator('#send-estimate').innerText()).includes('You are sending 4.99999773 '+coin.toUpperCase()));
        assert.ok((await page.locator('#send-estimate').innerText()).includes('Total deducted: 5 '+coin.toUpperCase()));
      }else await page.locator('#send-amount').fill('1');
      await page.locator('#review-send').click();
      await page.locator('#broadcast-send').waitFor();
      assert.equal(await page.evaluate(()=>window.__broadcasts.length),0);
      const notice=await page.locator('#fee-usd-notice').innerText();
      if(['blocked-fee','no-price'].includes(scenario)){
        assert.equal(await page.locator('#broadcast-send').isDisabled(),true);
        assert.match(notice,scenario==='blocked-fee'?/113\.50 USD.*blocked.*Try again later.*no override/:/fresh USD price.*blocked; try again later/);
        assert.equal(await page.evaluate(()=>window.__checks),0);
        assert.deepEqual(errors,[]);await context.close();continue;
      }
      assert.match(notice,scenario==='high-fee'?/45\.40 USD.*High fee/:/0\.23 USD/);
      await page.screenshot({path:`whippet/test-results/${coin}-send-review-${scenario}.png`,fullPage:true});
      await page.locator('#send-ack').check();
      if(scenario==='reserved-input'){
        // Another same-origin writer reserves the input after this tab reviewed it.
        await page.evaluate(async ({txid,coin})=>navigator.locks.request('corevault-wallet-storage',()=>{
          const vault=JSON.parse(localStorage.getItem('whippet.dev.encrypted.v1'));
          localStorage.setItem('corevault.send-attempts.'+WalletLibrary.id(vault),JSON.stringify([{txid:'cd'.repeat(32),coin,outpoints:[txid+':0'],at:Date.now(),status:'unknown'}]));
        }),{txid,coin});
      }
      if(protectedMode){
        await page.locator('#send-password').fill('Wrong-test-password-123');await page.locator('#broadcast-send').click();
        await page.locator('#error').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__broadcasts.length),0);
        await page.locator('#send-password').fill(password);
      }
      await page.locator('#broadcast-send').click();
      if(['timeout','changed-input','reserved-input','stale-before-broadcast','price-rise','price-rise-block'].includes(scenario)){
        await page.locator('#error').waitFor({state:'visible'});
        assert.equal(await page.evaluate(()=>window.__broadcasts.length),scenario==='timeout'?1:0);
        if(scenario==='timeout'){
          assert.match(await page.locator('#error').innerText(),/uncertain/);
          assert.equal(await page.locator('#broadcast-send').isDisabled(),true);
          await page.locator('[data-nav="wallet"]').click();await page.locator('[data-nav=send]').click();
          await page.locator('#send-coin').click();await page.locator(`[data-send-coin="${coin}"]`).click();
          await page.locator('#send-address').fill(destination);await page.locator('#send-amount').fill('1');await page.locator('#review-send').click();
          await page.locator('#error').waitFor({state:'visible'});
          assert.equal(await page.evaluate(()=>window.__broadcasts.length),1);
          await page.locator('[data-nav="activity"]').click();
          await page.locator(`[data-activity-coin=${coin}] summary`).click();
          await page.getByText('Submission uncertain — do not resend until checked.',{exact:true}).waitFor();
        }
        if(scenario==='reserved-input')assert.match(await page.locator('#error').innerText(),/already have a send attempt/);
        if(scenario==='stale-before-broadcast')assert.match(await page.locator('#error').innerText(),/fresh USD price/);
        if(scenario==='price-rise-block'){
          assert.match(await page.locator('#fee-usd-notice').innerText(),/113\.50 USD.*blocked/);
          assert.equal(await page.locator('#broadcast-send').isDisabled(),true);
        }
        if(scenario==='price-rise'){
          assert.match(await page.locator('#fee-usd-notice').innerText(),/6\.81 USD.*High fee/);
          assert.equal(await page.locator('#send-ack').isChecked(),false);
          await page.locator('#broadcast-send').click();assert.equal(await page.evaluate(()=>__broadcasts.length),0);
          await page.locator('#send-ack').check();await page.locator('#broadcast-send').click();
          await page.getByRole('heading',{name:'Transaction submitted'}).waitFor();
          assert.equal(await page.evaluate(()=>__broadcasts.length),1);
        }
      }else{
        await page.getByRole('heading',{name:'Transaction submitted'}).waitFor();
        const calls=await page.evaluate(()=>window.__broadcasts);
        assert.equal(calls.length,1);assert.match(calls[0].params[0],/^[0-9a-f]+$/);
        assert.equal(T.parse(calls[0].params[0]).outputs[0].value,scenario==='open'?499999773n:scenario==='high-fee'?99977300n:99999773n);
        assert.equal(await page.evaluate(()=>window.__checks),1);
        const saved=await page.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([key])=>key.startsWith('corevault.send-attempts.'))[1])[0]);
        assert.deepEqual(saved.refreshIndices,[0]);assert.equal(saved.balanceRefreshed,false);
      }
      assert.deepEqual(errors,[]);await context.close();
    }
    }
    console.log('PASS: BTC/LTC fee-inclusive sends, USD not USDT, high-fee warning, hard block/no override, missing/stale quote blocking, password/input gates and uncertain-result retry protection. Mocked broadcasts only.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
