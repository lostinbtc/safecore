/* Bellscoin HTTPS transport. Only public script hashes and signed transactions
   cross this boundary. Written for SafeCore; no third-party wallet code copied. */
(function(root){
  root.WalletEsplora = function({coin,url,genesis,parseResponse,safeInteger,ConnectionError,RPCError}){
    const T=root.WalletTransactions;
    const hash=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
    const positiveHeight=v=>Number.isSafeInteger(v)&&v>0;
    class EsploraClient {
      constructor(){this.coin=coin;this.url=url;this.retired=false;this.ready=null;this.dirty=new Map();this.statuses=new Map();this.controllers=new Set();this.queue=[];this.running=0;this.feeSource=null;}
      close(){this.retired=true;this.ready=null;for(const c of this.controllers)c.abort();this.controllers.clear();this.statuses.clear();this.dirty.clear();for(const q of this.queue.splice(0))q.reject(new ConnectionError('Connection closed.'));}
      async http(path,{json=true,body}={}){
        if(this.retired)throw new ConnectionError('Connection closed.');
        if(this.running>=4)await new Promise((resolve,reject)=>this.queue.push({resolve,reject}));
        else this.running++;
        const controller=new AbortController();this.controllers.add(controller);
        const timer=setTimeout(()=>controller.abort(),15000);
        try{
          if(this.retired)throw new ConnectionError('Connection closed.');
          const response=await fetch(this.url+path,{method:body===undefined?'GET':'POST',body,
            ...(body===undefined?{}:{headers:{'Content-Type':'text/plain'}}),signal:controller.signal,
            credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error'});
          if(!response.ok){if(response.status===400)throw new RPCError('Bellscoin API rejected the request.');throw new ConnectionError('Bellscoin API unavailable. Try again later.');}
          // Bound the body while reading, not after allocating an unlimited reply.
          const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
          try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();throw Error('Bellscoin API response is too large.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
          finally{reader.releaseLock();}
          if(this.retired)throw new ConnectionError('Connection changed.');
          return json?parseResponse(text):text.trim();
        }catch(e){if(e instanceof RPCError||e instanceof ConnectionError)throw e;if(controller.signal.aborted||e instanceof TypeError)throw new ConnectionError('Bellscoin API request failed or timed out.');throw e;}
        finally{clearTimeout(timer);this.controllers.delete(controller);const next=this.queue.shift();if(next)next.resolve();else this.running--;}
      }
      async connect(){
        if(this.retired)throw new ConnectionError('Connection closed.');
        if(!this.ready)this.ready=this.http('/block-height/0',{json:false}).then(value=>{if(value!==genesis)throw new ConnectionError('Wrong blockchain: genesis does not match.');});
        try{await this.ready;}catch(e){this.close();throw e;}
      }
      scriptHash(value){if(!hash(value))throw Error('Invalid script hash.');return value.match(/../g).reverse().join('');}
      height(status){if(!status||typeof status.confirmed!=='boolean'||status.confirmed&&!positiveHeight(status.block_height))throw Error('Invalid transaction confirmation.');return status.confirmed?status.block_height:0;}
      async history(sh){
        const result=[],seen=new Set();let path='/scripthash/'+sh+'/txs';
        for(let page=0;page<41;page++){
          const rows=await this.http(path);if(!Array.isArray(rows)||rows.length>1000)throw Error('Invalid Bellscoin history.');
          let confirmed=0,last=null;
          for(const row of rows){
            if(!hash(row.txid)||seen.has(row.txid))throw Error('Duplicate or invalid Bellscoin history.');
            const height=this.height(row.status);if(page&&height===0)throw Error('Unconfirmed entry in confirmed history page.');
            if(height){confirmed++;last=row.txid;}
            seen.add(row.txid);result.push({tx_hash:row.txid,height});
          }
          if(result.length>1000)throw Error('Bellscoin history exceeds the supported limit.');
          if(confirmed<25)return result.sort((a,b)=>(a.height||Number.MAX_SAFE_INTEGER)-(b.height||Number.MAX_SAFE_INTEGER)||a.tx_hash.localeCompare(b.tx_hash));
          path='/scripthash/'+sh+'/txs/chain/'+last;
        }
        throw Error('Bellscoin history is incomplete.');
      }
      async unspent(sh){
        const rows=await this.http('/scripthash/'+sh+'/utxo');
        if(!Array.isArray(rows)||rows.length>10000)throw Error('Invalid Bellscoin outputs.');
        const statuses=new Map(),seen=new Set();
        // Both the standard Esplora status object and Nintondo's flattened
        // confirmed flag are supported. Missing heights are never guessed.
        return Promise.all(rows.map(async row=>{
          if(!hash(row.txid)||!Number.isSafeInteger(row.vout)||row.vout<0||row.vout>0xffffffff)throw Error('Invalid Bellscoin outpoint.');
          const id=row.txid+':'+row.vout;if(seen.has(id))throw Error('Duplicate Bellscoin output.');seen.add(id);
          const value=safeInteger(row.value);if(value<0n)throw Error('Invalid output amount.');
          let height;
          if(row.status)height=this.height(row.status);
          else{
            if(typeof row.confirmed!=='boolean')throw Error('Missing output confirmation.');
            if(!row.confirmed)height=0;
            else{
              if(!statuses.has(row.txid))statuses.set(row.txid,this.http('/tx/'+row.txid+'/status').then(s=>this.height(s)));
              height=await statuses.get(row.txid);if(!height)throw Error('Output confirmation changed. Refresh again.');
            }
          }
          return {tx_hash:row.txid,tx_pos:row.vout,height,value:value.toString()};
        }));
      }
      async call(method,params=[]){
        await this.connect();
        if(method==='server.version')return ['SafeCore Bellscoin HTTPS adapter','1.4'];
        if(method==='server.features')return {genesis_hash:genesis};
        if(method==='blockchain.headers.subscribe'){
          const raw=await this.http('/blocks/tip/height',{json:false});if(!/^\d{1,10}$/.test(raw))throw Error('Invalid chain height.');return {height:Number(raw)};
        }
        // This API exposes no relay-policy RPC. Use the documented Core floor,
        // not an invented server measurement. Current estimates are separate.
        if(method==='blockchain.relayfee')return .00001;
        if(method==='blockchain.estimatefee'){
          const estimates=await this.http('/fee-estimates');
          if(!estimates||typeof estimates!=='object'||Array.isArray(estimates))throw Error('Invalid fee estimates.');
          const entries=Object.entries(estimates);
          if(!entries.length){this.feeSource='core-minimum';return Number(T.policy(coin).minRate)/1e8;}
          if(entries.some(([target,rate])=>!/^\d+$/.test(target)||!positiveHeight(Number(target))||typeof rate!=='number'||!Number.isFinite(rate)||rate<=0))throw Error('Invalid fee estimates.');
          const target=params[0]||6;
          const sorted=entries.map(([blocks,rate])=>({blocks:Number(blocks),rate})).sort((a,b)=>a.blocks-b.blocks);
          const suitable=sorted.filter(e=>e.blocks<=target),rate=(suitable.at(-1)||sorted[0]).rate;
          if(rate*1000>Number(T.policy(coin).maxRate))throw Error('Bellscoin fee exceeds the safety limit.');
          this.feeSource='estimate';return rate*1000/1e8;
        }
        if(method.startsWith('blockchain.scripthash.')){
          const sh=this.scriptHash(params[0]);
          if(method==='blockchain.scripthash.subscribe')return T.historyStatus(await this.history(sh));
          if(method==='blockchain.scripthash.get_history')return this.history(sh);
          if(method==='blockchain.scripthash.listunspent')return this.unspent(sh);
          if(method==='blockchain.scripthash.get_balance'){
            const stats=await this.http('/scripthash/'+sh),balance=s=>{
              if(!s)throw Error('Missing balance statistics.');
              const funded=safeInteger(s.funded_txo_sum),spent=safeInteger(s.spent_txo_sum);
              if(funded<0n||spent<0n)throw Error('Invalid balance statistics.');return (funded-spent).toString();
            };
            return {confirmed:balance(stats.chain_stats),unconfirmed:balance(stats.mempool_stats)};
          }
        }
        if(method==='blockchain.transaction.get'){
          if(!hash(params[0])||params[1]===true)throw Error('Invalid raw transaction request.');
          const raw=await this.http('/tx/'+params[0]+'/hex',{json:false});
          if(T.parse(raw,coin).txid!==params[0])throw Error('Transaction ID does not match API data.');return raw;
        }
        if(method==='blockchain.transaction.broadcast'){
          const raw=params[0],txid=T.parse(raw,coin).txid;
          // One attempt only: a lost response is an uncertain send, never a retry.
          const result=await this.http('/tx',{json:false,body:raw});
          if(result!==txid)throw Error('Broadcast result is uncertain. Check Activity before sending again.');return result;
        }
        throw Error('Unsupported Bellscoin API operation.');
      }
    }
    return new EsploraClient();
  };
})(typeof globalThis==='object'?globalThis:this);
