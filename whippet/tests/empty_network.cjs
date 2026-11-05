// Empty-chain fixtures for UI tests: never connect to mainnet or broadcast.
module.exports=async context=>context.addInitScript(()=>{
  window.fetch=async url=>{if(String(url)!=='https://api.kraken.com/0/public/Ticker?pair=PEPUSD,USDTUSD')throw Error('Unexpected fixture fetch');return new Response(JSON.stringify({error:[],result:{PEPUSD:{c:['0.0001']},USDTZUSD:{c:['1']}}}),{status:200});};
  window.WebSocket=class{
    static OPEN=1;
    constructor(url){this.url=url;this.readyState=1;setTimeout(()=>this.onopen?.(),0);}
    close(){this.readyState=3;}
    send(raw){
      const m=JSON.parse(raw),coin=this.url.includes(':50005')?'wht':'pep';
      if(m.method==='blockchain.transaction.broadcast')throw Error('Broadcast forbidden in UI fixture');
      const result=m.method==='server.version'?['fixture','1.4']:m.method==='server.features'?{genesis_hash:WalletNetwork.CONFIG[coin].genesis}:m.method==='blockchain.headers.subscribe'?{height:500}:m.method==='blockchain.scripthash.subscribe'?null:m.method.endsWith('get_balance')?{confirmed:0,unconfirmed:0}:m.method.endsWith('get_history')||m.method.endsWith('listunspent')?[]:0.01;
      setTimeout(()=>this.onmessage?.({data:JSON.stringify({id:m.id,result})}),0);
    }
  };
});
