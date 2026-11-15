// Empty-chain fixtures for UI tests: never connect to mainnet or broadcast.
module.exports=async context=>context.addInitScript(checkpoints=>{
  window.fetch=async(url,options={})=>{
    if(String(url).startsWith('https://bells-mainnet-api.nintondo.io/')){
      if(options.method!=='GET')throw Error('Broadcast forbidden in UI fixture');
      const path=new URL(url).pathname;
      if(path==='/block-height/0')return new Response(WalletNetwork.CONFIG.bel.genesis);
      if(path==='/blocks/tip/height')return new Response('500');
      if(path==='/fee-estimates')return new Response('{}');
      if(/^\/scripthash\/[a-f0-9]{64}\/(txs|utxo)$/.test(path))return new Response('[]');
      if(/^\/scripthash\/[a-f0-9]{64}$/.test(path))return new Response(JSON.stringify({chain_stats:{funded_txo_sum:0,spent_txo_sum:0},mempool_stats:{funded_txo_sum:0,spent_txo_sum:0}}));
      throw Error('Unexpected Bellscoin fixture path');
    }
    if(String(url)!=='https://api.kraken.com/0/public/Ticker?pair=PEPUSD,USDTUSD')throw Error('Unexpected fixture fetch');return new Response(JSON.stringify({error:[],result:{PEPUSD:{c:['0.0001']},USDTZUSD:{c:['1']}}}),{status:200});
  };
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
      else if(m.method==='blockchain.block.header')result=checkpoints[coin];
      else if(m.method==='blockchain.headers.subscribe')result={height:500};
      else if(m.method==='blockchain.scripthash.subscribe')result=null;
      else if(m.method.endsWith('get_balance'))result={confirmed:0,unconfirmed:0};
      else if(m.method.endsWith('get_history')||m.method.endsWith('listunspent'))result=[];
      else if(m.method==='blockchain.relayfee'||m.method==='blockchain.estimatefee')result=['btc','ltc','bch','dash'].includes(coin)?0.00001:0.01;
      else throw Error('Unexpected empty-chain fixture method');
      setTimeout(()=>this.onmessage?.({data:JSON.stringify({id:m.id,result})}),0);
    }
  };
},require('./chain-checkpoints.cjs'));
