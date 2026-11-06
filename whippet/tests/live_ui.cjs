// Public fixtures and mocked transport only. This test must never broadcast live.
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const password='Public-test-password-123';
const account=E.accounts(ethers,recipe,0).pep;
const destination=E.accounts(ethers,E.recipe(ethers,'legal winner thank year wave sausage worth useful legal winner thank yellow'),0).pep.address;
const funding={version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:'',sequence:0xffffffff}],outputs:[{value:500000000n,script:T.script('pep',account.address)}],locktime:0};
const raw=ethers.utils.hexlify(T.serialize(funding)).slice(2),txid=T.parse(raw).txid;
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
  try{
    for(const scenario of ['open','protected','timeout','changed-input','reserved-input']){
      const protectedMode=scenario==='protected';
      const vault=protectedMode?await E.encrypt(webcrypto,recipe,password):E.unprotected(webcrypto,recipe);
      const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await context.addInitScript(({vault,raw,txid,scenario})=>{
        window.fetch=async()=>new Response(JSON.stringify({error:[],result:{PEPUSD:{c:['0.0001']},USDTZUSD:{c:['1']}}}),{status:200});
        localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
        window.WebSocket=class{constructor(){throw Error('Unexpected real network access in mocked send test.');}};
        Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){
        Object.defineProperty(window,'WalletNetwork',{value:N,writable:true,configurable:true});
        const T=WalletTransactions;
        window.__broadcasts=[];window.__checks=0;
        N.scan=async(coin,accounts)=>({coin,tip:500,at:Date.now(),everUsed:[0],confirmed:500000000n,unconfirmed:0n,feeRate:1000000n,rows:accounts.map((account,index)=>({account,confirmed:index?0n:500000000n,unconfirmed:0n,history:index?[]:[{tx_hash:txid,height:499}],utxos:index?[]:[{txid,pos:0,height:499,value:500000000n,address:account.address,index:0}]}))});
        N.spendable=async snapshot=>snapshot.rows.flatMap(r=>r.utxos.map(u=>({...u,raw})));
        N.checkInputs=async()=>{window.__checks++;if(scenario==='changed-input')throw Error('An input changed or was spent. Build a fresh review.');};
        N.client=()=>({call:async(method,params)=>{if(method!=='blockchain.transaction.broadcast')throw Error('Unexpected method');window.__broadcasts.push({method,params});if(scenario==='timeout')throw Error('Fixture timeout');return T.parse(params[0]).txid;}});
        }});
      },{vault,raw,txid,scenario});
      await page.clock.install();
      await page.goto('http://localhost:8787/');
      if(protectedMode){await page.locator('#lock').click();await page.locator('#unlock-password').fill(password);await page.locator('#unlock-submit').click();await page.locator('.holdings').waitFor();}
      assert.equal(await page.locator('#live-ack').count(),0);
      await page.locator('[data-nav="receive"]').click();await page.locator('#receive-coin').click();await page.locator('[data-coin="pep"]').click();await page.locator('#address').waitFor();
      await page.clock.runFor(4001);
      await page.locator('[data-nav="wallet"]').click();
      await page.waitForFunction(()=>document.querySelector('[data-overview-coin=pep] .holding-balance')?.textContent==='5 PEP');
      await page.locator('[data-nav="receive"]').click();
      await page.locator('#receive-coin').click();await page.locator('[data-coin="pep"]').click();
      assert.equal(await page.locator('#address-number').textContent(),'Address #2');
      assert.equal(await page.locator('#address').textContent(),E.accounts(ethers,recipe,1).pep.address);
      await page.locator('#reuse-first').check();assert.equal(await page.locator('#address').textContent(),account.address);
      await page.locator('#reuse-first').uncheck();assert.equal(await page.locator('#address-number').textContent(),'Address #2');
      await page.locator('[data-nav="wallet"]').click();await page.locator('[data-nav=send]').click();
      await page.locator('#send-coin').click();await page.locator('[data-send-coin="pep"]').click();
      await page.locator('#send-address').fill(destination);
      if(scenario==='open'){
        await page.locator('#send-max').click();
        assert.equal(await page.locator('#send-amount').inputValue(),'5');
        assert.match(await page.locator('#send-estimate').innerText(),/You are sending 4.99 PEP/);
        assert.match(await page.locator('#send-estimate').innerText(),/Total deducted: 5 PEP/);
      }else await page.locator('#send-amount').fill('1');
      await page.locator('#review-send').click();
      await page.locator('#broadcast-send').waitFor();
      assert.equal(await page.evaluate(()=>window.__broadcasts.length),0);
      await page.screenshot({path:`whippet/test-results/send-review-${scenario}.png`,fullPage:true});
      await page.locator('#send-ack').check();
      if(scenario==='reserved-input'){
        // Another same-origin writer reserves the input after this tab reviewed it.
        await page.evaluate(async txid=>navigator.locks.request('corevault-wallet-storage',()=>{
          const vault=JSON.parse(localStorage.getItem('whippet.dev.encrypted.v1'));
          localStorage.setItem('corevault.send-attempts.'+WalletLibrary.id(vault),JSON.stringify([{txid:'cd'.repeat(32),coin:'pep',outpoints:[txid+':0'],at:Date.now(),status:'unknown'}]));
        }),txid);
      }
      if(protectedMode){
        await page.locator('#send-password').fill('Wrong-test-password-123');await page.locator('#broadcast-send').click();
        await page.locator('#error').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__broadcasts.length),0);
        await page.locator('#send-password').fill(password);
      }
      await page.locator('#broadcast-send').click();
      if(['timeout','changed-input','reserved-input'].includes(scenario)){
        await page.locator('#error').waitFor({state:'visible'});
        assert.equal(await page.evaluate(()=>window.__broadcasts.length),scenario==='timeout'?1:0);
        if(scenario==='timeout'){
          assert.match(await page.locator('#error').innerText(),/uncertain/);
          assert.equal(await page.locator('#broadcast-send').isDisabled(),true);
          await page.locator('[data-nav="wallet"]').click();await page.locator('[data-nav=send]').click();
          await page.locator('#send-coin').click();await page.locator('[data-send-coin="pep"]').click();
          await page.locator('#send-address').fill(destination);await page.locator('#send-amount').fill('1');await page.locator('#review-send').click();
          await page.locator('#error').waitFor({state:'visible'});
          assert.equal(await page.evaluate(()=>window.__broadcasts.length),1);
          await page.locator('[data-nav="activity"]').click();
          await page.locator('[data-activity-coin=pep] summary').click();
          await page.getByText('Submission uncertain — do not resend until checked.',{exact:true}).waitFor();
        }
        if(scenario==='reserved-input')assert.match(await page.locator('#error').innerText(),/already have a send attempt/);
      }else{
        await page.getByRole('heading',{name:'Transaction submitted'}).waitFor();
        const calls=await page.evaluate(()=>window.__broadcasts);
        assert.equal(calls.length,1);assert.match(calls[0].params[0],/^[0-9a-f]+$/);
        assert.equal(T.parse(calls[0].params[0]).outputs[0].value,scenario==='open'?499000000n:99000000n);
        assert.equal(await page.evaluate(()=>window.__checks),1);
        const saved=await page.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([key])=>key.startsWith('corevault.send-attempts.'))[1])[0]);
        assert.deepEqual(saved.refreshIndices,[0]);assert.equal(saved.balanceRefreshed,false);
      }
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('PASS: automatic live totals, receive rotation/pin, fee-inclusive review before signing, password gate, input recheck, single explicit broadcast and uncertain-result retry blocking. No real network broadcasts.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
