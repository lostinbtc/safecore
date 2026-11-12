// Deterministic Electrum transport fixtures. No network or private wallet data.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
// Electrum-style status: null for no history, else a fingerprint of the history.
const statusFor=index=>{const hs=histories.get(index)||[];return hs.length?crypto.createHash('sha256').update(hs.map(h=>h.tx_hash+':'+h.height+':').join('')).digest('hex'):null;};
const accounts=Array.from({length:20},(_,index)=>({index,address:'fixture-'+index}));
const histories=new Map(),balances=new Map(),calls=[];
const genesis='863714e1c1a15526a0081a35097c56e28dbd43ef97f76fec0ccd5a7510326292';
let fail=false;
class Socket{
  static OPEN=1;
  constructor(){this.readyState=1;queueMicrotask(()=>this.onopen());}
  close(){this.readyState=3;}
  send(raw){const m=JSON.parse(raw);calls.push(m);
    const index=Number(String(m.params[0]).replace('fixture-',''));
    const b=balances.get(index),h=histories.get(index)?.[0];
    const utxos=b&&h&&b.confirmed+b.unconfirmed?[{tx_hash:h.tx_hash,tx_pos:0,height:Math.max(0,h.height),value:b.confirmed+b.unconfirmed}]:[];
    const result=m.method==='server.version'?['fixture','1.4']:m.method==='server.features'?{genesis_hash:genesis}:m.method==='blockchain.headers.subscribe'?{height:500}:m.method==='blockchain.scripthash.subscribe'?statusFor(index):m.method.endsWith('get_balance')?(b||{confirmed:0,unconfirmed:0}):m.method.endsWith('get_history')?(histories.get(index)||[]):m.method.endsWith('listunspent')?utxos:0.01;
    queueMicrotask(()=>this.onmessage({data:JSON.stringify(fail?{id:m.id,error:{message:'Fixture outage'}}:{id:m.id,result})}));
  }
}
const ctx={WebSocket:Socket,WalletTransactions:{policy:require('../www/transactions.js').policy,scriptHash:(_,a)=>a,historyStatus:require('../www/transactions.js').historyStatus},setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);
const N=ctx.WalletNetwork;
const queried=()=>calls.filter(c=>c.method.endsWith('get_balance')).map(c=>Number(c.params[0].replace('fixture-',''))).sort((a,b)=>a-b);
const subscribed=()=>calls.filter(c=>c.method==='blockchain.scripthash.subscribe').map(c=>Number(c.params[0].replace('fixture-',''))).sort((a,b)=>a-b);
const windowIndices=accounts.map(a=>a.index);
(async()=>{
  let s=await N.scan('wht',accounts);assert.equal(s.queried,20);
  calls.length=0;s=await N.scan('wht',accounts,s);
  // Unchanged addresses are still checked via their status, but not re-fetched.
  assert.deepEqual(subscribed(),[]);assert.deepEqual(queried(),[]);assert.equal(s.queried,0);
  histories.set(0,[{tx_hash:'a'.repeat(64),height:0}]);balances.set(0,{confirmed:0,unconfirmed:100000000});
  calls.length=0;s=await N.scan('wht',accounts,s,{verify:true});
  // Only address 0's status changed; the unchanged frontier address 1 is reused.
  assert.deepEqual(subscribed(),windowIndices);assert.deepEqual(queried(),[0]);assert.equal(s.unconfirmed,100000000n);
  const saved=N.encode(s),restored=N.decode(saved,'wht',accounts);
  assert.equal(restored.cached,true);assert.equal(restored.unconfirmed,100000000n);assert.equal(restored.rows[0].utxos.length,0);
  assert.equal(N.decode(saved,'pep',accounts),null);
  assert.equal(N.decode(saved,'wht',accounts.map(a=>({...a,address:'wrong'}))),null);
  assert.equal(N.decode('{broken','wht',accounts),null);
  const corrupt=JSON.parse(saved);corrupt.rows[0].confirmed='NaN';assert.equal(N.decode(JSON.stringify(corrupt),'wht',accounts),null);
  // Pending transaction disappears/reorgs: keep watching, don't reuse its address.
  histories.clear();balances.clear();calls.length=0;s=await N.scan('wht',accounts,restored);
  // A decoded cache never authorizes row reuse: everything monitored is re-fetched.
  assert.deepEqual(subscribed(),windowIndices);assert.deepEqual(queried(),windowIndices);assert.equal(s.confirmed+s.unconfirmed,0n);assert.ok(s.everUsed.includes(0));
  histories.set(1,[{tx_hash:'b'.repeat(64),height:499}]);balances.set(1,{confirmed:200000000,unconfirmed:0});
  calls.length=0;s=await N.scan('wht',accounts,s,{verify:true});
  // Address 1 changed; all other lookahead rows have live status tags and are reused.
  assert.deepEqual(subscribed(),windowIndices);assert.deepEqual(queried(),[1]);assert.equal(s.confirmed,200000000n);
  // Rediscover a restored wallet with a gap; used later addresses remain monitored.
  histories.set(12,[{tx_hash:'c'.repeat(64),height:490}]);balances.set(12,{confirmed:300000000,unconfirmed:0});
  s=await N.scan('wht',accounts);calls.length=0;s=await N.scan('wht',accounts,s);
  // Used later addresses stay monitored (subscribed) but nothing changed, so nothing is re-fetched.
  assert.deepEqual(subscribed(),[]);assert.deepEqual(queried(),[]);assert.equal(s.confirmed,500000000n);
  fail=true;await assert.rejects(()=>N.scan('wht',accounts,s));assert.equal(s.confirmed,500000000n);
  N.close();console.log('PASS: initial discovery, incremental queries, pending rotation, persistent cache isolation/validation, reorg/spent-address monitoring, gap recovery and outage preservation.');
})().catch(e=>{N.close();console.error(e);process.exitCode=1;});
