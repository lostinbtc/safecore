// Public transport fixtures only: no wallet keys and no real network requests.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const T=require('../www/transactions.js');
const accounts=Array.from({length:200},(_,index)=>({index,address:'fixture-'+index}));
const funding='ab'.repeat(32),sent='cd'.repeat(32),calls=[];
let spent=false,inconsistent=false;
const row=i=>({value:i===55?900000000:i===2?(spent?0:500000000):i===0?(spent?400000000:100000000):0,
 history:[0,2,55].includes(i)?[{tx_hash:funding,height:490},...(spent&&i!==55?[{tx_hash:sent,height:500}]:[])]:[]});
class Socket{
 static OPEN=1;
 constructor(url){this.coin=url.includes('50004')?'pep':'wht';this.readyState=1;queueMicrotask(()=>this.onopen());}
 close(){this.readyState=3;}
 send(raw){const q=JSON.parse(raw);calls.push(q);const i=Number(q.params[0]?.replace('fixture-','')),r=row(i);let result;
  if(q.method==='server.version')result=['fixture','1.4'];
  else if(q.method==='server.features')result={genesis_hash:this.coin==='pep'?'37981c0c48b8d48965376c8a42ece9a0838daadb93ff975cb091f57f8c2a5faa':'863714e1c1a15526a0081a35097c56e28dbd43ef97f76fec0ccd5a7510326292'};
  else if(q.method==='blockchain.headers.subscribe')result={height:500};
  else if(q.method==='blockchain.scripthash.subscribe')result=T.historyStatus(r.history);
  else if(q.method.endsWith('get_balance'))result={confirmed:r.value+(inconsistent?1:0),unconfirmed:0};
  else if(q.method.endsWith('get_history'))result=r.history;
  else if(q.method.endsWith('listunspent'))result=r.value?[{tx_hash:spent&&i!==55?sent:funding,tx_pos:0,height:500,value:r.value}]:[];
  else if(q.method==='blockchain.relayfee')result=.01;
  else throw Error('Unexpected request: '+q.method);
  queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:q.id,result})}));
 }
}
const ctx={WebSocket:Socket,WalletTransactions:{policy:require('../www/transactions.js').policy,scriptHash:(_,a)=>a,historyStatus:T.historyStatus},setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);const N=ctx.WalletNetwork;
(async()=>{try{for(const coin of ['pep','wht']){
 spent=false;let prior=await N.scan(coin,accounts,null,{full:true});assert.equal(prior.confirmed,1500000000n);
 const disk=N.decode(N.encode(prior),coin,accounts);
 await assert.rejects(()=>N.scan(coin,accounts,disk,{indices:[2,0]}),/live discovery/);
 await assert.rejects(()=>N.scan(coin,accounts,prior,{indices:[200]}),/indices/);
 await assert.rejects(()=>N.scan(coin,accounts,prior,{indices:[]}),/indices/);
 await assert.rejects(()=>N.scan(coin,accounts,prior,{indices:[0],full:true}),/indices/);
 // Broadcast invalidation retains live row identities, unlike a disk cache.
 prior.cached=true;spent=true;calls.length=0;
 const next=await N.scan(coin,accounts,prior,{indices:[2,0,2]});
 assert.deepEqual(calls.filter(q=>q.method.endsWith('get_balance')).map(q=>q.params[0]).sort(),['fixture-0','fixture-2']);
 assert.equal(next.confirmed,1300000000n);assert.equal(next.rows[55],prior.rows[55]);assert.equal(prior.confirmed,1500000000n);
 calls.length=0;const again=await N.scan(coin,accounts,next,{indices:[2,0]});
 assert.equal(calls.filter(q=>q.method.endsWith('get_balance')).length,2,'A matching read must query fresh balances');
 assert.equal(again.confirmed,1300000000n);inconsistent=true;
 await assert.rejects(()=>N.scan(coin,accounts,again,{indices:[2,0]}),/do not agree/);inconsistent=false;
 assert.equal(again.confirmed,1300000000n);
}console.log('PASS: PEP/WHT focused input/change refreshes, unrelated balance retention, fresh matching reads, cache/bounds guards and inconsistent-snapshot rejection.');}finally{N.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
