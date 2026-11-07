// Public disposable fixture only. Exercise raw JSON through the real RPC parser.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const account=E.accounts(ethers,recipe).wht,accounts=[{...account,index:0}],genesis='863714e1c1a15526a0081a35097c56e28dbd43ef97f76fec0ccd5a7510326292';
let value=93904347604450969n,pending=0n,token=null,malformed=false,raw,txid;
function fund(){const tx={version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:'',sequence:0xffffffff}],outputs:[{value:value+pending,script:T.script('wht',account.address)}],locktime:0};raw=ethers.utils.hexlify(T.serialize(tx)).slice(2);txid=T.parse(raw).txid;}
const wire=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?'__integer_'+v:v).replace(/"__integer_(-?\d+)"/g,'$1');
class Socket{static OPEN=1;constructor(){this.readyState=1;queueMicrotask(()=>this.onopen());}close(){this.readyState=3;}
 send(text){const q=JSON.parse(text);let result;
  if(q.method==='server.version')result=['fixture 93904347604450969','1.4'];
  else if(q.method==='server.features')result={genesis_hash:genesis};
  else if(q.method==='blockchain.headers.subscribe')result={height:500};
  else if(q.method.endsWith('get_history'))result=[{tx_hash:txid,height:499}];
  else if(q.method==='blockchain.scripthash.subscribe')result=T.historyStatus([{tx_hash:txid,height:499}]);
  else if(q.method.endsWith('get_balance'))result={confirmed:token===null?value:'__bad_amount',unconfirmed:pending};
  else if(q.method.endsWith('listunspent'))result=[{tx_hash:txid,tx_pos:0,height:499,value:value+pending}];
  else if(q.method==='blockchain.transaction.get')result=raw;
  else if(q.method==='fixture.strings')result={text:'93904347604450969 \\"123\\"',tiny:1e-8,integer:42};
  else result=.01;
  let data=wire({id:q.id,result});if(token!==null)data=data.replace('"__bad_amount"',token);if(malformed)data=data.slice(0,-1);
  queueMicrotask(()=>this.onmessage({data}));
 }}
const ctx={WebSocket:Socket,WalletTransactions:T,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);const N=ctx.WalletNetwork;
(async()=>{try{
 fund();let s=await N.scan('wht',accounts);assert.equal(s.confirmed,93904347604450969n);assert.equal(T.format(s.confirmed),'939043476.04450969');
 assert.equal(N.decode(N.encode(s),'wht',accounts).confirmed,value);
 const inputs=await N.spendable(s);assert.equal(inputs[0].value,value);await N.checkInputs('wht',inputs);
 const destination=E.accounts(ethers,recipe,1).wht.address;
 const plan=T.plan({coin:'wht',destination,changeAddress:account.address,amount:T.format(value),feeIncluded:true,flatFee:true,utxos:inputs,feeRate:s.feeRate,tip:s.tip});
 const signed=T.parse(T.sign(plan,recipe).raw);assert.equal(signed.outputs[0].value,value-plan.fee);
 for(const amount of [9007199254740991n,9007199254740992n,9007199254740993n,100000000000000001n,0x7fffffffffffffffn]){
  value=amount;fund();s=await N.scan('wht',accounts);assert.equal(s.confirmed,amount);assert.equal(s.rows[0].utxos[0].value,amount);assert.equal(N.decode(N.encode(s),'wht',accounts).confirmed,amount);
 }
 value=93904347604450969n;pending=-9007199254740993n;fund();s=await N.scan('wht',accounts);assert.equal(s.unconfirmed,pending);assert.equal(s.rows[0].utxos[0].value,value+pending);
 pending=93904347604450969n;value=0n;fund();s=await N.scan('wht',accounts);assert.equal(s.unconfirmed,pending);
 pending=0n;value=93904347604450969n;fund();
 for(token of ['93904347604450968','93904347604450969.0','9.3904347604450969e16','9223372036854775808','true','null','"not an amount"','"1.2"'])await assert.rejects(()=>N.scan('wht',accounts),/do not agree|Invalid|range/);
 value=1n;fund();token='1.0000000000000000001';await assert.rejects(()=>N.scan('wht',accounts),/Invalid/);
 value=0n;fund();token='1e-400';await assert.rejects(()=>N.scan('wht',accounts),/Invalid/);
 token=null;const strings=await N.client('wht').call('fixture.strings');assert.equal(strings.text,'93904347604450969 \\"123\\"');assert.equal(strings.integer,42);assert.equal(strings.tiny,1e-8);
 malformed=true;await assert.rejects(()=>N.client('wht').call('fixture.strings'),/Connection closed/);
 console.log('PASS: exact large raw JSON amounts, adjacent integer precision, signed pending amounts, cache, prevout checks and signed send; unsafe floats, overflows and inconsistent totals rejected.');
}finally{N.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
