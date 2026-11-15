// Public fixture balances only. No sockets, signing or broadcasts.
module.exports = async (context,{history=false}={}) => context.addInitScript(withHistory => {
  window.__balances = {pep:5, wht:50, shic:0, ltc:0, doge:0,btc:0,bel:0,dingo:0,bch:0,dash:0,dgb:0,rvn:0,trmp:0};
  window.fetch = async () => new Response(JSON.stringify({error:[],result:{}}));
  window.WebSocket = class { constructor(){throw Error('Real network forbidden in UI fixture');} };
  Object.defineProperty(window, 'WalletNetwork', {configurable:true, set(N){
    Object.defineProperty(window, 'WalletNetwork', {value:N,configurable:true});
    N.scan = async (coin, accounts) => {
      const amount = BigInt(__balances[coin]??0) * 100000000n;
      return {coin,tip:500,at:Date.now(),confirmed:amount,unconfirmed:0n,everUsed:amount?[0]:[],feeRate:1000000n,
        rows:accounts.map((account,i)=>({account,confirmed:i?0n:amount,unconfirmed:0n,history:withHistory&&amount>0n&&!i?[{tx_hash:'a'.repeat(62)+Object.keys(WalletEngine.NETWORKS).indexOf(coin).toString(16).padStart(2,'0'),height:100}]:[],utxos:[]}))};
    };
    N.spendable = async () => [];
    N.client = () => {throw Error('RPC forbidden in UI fixture');};
  }});
},history);
