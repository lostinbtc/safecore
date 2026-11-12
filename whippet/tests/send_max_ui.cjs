// Public seed, synthetic funding and no RPC transport; never broadcasts.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
 try{
  const c=await b.newContext({viewport:{width:390,height:844}});
  const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),accounts=E.accounts(ethers,recipe),fixtures={};
  for(const coin of ['pep','wht','shic']){
   const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:'',sequence:0xffffffff}],outputs:[{value:T.amount('950'),script:T.script(coin,accounts[coin].address)}],locktime:0})).slice(2);
   fixtures[coin]={raw,txid:T.parse(raw).txid};
  }
  await c.addInitScript(({vault,fixtures})=>{
   localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(vault));
   window.fetch=async()=>new Response(JSON.stringify({error:[],result:{}}));
   window.WebSocket=class{constructor(){throw Error('Live network forbidden');}};
   Object.defineProperty(window,'WalletNetwork',{configurable:true,set(N){
    Object.defineProperty(window,'WalletNetwork',{value:N,configurable:true});
    N.scan=async(coin,pool)=>({coin,tip:500,at:Date.now(),everUsed:[0],confirmed:95000000000n,unconfirmed:0n,feeRate:1000000n,rows:pool.map((account,i)=>({account,confirmed:i?0n:95000000000n,unconfirmed:0n,history:i?[]:[{tx_hash:fixtures[coin].txid,height:499}],utxos:i?[]:[{...fixtures[coin],pos:0,height:499,value:95000000000n,address:account.address,index:0}]}))});
    N.spendable=async s=>s.rows.flatMap(r=>r.utxos);
    N.client=()=>{throw Error('RPC and broadcasts forbidden');};
   }});
  },{vault:E.unprotected(webcrypto,recipe),fixtures});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:8787/');
  for(const coin of ['pep','wht','shic']){
   await p.locator('[data-nav=send]').click();await p.locator('#send-coin').click();await p.locator(`[data-send-coin=${coin}]`).click();
   await p.locator('#send-address').fill(E.accounts(ethers,recipe,1)[coin].address);await p.locator('#send-max').click();
   assert.equal(await p.locator('#send-amount').inputValue(),'950');
   assert.match(await p.locator('#send-estimate').innerText(),new RegExp(`You are sending 949.99 ${coin.toUpperCase()}`));
   await p.locator('#review-send').click();await p.locator('#broadcast-send').waitFor();
   assert.match(await p.locator('.send-review').innerText(),/949\.99/);assert.match(await p.locator('.send-review').innerText(),/0\.01/);
   await p.evaluate(coin=>{
    const key='corevault.connections.v1',newValue=JSON.stringify({[coin]:'wss://selected.example/'});
    localStorage.setItem(key,newValue);window.dispatchEvent(new StorageEvent('storage',{key,newValue}));
   },coin);
   assert.equal(await p.locator('#broadcast-send').count(),0,'Connection changes discard the old send review');
   assert.equal(await p.evaluate(coin=>WalletNetwork.endpoint(coin),coin),'wss://selected.example/');
   await p.locator('[data-nav=wallet]').click();
  }
  assert.deepEqual(errors,[]);console.log('PASS: PEP/WHT/SHIC Max, recipient/fee conservation, endpoint-change review invalidation and no broadcasts.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
