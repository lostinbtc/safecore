const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const accounts=Array.from({length:20},(_,index)=>({index,address:'fixture-'+index}));
const tx='a'.repeat(64),amount=100000000000,genesis='863714e1c1a15526a0081a35097c56e28dbd43ef97f76fec0ccd5a7510326292';
let mode='pending';const calls=[];
class Socket{static OPEN=1;constructor(){this.readyState=1;queueMicrotask(()=>this.onopen());}close(){this.readyState=3;}
 send(raw){const q=JSON.parse(raw),active=q.params[0]==='fixture-0';let result;calls.push(q);
  if(q.method==='server.version')result=['fixture','1.4'];else if(q.method==='server.features')result={genesis_hash:genesis};
  else if(q.method==='blockchain.headers.subscribe')result={height:500};
  else if(q.method==='blockchain.scripthash.subscribe')result=active?crypto.createHash('sha256').update(tx+':'+(mode==='pending'?0:500)+':'+(mode==='duplicate-history'?tx+':0:':'')).digest('hex'):null;
  else if(q.method.endsWith('get_balance'))result=active?{confirmed:mode==='pending'?0:amount,unconfirmed:mode==='confirmed'?0:amount}:{confirmed:0,unconfirmed:0};
  else if(q.method.endsWith('get_history'))result=active?[{tx_hash:tx,height:mode==='pending'?0:500},...(mode==='duplicate-history'?[{tx_hash:tx,height:0}]:[])]:[];
  else if(q.method.endsWith('listunspent'))result=active?[{tx_hash:tx,tx_pos:1,value:amount,height:mode==='pending'?0:500},...(mode==='duplicate-output'?[{tx_hash:tx,tx_pos:1,value:amount,height:0}]:[])]:[];
  else result=.01;
  queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:q.id,result})}));
 }}
const ctx={WebSocket:Socket,WalletTransactions:{policy:require('../www/transactions.js').policy,scriptHash:(_,a)=>a,historyStatus:require('../www/transactions.js').historyStatus},setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);const N=ctx.WalletNetwork;
(async()=>{try{const s=await N.scan('wht',accounts);assert.equal(s.confirmed+s.unconfirmed,100000000000n);
 for(mode of ['duplicate-history','duplicate-output','mismatched-total'])await assert.rejects(()=>N.scan('wht',accounts,s,{verify:true}),/Inconsistent|do not agree/);
 assert.equal(s.confirmed+s.unconfirmed,100000000000n);mode='confirmed';const next=await N.scan('wht',accounts,s,{verify:true});assert.equal(next.confirmed,100000000000n);assert.equal(next.unconfirmed,0n);
 // Electrum status reuse: an unchanged address makes no balance/history/UTXO requests; a changed one does.
 const fetches=()=>calls.filter(c=>/get_balance|get_history|listunspent/.test(c.method)).map(c=>c.params[0]);
 calls.length=0;const again=await N.scan('wht',accounts,next);assert.deepEqual(fetches(),[]);assert.equal(again.confirmed,100000000000n);
 mode='pending';calls.length=0;const changed=await N.scan('wht',accounts,again,{verify:true});assert.deepEqual(fetches(),['fixture-0','fixture-0','fixture-0']);assert.equal(changed.unconfirmed,100000000000n);
 console.log('PASS: pending/confirmed overlap, duplicate outputs and inconsistent totals rejected; prior snapshot preserved and settled 1000 WHT accepted; unchanged addresses reuse rows by Electrum status while changed ones are refetched.');
}finally{N.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
