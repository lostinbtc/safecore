// Synthetic public fixture only: no sockets leave this VM and no broadcasts.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const T=require('../www/transactions.js'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),account=E.accounts(ethers,recipe).btc;
const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:1000000n,script:T.script('btc',account.address)}],locktime:0})).slice(2),txid=T.parse(raw).txid;
let estimate=.00002;const calls=[],history=[{tx_hash:txid,height:499}];
class Socket{
 static OPEN=1;
 constructor(){this.readyState=1;queueMicrotask(()=>this.onopen());}
 close(){this.readyState=3;}
 send(rawRequest){
  const q=JSON.parse(rawRequest);calls.push(q);let result,error;
  switch(q.method){
   case 'server.version':result=['fixture','1.4'];break;
   case 'server.features':result={genesis_hash:N.CONFIG.btc.genesis};break;
   case 'blockchain.headers.subscribe':result={height:500};break;
   case 'blockchain.scripthash.subscribe':result=T.historyStatus(history);break;
   case 'blockchain.scripthash.get_history':result=history;break;
   case 'blockchain.scripthash.get_balance':result={confirmed:1000000,unconfirmed:0};break;
   case 'blockchain.scripthash.listunspent':result=[{tx_hash:txid,tx_pos:0,height:499,value:1000000}];break;
   case 'blockchain.transaction.get':result=raw;break;
   case 'blockchain.relayfee':result=.000001;break;
   case 'blockchain.estimatefee':assert.deepEqual(q.params,[6]);if(estimate==='error')error={message:'Unavailable'};else result=estimate;break;
   default:throw Error('Unexpected method: '+q.method);
  }
  queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:q.id,result,error})}));
 }
}
const ctx={WebSocket:Socket,WalletTransactions:T,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);const N=ctx.WalletNetwork;
(async()=>{try{
 let snapshot=await N.scan('btc',[account]);assert.equal((await N.spendable(snapshot)).length,1);
 // Conversion rounds upward; floating-point protocol values must never underpay.
 assert.ok(snapshot.feeRate>=2000n&&snapshot.feeRate<=2001n);
 for(const invalid of [-1,0,null,'0.00002',.00101,'error']){
  estimate=invalid;const s=await N.scan('btc',[account]);
  assert.equal(s.confirmed,1000000n);assert.equal(s.feeRate,null);
  await assert.rejects(()=>N.spendable(s),/fee estimate unavailable/);
  await assert.rejects(()=>N.sweepSource('btc',account.address),/fee estimate unavailable/);
 }
 estimate=.000001;const low=await N.scan('btc',[account]);assert.equal(low.feeRate,1000n);
 const cached=N.decode(N.encode(low),'btc',[account]);await assert.rejects(()=>N.spendable(cached),/Connection changed/);
 assert.ok(calls.every(q=>q.method!=='blockchain.transaction.broadcast'));
 console.log('PASS: BTC estimate/floor/cap, missing estimates preserve balances but block spending/sweeps, cache cannot authorize spending.');
}finally{N.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
