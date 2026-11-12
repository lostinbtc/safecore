// Public synthetic histories only; no network connections or wallet data.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const accounts=Array.from({length:200},(_,index)=>({index,address:index.toString(16).padStart(64,'0')}));
const used=new Set(),calls=[];let now=100000,fail=false,mismatch=false,inflight=0,peak=0,socket;
const hash=i=>crypto.createHash('sha256').update('fixture-'+i).digest('hex');
const status=i=>used.has(i)?crypto.createHash('sha256').update(hash(i)+':499:').digest('hex'):null;
class Socket{static OPEN=1;constructor(){socket=this;this.readyState=1;queueMicrotask(()=>this.onopen());}close(){this.readyState=3;}
 send(raw){const q=JSON.parse(raw);calls.push(q);inflight++;peak=Math.max(peak,inflight);const i=parseInt(q.params[0],16);let result;
 if(q.method==='server.version')result=['fixture','1.4'];else if(q.method==='server.features')result={genesis_hash:'863714e1c1a15526a0081a35097c56e28dbd43ef97f76fec0ccd5a7510326292'};
 else if(q.method==='blockchain.headers.subscribe')result={height:500};else if(q.method.endsWith('scripthash.subscribe'))result=mismatch?'f'.repeat(64):status(i);
 else if(q.method.endsWith('get_history'))result=used.has(i)?[{tx_hash:hash(i),height:499}]:[];
 else if(q.method.endsWith('get_balance'))result={confirmed:used.has(i)?100000000:0,unconfirmed:0};
 else if(q.method.endsWith('listunspent'))result=used.has(i)?[{tx_hash:hash(i),tx_pos:0,height:499,value:100000000}]:[];else result=.01;
 queueMicrotask(()=>{inflight--;this.onmessage({data:JSON.stringify(fail?{id:q.id,error:{message:'offline'}}:{id:q.id,result})});});
 }}
const ctx={WebSocket:Socket,WalletTransactions:{policy:require('../www/transactions.js').policy,scriptHash:(_,a)=>a,historyStatus:require('../www/transactions.js').historyStatus},setTimeout,clearTimeout,Date:{now:()=>now}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);const N=ctx.WalletNetwork;
const checks=()=>calls.filter(c=>c.method==='blockchain.scripthash.subscribe').map(c=>parseInt(c.params[0],16));
(async()=>{try{
 used.add(0);let s=await N.scan('wht',accounts);assert.equal(s.rows.filter(r=>r.checked).length,20);assert.equal(s.rows[20].checked,false);
 calls.length=0;s=await N.scan('wht',accounts,s);assert.equal(checks().length,0,'unchanged subscriptions need no repeated address polling');
 used.add(4);calls.length=0;s=await N.scan('wht',accounts,s,{verify:true});assert.equal(s.confirmed,200000000n);assert.ok(checks().includes(4));
 for(let i=0;i<20;i++)used.add(i);s=await N.scan('wht',accounts,s,{verify:true});assert.equal(s.rows.filter(r=>r.checked).length,30);
 for(let i=20;i<30;i++)used.add(i);s=await N.scan('wht',accounts,s,{verify:true});assert.equal(s.rows.filter(r=>r.checked).length,40);
 used.add(149);calls.length=0;s=await N.scan('wht',accounts,s,{full:true});assert.equal(checks().length,200);assert.equal(s.confirmed,3100000000n);assert.ok(s.everUsed.includes(149));assert.ok(peak<=30,'at most ten address triplets in flight');
 // A notification from a previously empty far address must trigger a check outside the window.
 let notifications=0;const off=N.onChange(()=>notifications++);used.add(189);
 socket.onmessage({data:JSON.stringify({method:'blockchain.scripthash.subscribe',params:[accounts[189].address,status(189)]})});
 assert.equal(notifications,1);s=await N.scan('wht',accounts,s);assert.ok(s.everUsed.includes(189));off();
 const restored=N.decode(N.encode(s),'wht',accounts);assert.equal(restored.rows[189].utxos.length,0);calls.length=0;s=await N.scan('wht',accounts,restored);assert.ok(calls.some(c=>c.method.endsWith('get_balance')));
 for(let i=0;i<200;i++)used.add(i);s=await N.scan('wht',accounts,s,{verify:true});assert.equal(s.everUsed.length,200);assert.equal(s.rows.length,200);
 // Legacy 20-row caches expand without inventing checked history or losing funds.
 const old={...s,rows:s.rows.slice(0,20),everUsed:Array.from({length:20},(_,i)=>i)};
 const migrated=N.decode(N.encode(old),'wht',accounts);assert.equal(migrated.rows.length,200);assert.equal(migrated.rows[20].checked,false);assert.equal(migrated.confirmed,2000000000n);
 used.clear();s=await N.scan('wht',accounts);used.add(29);now+=30001;calls.length=0;s=await N.scan('wht',accounts,s);assert.ok(checks().includes(29));assert.ok(s.everUsed.includes(29));
 mismatch=true;await assert.rejects(()=>N.scan('wht',accounts,s,{full:true}),/history changed/);mismatch=false;
 N.close();calls.length=0;s=await N.scan('wht',accounts,s);assert.ok(checks().length>=40,'reconnect must rebuild subscriptions');
 // Incremental display snapshots cannot be mistaken for complete spend/cache data.
 used.clear();used.add(0);used.add(149);const progress=[];
 s=await N.scan('wht',accounts,null,{full:true,onBatch:batch=>progress.push(batch)});
 assert.deepEqual(progress.map(b=>b.rows.filter(r=>r.checked).length),[20,40,60,80,100,120,140,160,180,200]);
 assert.equal(progress[0].confirmed,100000000n);assert.equal(progress[7].confirmed,200000000n);
 assert.equal(progress[0].rows[149].checked,false,'Earlier batch snapshots must not mutate');
 for(const batch of progress){assert.equal(batch.complete,false);assert.throws(()=>N.encode(batch),/incomplete/);await assert.rejects(()=>N.spendable(batch),/discovery/);}
 assert.equal(s.complete,true);assert.equal(N.decode(N.encode(s),'wht',accounts).confirmed,200000000n);
 const cached=N.decode(N.encode(s),'wht',accounts),merged=[];
 await N.scan('wht',accounts,cached,{full:true,onBatch:batch=>merged.push(batch)});
 assert.equal(merged[0].confirmed,200000000n,'Unvisited cached balances do not flash to zero');
 assert.equal(merged[0].rows[149].checked,false,'Cached history cannot unlock Receive before verification');
 let active=true;calls.length=0;
 await assert.rejects(()=>N.scan('wht',accounts,null,{full:true,isActive:()=>active,onBatch:()=>{active=false;}}),/cancelled/);
 assert.equal(checks().length,20,'Cancellation stops before starting the next batch');
 fail=true;await assert.rejects(()=>N.scan('wht',accounts,s,{full:true}));assert.equal(s.confirmed,200000000n);
 console.log('PASS: #5 deposits, 20→30→40 lookahead, bounded 200-address Rescan, pushed far-address changes, legacy-cache migration, periodic discovery and 200-address cap.');
 }finally{N.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
