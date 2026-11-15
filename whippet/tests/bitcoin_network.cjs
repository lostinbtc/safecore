// Synthetic public fixture only: no sockets leave this VM and no broadcasts.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const T=require('../www/transactions.js'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
let coin,raw,txid,history,estimate;const calls=[];
class Socket{
 static OPEN=1;
 constructor(){this.readyState=1;queueMicrotask(()=>this.onopen());}
 close(){this.readyState=3;}
 send(rawRequest){
  const q=JSON.parse(rawRequest);calls.push(q);let result,error;
  switch(q.method){
   case 'server.version':result=['fixture','1.4'];break;
   case 'server.features':result={genesis_hash:N.CONFIG[coin].genesis};break;
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
 for(coin of ['btc','ltc']){
 const account=E.accounts(ethers,recipe)[coin];estimate=.00002;
 raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:1000000n,script:T.script(coin,account.address)}],locktime:0})).slice(2);
 txid=T.parse(raw).txid;history=[{tx_hash:txid,height:499}];
 let snapshot=await N.scan(coin,[account]);assert.equal((await N.spendable(snapshot)).length,1);
 // Decimal-text conversion must be exact, including the old ceil(2000.000…)
 // rounding edge. Rates finer than one base unit per kB fail closed.
 assert.equal(snapshot.feeRate,2000n);
 for(const invalid of [-1,0,null,'0.00002',.000020001,.00101,.01,NaN,Infinity,'error']){
  estimate=invalid;const s=await N.scan(coin,[account]);
  assert.equal(s.confirmed,1000000n);assert.equal(s.feeRate,null);
  await assert.rejects(()=>N.spendable(s),/fee estimate unavailable/);
  await assert.rejects(()=>N.sweepSource(coin,account.address),/fee estimate unavailable/);
 }
 estimate=.000001;const low=await N.scan(coin,[account]);assert.equal(low.feeRate,1000n);
 const cached=N.decode(N.encode(low),coin,[account]);await assert.rejects(()=>N.spendable(cached),/Connection changed/);
 N.close();
 }
 assert.ok(calls.every(q=>q.method!=='blockchain.transaction.broadcast'));
 console.log('PASS: BTC/LTC estimate/floor/cap, missing estimates preserve balances but block spending/sweeps, cache cannot authorize spending.');
}finally{N.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
