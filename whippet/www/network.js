/* Public Electrum WSS only. Never send recovery words, passwords, or keys. */
(function(root){
  const CONFIG={
    pep:{url:'wss://electrum.pepecoinservice.org:50004/',genesis:'37981c0c48b8d48965376c8a42ece9a0838daadb93ff975cb091f57f8c2a5faa'},
    wht:{url:'wss://electrum.pepecoinservice.org:50005/whippet',genesis:'863714e1c1a15526a0081a35097c56e28dbd43ef97f76fec0ccd5a7510326292'}
  };
  class RPCError extends Error{}
  class Client {
    constructor(coin){if(!CONFIG[coin])throw Error('Unsupported live coin.');this.coin=coin;this.pending=new Map();this.id=0;this.socket=null;this.ready=null;}
    close(){const socket=this.socket;this.socket=null;this.ready=null;if(socket)socket.close();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Connection closed.'));}this.pending.clear();}
    async connect(){
      if(this.ready)return this.ready;
      this.ready=(async()=>{
        await new Promise((resolve,reject)=>{
          const socket=new WebSocket(CONFIG[this.coin].url);this.socket=socket;
          const timer=setTimeout(()=>{socket.close();reject(Error('Electrum connection timed out.'));},12000);
          socket.onopen=()=>{clearTimeout(timer);resolve();};
          socket.onerror=()=>{clearTimeout(timer);reject(Error('Electrum WSS connection failed.'));};
          socket.onclose=()=>{clearTimeout(timer);if(this.socket===socket)this.close();reject(Error('Electrum connection closed.'));};
          socket.onmessage=event=>{
            try {
              if(typeof event.data!=='string'||event.data.length>2000000)throw Error('Invalid Electrum response.');
              for(const line of event.data.trim().split('\n')){
                const messages=JSON.parse(line);for(const m of Array.isArray(messages)?messages:[messages]){
                  const p=this.pending.get(m.id);if(!p)continue;this.pending.delete(m.id);clearTimeout(p.timer);
                  if(m.error)p.reject(new RPCError(typeof m.error.message==='string'?m.error.message.slice(0,250):'Electrum rejected the request.'));else p.resolve(m.result);
                }
              }
            }catch(_){this.close();}
          };
        });
        await this.request('server.version',['SafeCore development','1.4']);
        const f=await this.request('server.features',[]);
        if(f.genesis_hash!==CONFIG[this.coin].genesis){this.close();throw Error('Wrong blockchain: genesis does not match.');}
      })();
      try{await this.ready;}catch(e){this.close();throw e;}
    }
    request(method,params){
      if(!this.socket||this.socket.readyState!==WebSocket.OPEN)return Promise.reject(Error('Electrum is disconnected.'));
      const id=++this.id;
      return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Electrum response timed out.'));},20000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
    }
    async call(method,params=[]){await this.connect();return this.request(method,params);}
  }
  const clients={};const client=coin=>clients[coin]||(clients[coin]=new Client(coin));
  const validHash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/i.test(x);
  // Electrum status is null for no history, else a 64-char hex fingerprint of it.
  const validStatus=x=>x===null||validHash(x);
  // Row object -> the status it was fetched under. Keyed by row identity, so a
  // stale row can never be paired with a newer status (e.g. an older snapshot).
  const statusOf=new WeakMap();
  function safeInteger(n){if(!Number.isSafeInteger(n))throw Error('Balance exceeds this test client’s safe numeric range.');return BigInt(n);}
  // Cache is public display/discovery metadata, never authority to spend.
  function encode(snapshot){
    return JSON.stringify({...snapshot,version:1,cached:true,rows:snapshot.rows.map(r=>({...r,utxos:[]}))},(_,v)=>typeof v==='bigint'?v.toString():v);
  }
  function decode(raw,coin,accounts){
    try{
      const s=JSON.parse(raw),integer=v=>{if(typeof v!=='string'||! /^-?\d{1,17}$/.test(v))throw Error('Invalid amount');return BigInt(v);};
      if(s.version!==1||s.coin!==coin||!Number.isSafeInteger(s.at)||s.at<0||s.at>Date.now()+60000||!Number.isSafeInteger(s.tip)||s.tip<0||s.rows.length!==accounts.length||!Array.isArray(s.everUsed))return null;
      if(s.everUsed.some(i=>!Number.isInteger(i)||i<0||i>=accounts.length))return null;
      s.rows=s.rows.map((r,i)=>{
        if(r.account.address!==accounts[i].address||r.account.index!==i||!Array.isArray(r.history)||r.history.length>1000||r.history.some(h=>!validHash(h.tx_hash)||!Number.isInteger(h.height)||h.height< -1))throw Error('Invalid cached address');
        const confirmed=integer(r.confirmed),unconfirmed=integer(r.unconfirmed);if(confirmed<0n)throw Error('Invalid balance');
        return {account:accounts[i],confirmed,unconfirmed,history:r.history,utxos:[]};
      });
      s.confirmed=s.rows.reduce((n,r)=>n+r.confirmed,0n);s.unconfirmed=s.rows.reduce((n,r)=>n+r.unconfirmed,0n);
      s.feeRate=1000000n;s.cached=true;
      s.everUsed=[...new Set([...s.everUsed,...s.rows.filter(r=>r.history.length||r.confirmed||r.unconfirmed).map(r=>r.account.index)])];
      return s;
    }catch(_){return null;}
  }
  async function scan(coin,accounts,previous=null){
    const c=client(coin),T=root.WalletTransactions;
    if(!Array.isArray(accounts)||accounts.length!==20)throw Error('Expected the 20-address development receive pool.');
    const tip=await c.call('blockchain.headers.subscribe');if(!Number.isSafeInteger(tip.height)||tip.height<0)throw Error('Invalid chain height.');
    const query=async account=>{
      const sh=T.scriptHash(coin,account.address);
      const [balance,history,utxos]=await Promise.all([c.call('blockchain.scripthash.get_balance',[sh]),c.call('blockchain.scripthash.get_history',[sh]),c.call('blockchain.scripthash.listunspent',[sh])]);
      if(!Array.isArray(history)||history.length>1000||history.some(h=>!validHash(h.tx_hash)||!Number.isInteger(h.height)||h.height< -1)||!Array.isArray(utxos)||utxos.length>100)throw Error('Unexpected address history size or format.');
      const confirmed=safeInteger(balance.confirmed),unconfirmed=safeInteger(balance.unconfirmed);if(confirmed<0n)throw Error('Invalid confirmed balance.');
      // Confirmed DB and mempool can briefly overlap at block arrival. Reject
      // inconsistent snapshots; never cache or enable sending from double counts.
      const txids=new Set(),outpoints=new Set();let outputTotal=0n;
      for(const h of history){if(txids.has(h.tx_hash))throw Error('Inconsistent transaction history.');txids.add(h.tx_hash);}
      for(const u of utxos){const key=u.tx_hash+':'+u.tx_pos;if(outpoints.has(key))throw Error('Inconsistent unspent outputs.');outpoints.add(key);outputTotal+=safeInteger(u.value);}
      if(confirmed+unconfirmed!==outputTotal)throw Error('Balance and unspent outputs do not agree.');
      return {account,confirmed,unconfirmed,history,utxos:utxos.map(u=>{if(!validHash(u.tx_hash)||!Number.isSafeInteger(u.tx_pos)||u.tx_pos<0||!Number.isSafeInteger(u.height)||u.height<0)throw Error('Invalid unspent output.');const value=safeInteger(u.value);if(value<0n)throw Error('Invalid output amount.');return {txid:u.tx_hash,pos:u.tx_pos,height:u.height,value,address:account.address,index:account.index};})};
    };
    const reusable=previous?.coin===coin&&previous.rows?.length===accounts.length&&previous.rows.every((r,i)=>r.account.address===accounts[i].address);
    const used=new Set(reusable?previous.everUsed||[]:[]);
    if(reusable)for(const r of previous.rows)if(r.history.length||r.confirmed||r.unconfirmed||r.utxos.length)used.add(r.account.index);
    let frontier=0;while(used.has(frontier))frontier++;
    const wanted=reusable?[...new Set([...used,...(frontier<accounts.length?[frontier]:[])])]:accounts.map(a=>a.index);
    const rows=reusable?previous.rows.slice():Array(accounts.length);
    const queried=new Set(),checked=new Set();
    // Subscribing is idempotent and re-sent every scan (no reliance on pushes).
    // A live row is reused only if its fetched status still matches.
    async function refresh(index){
      const account=accounts[index],status=await c.call('blockchain.scripthash.subscribe',[T.scriptHash(coin,account.address)]);
      if(!validStatus(status))throw Error('Unexpected address status format.');
      const prior=reusable&&!previous.cached?previous.rows[index]:null;
      let row;
      if(prior&&statusOf.get(prior)===status)row=prior;
      else{row=await query(account);statusOf.set(row,status);queried.add(index);}
      rows[index]=row;checked.add(index);
      if(row.history.length||row.confirmed||row.unconfirmed||row.utxos.length)used.add(index);
    }
    await Promise.all(wanted.map(refresh));
    // A deposit can unlock another address during this scan. Check it now,
    // rather than displaying an address whose history has not been refreshed.
    frontier=0;while(used.has(frontier))frontier++;
    while(frontier<accounts.length&&!checked.has(frontier)){await refresh(frontier);if(!used.has(frontier))break;while(used.has(frontier))frontier++;}
    const relay=await c.call('blockchain.relayfee');
    if(!Number.isFinite(relay)||relay<0)throw Error('Could not verify the network relay fee.');
    // Both supported coins use the flat fee; retain the live relay floor.
    const rate=Math.max(0.01,relay);
    if(!Number.isFinite(rate)||rate>0.1)throw Error('Fee estimate exceeds development safety limit.');
    return {coin,tip:tip.height,rows,everUsed:[...used].sort((a,b)=>a-b),queried:queried.size,cached:false,confirmed:rows.reduce((n,r)=>n+r.confirmed,0n),unconfirmed:rows.reduce((n,r)=>n+r.unconfirmed,0n),feeRate:BigInt(Math.ceil(rate*1e8)),at:Date.now()};
  }
  async function spendable(snapshot){
    const c=client(snapshot.coin),T=root.WalletTransactions;
    const candidates=snapshot.rows.flatMap(r=>r.utxos).filter(u=>u.height>0);
    if(candidates.length>40)throw Error('Too many outputs for this small-value development test.');
    const txids=[...new Set(candidates.map(u=>u.txid))];const fetched=await Promise.all(txids.map(txid=>c.call('blockchain.transaction.get',[txid,false])));const raws=new Map(txids.map((txid,i)=>[txid,fetched[i]]));
    return candidates.flatMap(u=>{const raw=raws.get(u.txid),parsed=T.parse(raw);if(parsed.coinbase&&snapshot.tip-u.height+1<240)return [];return [T.verifyUTXO(snapshot.coin,{...u,raw},snapshot.tip)];});
  }
  async function checkInputs(coin,inputs){
    const c=client(coin),T=root.WalletTransactions;
    for(const address of new Set(inputs.map(i=>i.address))){
      const remaining=await c.call('blockchain.scripthash.listunspent',[T.scriptHash(coin,address)]);
      for(const i of inputs.filter(i=>i.address===address))if(!remaining.some(u=>u.tx_hash===i.txid&&u.tx_pos===i.pos&&safeInteger(u.value)===i.value&&u.height>0))throw Error('An input changed or was spent. Build a fresh review.');
    }
  }
  root.WalletNetwork={CONFIG,RPCError,client,scan,encode,decode,spendable,checkInputs,close:()=>{for(const c of Object.values(clients))c.close();}};
})(typeof globalThis==='object'?globalThis:this);
