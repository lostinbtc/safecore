const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),T=require('../www/transactions.js'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
(async()=>{for(const coin of ['pep','wht']){
 const address=E.accounts(ethers,recipe)[coin].address;let mode='confirmed',inflight=0,peak=0;const calls=[],fixtures={};
 for(const kind of ['confirmed','pending','net-zero-pending','immature','bad-raw','many','unique','long-history','oversized']){
  const count=kind==='many'?121:kind==='unique'?41:kind==='oversized'?671:1,raws=new Map(),utxos=[],history=[];
  const height=kind==='pending'?0:499;
  for(let i=0;i<(kind==='unique'?count:1);i++){
   const tx={version:1,inputs:[{txid:kind==='immature'?'0'.repeat(64):'ab'.repeat(32),pos:kind==='immature'?0xffffffff:i,script:'0101',sequence:0xffffffff}],outputs:Array.from({length:kind==='unique'?1:count},()=>({value:500000000n,script:T.script(coin,address)})),locktime:0};
   const raw=ethers.utils.hexlify(T.serialize(tx)).slice(2),txid=T.parse(raw).txid;raws.set(txid,raw);history.push({tx_hash:txid,height});
   tx.outputs.forEach((_,pos)=>utxos.push({tx_hash:txid,tx_pos:pos,height,value:500000000}));
  }
  if(kind==='long-history')for(let i=0;i<1001;i++)history.push({tx_hash:i.toString(16).padStart(64,'0'),height:1});
  if(kind==='net-zero-pending')history.push({tx_hash:'ff'.repeat(32),height:0});
  fixtures[kind]={raws,utxos,history,balance:{confirmed:height?count*500000000:0,unconfirmed:height?0:count*500000000}};
 }
 class Socket{static OPEN=1;constructor(){this.readyState=1;queueMicrotask(()=>this.onopen());}close(){this.readyState=3;}send(raw){const q=JSON.parse(raw);calls.push(q);const f=fixtures[mode];let result;
  if(q.method==='server.version')result=['fixture','1.4'];else if(q.method==='server.features')result={genesis_hash:N.CONFIG[coin].genesis};else if(q.method==='blockchain.headers.subscribe')result={height:500};
  else if(q.method.endsWith('scripthash.subscribe'))result=T.historyStatus(f.history);else if(q.method.endsWith('get_history'))result=f.history;
  else if(q.method.endsWith('get_balance'))result=f.balance;
  else if(q.method.endsWith('listunspent'))result=f.utxos;
  else if(q.method==='blockchain.transaction.get')result=mode==='bad-raw'?'00':f.raws.get(q.params[0]);
  else if(q.method==='blockchain.transaction.broadcast')throw Error('No broadcasts allowed');else result=.01;
  if(q.method==='blockchain.transaction.get'){inflight++;peak=Math.max(peak,inflight);setTimeout(()=>{inflight--;this.onmessage({data:JSON.stringify({id:q.id,result})});},0);}
  else queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:q.id,result})}));
 }}
 const ctx={WebSocket:Socket,WalletTransactions:T,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);const N=ctx.WalletNetwork;
 try{const s=await N.sweepSource(coin,address);assert.equal(s.utxos.length,1);assert.equal(s.utxos[0].value,500000000n);
 const confirmedId=fixtures.confirmed.history[0].tx_hash;
 assert.equal((await N.confirmation(coin,confirmedId,address)).confirmations,2);
 assert.equal((await N.confirmation(coin,'99'.repeat(32),address)).seen,false);
 mode='pending';assert.equal((await N.confirmation(coin,confirmedId,address)).confirmations,0);
 mode='confirmed';fixtures.confirmed.history[0].height=501;
 await assert.rejects(()=>N.confirmation(coin,confirmedId,address),/Inconsistent/);
 fixtures.confirmed.history[0].height=499;fixtures.confirmed.history.push({...fixtures.confirmed.history[0]});
 await assert.rejects(()=>N.confirmation(coin,confirmedId,address),/Inconsistent/);
 fixtures.confirmed.history.pop();
 await assert.rejects(()=>N.confirmation(coin,'bad-id',address),/Invalid/);
 for(const [kind,count] of [['many',121],['unique',41],['long-history',1]]){
  mode=kind;calls.length=0;peak=0;const data=await N.sweepSource(coin,address);
  assert.equal(data.utxos.length,count);assert.equal(data.utxos.reduce((n,u)=>n+u.value,0n),BigInt(count)*500000000n);
  assert.equal(calls.filter(q=>q.method==='blockchain.transaction.get').length,kind==='unique'?41:1);
  assert.ok(peak<=10);if(kind==='unique')assert.equal(peak,10);
 }
 mode='oversized';calls.length=0;await assert.rejects(()=>N.sweepSource(coin,address),/multi-transaction sweep/);
 assert.equal(calls.filter(q=>q.method==='blockchain.transaction.get').length,0);
 mode='pending';await assert.rejects(()=>N.sweepSource(coin,address),/confirm/);
 mode='net-zero-pending';await assert.rejects(()=>N.sweepSource(coin,address),/confirm/);
 mode='immature';await assert.rejects(()=>N.sweepSource(coin,address),/mature/);
 mode='bad-raw';await assert.rejects(()=>N.sweepSource(coin,address));
 assert.ok(calls.every(q=>q.method!=='blockchain.transaction.broadcast'));assert.ok(calls.filter(q=>q.method.startsWith('blockchain.scripthash')).every(q=>q.params[0]===T.scriptHash(coin,address)));
 }finally{N.close();}
}console.log('PASS: full 121-output sources and long history, bounded/deduplicated raw fetches, protocol size rejection before raw fetch, confirmed/mature guards, public queries only and no broadcasts.');})().catch(e=>{console.error(e);process.exitCode=1;});
