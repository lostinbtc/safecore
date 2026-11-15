const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const accounts=[E.accounts(ethers,recipe).bel],owner=accounts[0],sh=T.scriptHash('bel',owner.address),forward=sh.match(/../g).reverse().join('');
const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:9007199254740993n,script:T.script('bel',owner.address)}],locktime:0})).slice(2),txid=T.parse(raw).txid;
const genesis='e5be24df57c43a82d15c2f06bda961296948f8f8eb48501bed1efb929afe0698';
function fixture(mode='ok'){
 let state=mode,broadcasts=0;const calls=[];
 const ctx={WalletTransactions:T,URL,AbortController,TextDecoder,Response,setTimeout,clearTimeout,
  fetch:async(url,options)=>{
   calls.push({url,options});assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
   const p=new URL(url).pathname;let value;
   if(p==='/block-height/0')value=state==='wrong-chain'?'0'.repeat(64):genesis;
   else if(p==='/blocks/tip/height')value='500';
   else if(p==='/fee-estimates')value=state==='fee-failure'?null:state==='high-fee'?{'6':1001}:state==='estimate'?{'2':50,'6':20,'12':10}:{};
   else if(p==='/scripthash/'+forward)value={chain_stats:{funded_txo_sum:'9007199254740993',spent_txo_sum:0},mempool_stats:{funded_txo_sum:0,spent_txo_sum:0}};
   else if(p==='/scripthash/'+forward+'/txs')value=[{txid,status:{confirmed:true,block_height:100}}];
   else if(p==='/scripthash/'+forward+'/utxo'){
    value=state==='spent'?[]:[{txid,vout:0,confirmed:true,value:'9007199254740993'}];
    if(state==='duplicate')value.push({...value[0]});
    if(state==='bad-amount')value[0].value='9007199254740993.1';
   }
   else if(p==='/tx/'+txid+'/status')value={confirmed:true,block_height:state==='bad-height'?0:100};
   else if(p==='/tx/'+txid+'/hex')value=state==='bad-raw'?raw.slice(0,-2)+'01':raw;
   else if(p==='/tx'){
    broadcasts++;if(state==='broadcast-failure')throw new TypeError('lost response');value=state==='wrong-broadcast'?'b'.repeat(64):txid;
   }else throw Error('Unexpected API path '+p);
   if(value===null)return new Response('{}',{status:503});
   return new Response(typeof value==='string'?value:JSON.stringify(value).replaceAll('"9007199254740993"','9007199254740993'));
  }};
 vm.createContext(ctx);for(const f of ['esplora','network'])vm.runInContext(fs.readFileSync('whippet/www/'+f+'.js','utf8'),ctx);
 return {N:ctx.WalletNetwork,ctx,calls,set:value=>{state=value;},broadcasts:()=>broadcasts};
}
(async()=>{
 const f=fixture();try{
  const s=await f.N.scan('bel',accounts,null,{full:true});assert.equal(s.confirmed,9007199254740993n);assert.equal(s.feeRate,10000n);
  assert.equal(f.N.client('bel').active.feeSource,'core-minimum');
  const outputs=await f.N.spendable(s);assert.equal(outputs.length,1);assert.equal(outputs[0].value,9007199254740993n);
  await f.N.checkInputs('bel',outputs);f.set('spent');await assert.rejects(()=>f.N.checkInputs('bel',outputs),/spent/);
  f.set('estimate');const updated=await f.N.scan('bel',accounts,null,{full:true});assert.equal(updated.feeRate,20000n);
  f.set('bad-raw');await assert.rejects(()=>f.N.spendable(updated),/does not match/);
  assert.ok(f.calls.every(c=>!c.url.includes('abandon')&&!c.options.body));
 }finally{f.N.close();}
 for(const mode of ['wrong-chain','duplicate','bad-height','bad-amount']){
  const f=fixture(mode);try{await assert.rejects(()=>f.N.scan('bel',accounts,null,{full:true}));if(mode==='wrong-chain')assert.equal(f.calls.length,1);}finally{f.N.close();}
 }
 for(const mode of ['fee-failure','high-fee']){
  const f=fixture(mode);try{if(mode==='fee-failure')await assert.rejects(()=>f.N.scan('bel',accounts,null,{full:true}));else{const s=await f.N.scan('bel',accounts,null,{full:true});assert.equal(s.feeRate,null);await assert.rejects(()=>f.N.spendable(s),/fee estimate unavailable/);}}finally{f.N.close();}
 }
 for(const mode of ['ok','broadcast-failure','wrong-broadcast']){
  const f=fixture(mode);try{
   const call=()=>f.N.client('bel').call('blockchain.transaction.broadcast',[raw]);
   if(mode==='ok')assert.equal(await call(),txid);else await assert.rejects(call);
   assert.equal(f.broadcasts(),1,'No automatic broadcast retry');
  }finally{f.N.close();}
 }
 // Page all history; do not silently truncate or repeat a cursor.
 const paged=fixture(),c=paged.N.client('bel').active;let pages=0;
 c.http=async path=>{pages++;return path.endsWith('/txs')?Array.from({length:25},(_,i)=>({txid:(i+1).toString(16).padStart(64,'0'),status:{confirmed:true,block_height:100-i}})):[{txid:'f'.repeat(64),status:{confirmed:false}}];};
 await assert.rejects(()=>c.history(forward),/Unconfirmed/);assert.equal(pages,2);
 c.http=async path=>path.endsWith('/txs')?Array.from({length:25},(_,i)=>({txid:(i+1).toString(16).padStart(64,'0'),status:{confirmed:true,block_height:100-i}})):[{txid:'f'.repeat(64),status:{confirmed:true,block_height:75}}];
 assert.equal((await c.history(forward)).length,26);paged.N.close();
 // Cancel in-flight and queued requests; bound bodies before JSON parsing.
 const stopped=fixture(),cancelled=stopped.N.client('bel').active;
 stopped.ctx.fetch=async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('fixture abort')),{once:true}));
 const pending=Array.from({length:8},()=>cancelled.http('/blocks/tip/height'));
 assert.equal(cancelled.running,4);assert.equal(cancelled.queue.length,4);cancelled.close();
 assert.ok((await Promise.allSettled(pending)).every(r=>r.status==='rejected'));assert.equal(cancelled.running,0);stopped.N.close();
 const huge=fixture();huge.ctx.fetch=async()=>new Response('a'.repeat(2000001));
 await assert.rejects(()=>huge.N.client('bel').active.http('/blocks/tip/height'),/too large/);huge.N.close();
 console.log('PASS: BELLS HTTPS genesis, hash endianness, exact large integers, flattened UTXO heights, raw tx verification, pagination, fee failure gates and one-shot broadcasts (mock only).');
})().catch(e=>{console.error(e);process.exitCode=1;});
