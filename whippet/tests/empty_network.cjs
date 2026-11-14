// Empty-chain fixtures for UI tests: never connect to mainnet or broadcast.
module.exports=async context=>context.addInitScript(()=>{
  window.fetch=async url=>{if(String(url)!=='https://api.kraken.com/0/public/Ticker?pair=PEPUSD,USDTUSD')throw Error('Unexpected fixture fetch');return new Response(JSON.stringify({error:[],result:{PEPUSD:{c:['0.0001']},USDTZUSD:{c:['1']}}}),{status:200});};
  window.WebSocket=class{
    static OPEN=1;
    constructor(url){this.url=url;this.readyState=1;setTimeout(()=>this.onopen?.(),0);}
    close(){this.readyState=3;}
    send(raw){
      const m=JSON.parse(raw),coin=Object.keys(WalletNetwork.CONFIG).find(c=>WalletNetwork.CONFIG[c].url===this.url);
      if(!coin)throw Error('Unknown fixture endpoint');
      if(m.method==='blockchain.transaction.broadcast')throw Error('Broadcast forbidden in UI fixture');
      let result;
      if(m.method==='server.version')result=['fixture','1.4'];
      else if(m.method==='server.features')result={genesis_hash:WalletNetwork.CONFIG[coin].genesis};
      else if(m.method==='blockchain.headers.subscribe')result={height:500};
      else if(m.method==='blockchain.scripthash.subscribe')result=null;
      else if(m.method.endsWith('get_balance'))result={confirmed:0,unconfirmed:0};
      else if(m.method.endsWith('get_history')||m.method.endsWith('listunspent'))result=[];
      else if(m.method==='blockchain.relayfee'||m.method==='blockchain.estimatefee')result=['btc','ltc'].includes(coin)?0.00001:0.01;
      else throw Error('Unexpected empty-chain fixture method');
      setTimeout(()=>this.onmessage?.({data:JSON.stringify({id:m.id,result})}),0);
    }
  };
});
