/* Restricted legacy P2PKH development sender. Amounts use integer base units.
   No keys are exported and no networking occurs in this module. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'),require('./assets/ethers.umd.min.js'));
  else root.WalletTransactions=factory(root.WalletEngine,root.ethers);
})(typeof globalThis==='object'?globalThis:this,function(E,ethers){
  const U=ethers.utils, COIN=100000000n, DUST=1000000n, MAX_FEE=10000000n, FLAT_MAX_INPUTS=6;
  // Supported chains reject standard transactions at >= 400,000 weight.
  // These legacy (non-witness) sweeps must therefore stay below 100,000 bytes.
  const SWEEP_MAX_BYTES=100000;
  const SWEEP_FEE_POLICY=Object.freeze({baseRate:COIN/100n,bytesPerUnit:1000,cushionPercent:25,maxRate:10000000n});
  const LEGACY_POLICY=Object.freeze({dust:DUST,minRate:1000000n,maxRate:MAX_FEE,maxFee:MAX_FEE,maturity:240,flatFee:true});
  const LTC_POLICY=Object.freeze({dust:5460n,minRate:1000n,maxRate:100000n,maxFee:100000n,maturity:100,flatFee:false});
  const policy=coin=>{if(!E.NETWORKS[coin])throw Error('Unsupported coin.');return coin==='ltc'?LTC_POLICY:LEGACY_POLICY;};
  const bytes=x=>U.arrayify(x), hex=x=>U.hexlify(x).slice(2), concat=parts=>U.concat(parts);
  const reverse=x=>Uint8Array.from(x).reverse();
  const hash256=x=>bytes(U.sha256(U.sha256(x)));
  function integer(value,max=0x7fffffffffffffffn){ const n=BigInt(value);if(n<0n||n>max)throw Error('Invalid transaction integer.');return n; }
  function le(value,size){let n=integer(value,(1n<<BigInt(size*8))-1n);const a=new Uint8Array(size);for(let i=0;i<size;i++){a[i]=Number(n&255n);n>>=8n;}return a;}
  function vi(n){if(n<253)return le(n,1);if(n<=65535)return concat([le(253,1),le(n,2)]);return concat([le(254,1),le(n,4)]);}
  function blob(h){const a=bytes('0x'+h);return concat([vi(a.length),a]);}
  function amount(text){if(typeof text!=='string'||!/^(0|[1-9]\d{0,9})(\.\d{1,8})?$/.test(text))throw Error('Enter a coin amount with at most 8 decimal places.');const [whole,fraction='']=text.split('.');return BigInt(whole)*COIN+BigInt(fraction.padEnd(8,'0'));}
  function format(n){n=BigInt(n);const sign=n<0n?'-':'';if(n<0n)n=-n;const fraction=String(n%COIN).padStart(8,'0').replace(/0+$/,'');return sign+String(n/COIN)+(fraction?'.'+fraction:'');}
  // Display only: group the integer part without converting exact base units
  // to floating point. Editable amounts and transaction serialization use format.
  function formatDisplay(n){const [whole,fraction]=format(n).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction?'.'+fraction:'');}
  function script(coin,address){
    if(coin==='ltc'&&typeof address==='string'&&address.toLowerCase().startsWith('ltcmweb'))throw Error('MWEB privacy addresses are not supported. Use a standard Litecoin address.');
    if(coin==='ltc'&&typeof address==='string'&&address.toLowerCase().startsWith('ltc1'))return witnessScript(address);
    if(!E.NETWORKS[coin]||typeof address!=='string'||address.length<25||address.length>40)throw Error('Use a plain receiving address for the selected coin.');
    let a;try{a=U.base58.decode(address);}catch(_){throw Error('Invalid address.');}
    if(a.length!==25||!([E.NETWORKS[coin].prefix,...(coin==='ltc'?[50,5]:[])].includes(a[0]))||hex(hash256(a.slice(0,21)).slice(0,4))!==hex(a.slice(21)))throw Error('Address checksum or coin network does not match.');
    if(coin==='ltc'&&[50,5].includes(a[0]))return 'a914'+hex(a.slice(1,21))+'87';
    return '76a914'+hex(a.slice(1,21))+'88ac';
  }
  // BIP173/BIP350 decoding only: wallet-owned keys remain legacy BIP44/P2PKH.
  function witnessScript(address){
    if(address.length>90||address!==address.toLowerCase()&&address!==address.toUpperCase())throw Error('Invalid Litecoin SegWit address.');
    const s=address.toLowerCase(),alphabet='qpzry9x8gf2tvdw0s3jn54khce6mua7l',words=[...s.slice(4)].map(c=>alphabet.indexOf(c));
    if(!s.startsWith('ltc1')||words.length<7||words.includes(-1))throw Error('Invalid Litecoin SegWit address.');
    const hrp='ltc',expanded=[...[...hrp].map(c=>c.charCodeAt(0)>>5),0,...[...hrp].map(c=>c.charCodeAt(0)&31)];
    let chk=1;const generators=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
    for(const v of [...expanded,...words]){const top=chk>>>25;chk=((chk&0x1ffffff)<<5)^v;for(let i=0;i<5;i++)if((top>>>i)&1)chk^=generators[i];}
    const version=words[0];if(version>16||(chk>>>0)!==(version===0?1:0x2bc830a3))throw Error('Litecoin address checksum does not match.');
    let acc=0,bits=0;const program=[];
    for(const v of words.slice(1,-6)){acc=((acc<<5)|v)&0xfff;bits+=5;if(bits>=8){bits-=8;program.push((acc>>>bits)&255);}}
    if(bits>=5||((acc<<(8-bits))&255)||program.length<2||program.length>40||version===0&&![20,32].includes(program.length))throw Error('Invalid Litecoin witness program.');
    // Only established v0 and v1/32-byte destinations; reject future versions.
    if(version!==0&&!(version===1&&program.length===32))throw Error('Unsupported Litecoin witness version.');
    return hex(concat([[version===0?0:0x50+version],[program.length],program]));
  }
  const scriptHash=(coin,address)=>hex(reverse(bytes(U.sha256('0x'+script(coin,address)))));
  const historyStatus=history=>history.length?U.sha256(U.toUtf8Bytes(history.map(h=>h.tx_hash+':'+h.height+':').join(''))).slice(2):null;
  function serialize(tx,scripts){
    return concat([le(tx.version,4),vi(tx.inputs.length),...tx.inputs.flatMap((i,n)=>[reverse(bytes('0x'+i.txid)),le(i.pos,4),blob(scripts?scripts[n]:i.script||''),le(i.sequence??0xffffffff,4)]),vi(tx.outputs.length),...tx.outputs.flatMap(o=>[le(o.value,8),blob(o.script)]),le(tx.locktime||0,4)]);
  }
  function parse(raw,coin=null){
    if(typeof raw!=='string'||!/^(?:[0-9a-f]{2})+$/i.test(raw)||raw.length>2000000)throw Error('Invalid raw transaction.');
    const a=bytes('0x'+raw);let p=0;
    function take(n){if(!Number.isInteger(n)||n<0||p+n>a.length)throw Error('Truncated transaction.');const b=a.slice(p,p+n);p+=n;return b;}
    function read(n){return take(n).reduceRight((v,b)=>(v<<8n)+BigInt(b),0n);}
    function count(){const tag=Number(read(1));const n=tag<253?BigInt(tag):read(tag===253?2:tag===254?4:8);if(n>100000n||(tag===253&&n<253n)||(tag===254&&n<=65535n)||(tag===255&&n<=0xffffffffn))throw Error('Invalid transaction count.');return Number(n);}
    const version=Number(read(4));let n=count(),witness=false,mweb=false,hogex=false;
    if(n===0){const flags=Number(read(1));if(!flags||flags&~(coin==='ltc'?9:1))throw Error('Unsupported witness or MWEB flags.');witness=!!(flags&1);mweb=!!(flags&8);n=count();}
    if(!n||n>10000)throw Error('Unsupported transaction inputs.');
    const inputs=Array.from({length:n},()=>({txid:hex(reverse(take(32))),pos:Number(read(4)),script:hex(take(count())),sequence:Number(read(4))}));
    const outputs=Array.from({length:count()},()=>({value:read(8),script:hex(take(count()))}));
    if(!outputs.length)throw Error('No transaction outputs.');
    if(witness)for(const input of inputs){const items=count();for(let i=0;i<items;i++)take(count());}
    if(mweb){
      // Litecoin Core ComputeHash excludes BOTH witness and the MWEB extension.
      // Only transparent prevouts are consumed here; never sign/spend MWEB data.
      const extension=a.length-p-4;if(extension<1)throw Error('Truncated MWEB extension.');
      const present=Number(read(1));if(present>1||present===0&&extension!==1||present===1&&extension===1)throw Error('Invalid MWEB extension.');
      hogex=present===0;take(extension-1);
    }
    const locktime=Number(read(4));if(p!==a.length)throw Error('Trailing transaction bytes.');
    const tx={version,inputs,outputs,locktime};
    return {...tx,...(mweb?{mweb:true,hogex}:{}),txid:hex(reverse(hash256(serialize(tx)))),coinbase:inputs.length===1&&inputs[0].txid==='0'.repeat(64)&&inputs[0].pos===0xffffffff};
  }
  function verifyUTXO(coin,u,tip){
    if(!u||!Number.isInteger(u.index)||u.index<0||u.index>=200||!Number.isInteger(u.pos)||u.pos<0||!Number.isInteger(u.height)||u.height<=0||u.height>tip)throw Error('Only confirmed wallet outputs can be spent.');
    const prev=parse(u.raw,coin),out=prev.outputs[u.pos];
    if(prev.txid!==u.txid||!out||out.value!==integer(u.value)||out.script!==script(coin,u.address))throw Error('Previous transaction does not match the claimed wallet output.');
    const maturity=policy(coin).maturity;
    if(prev.coinbase&&tip-u.height+1<maturity)throw Error(`Mining reward is not mature yet (${maturity} confirmations required).`);
    if(prev.hogex&&tip-u.height+1<6)throw Error('Litecoin MWEB withdrawal requires 6 confirmations.');
    return {...u,value:out.value,script:out.script};
  }
  function plan({coin,destination,amount:requested,utxos,changeAddress,feeRate,tip,feeIncluded=false,flatFee=false}){
    const rules=policy(coin),dust=rules.dust;
    let value=amount(requested);const budget=value;if(value<dust)throw Error(`Enter enough to cover the fee and at least ${format(dust)} for the recipient.`);
    const destinationScript=script(coin,destination),changeScript=script(coin,changeAddress);
    let rate=integer(feeRate??rules.minRate);if(rate<rules.minRate)rate=rules.minRate;if(rate>rules.maxRate)throw Error('Network fee exceeds this development wallet’s safety limit.');
    if(flatFee&&(!['pep','wht','shic'].includes(coin)||rate>1000000n))throw Error('The 0.01-coin flat fee does not meet the current relay requirement.');
    if(!Number.isInteger(tip)||tip<0||!Array.isArray(utxos))throw Error('A fresh chain snapshot is required.');
    const seen=new Set();const candidates=utxos.map(u=>verifyUTXO(coin,u,tip)).sort((a,b)=>a.value===b.value?a.txid.localeCompare(b.txid):a.value>b.value?-1:1);
    let total=0n,fee=0n,change=0n;const inputs=[];
    for(const u of candidates){
      const key=u.txid+':'+u.pos;if(seen.has(key))throw Error('Duplicate transaction input.');seen.add(key);
      inputs.push(u);total+=u.value;
      const size=10+149*inputs.length+18+(destinationScript.length+changeScript.length)/2;
      fee=coin==='ltc'?(BigInt(size)*rate+999n)/1000n:BigInt(Math.ceil(size/1000))*rate;
      if(total>=(feeIncluded?budget:value+fee)){change=total-(feeIncluded?budget:value+fee);break;}
      if(inputs.length>=8)break;
    }
    if(!inputs.length||inputs.length>8||total<(feeIncluded?budget:value+fee))throw Error(`Available confirmed coins: ${format(total)}. The entered total exceeds what can be spent in this test transaction (up to 8 inputs).`);
    if(flatFee&&fee!==1000000n)throw Error('This transaction is too large for the 0.01-coin flat fee. Use fewer inputs or a smaller total.');
    if(feeIncluded){
      value=budget-fee;
      if(value<dust)throw Error(`The total must cover the ${format(fee)} network fee plus at least ${format(dust)} for the recipient.`);
      if(change>0n&&change<dust)throw Error(`This would leave ${format(change)} as change, below the minimum. Use Max to include it in your total.`);
    }
    if(change<dust){fee+=change;change=0n;}
    if(flatFee&&fee!==1000000n)throw Error('Small change would increase the flat fee. Use Max instead.');
    if(fee>rules.maxFee)throw Error(`Fee exceeds the ${format(rules.maxFee)}-coin development limit.`);
    const outputs=[{value,script:destinationScript}];if(change)outputs.push({value:change,script:changeScript});
    return {coin,destination,changeAddress,amount:value,fee,change,inputs,outputs,tip,feeIncluded,flatFee,budget,version:1,locktime:0,createdAt:Date.now()};
  }
  function signWith(p,keyForInput,limits={inputs:8,bytes:10000,fee:MAX_FEE}){
    if(p.version!==1||p.locktime!==0||p.inputs.length<1||p.inputs.length>limits.inputs||p.amount<policy(p.coin).dust||p.fee<0n||p.fee>limits.fee||p.coin==='ltc'&&p.fee>LTC_POLICY.maxFee)throw Error('Invalid send review.');
    if(p.feeIncluded&&p.amount+p.fee!==p.budget)throw Error('The reviewed total changed.');
    if(p.flatFee&&(!['pep','wht','shic'].includes(p.coin)||p.fee!==1000000n))throw Error('The reviewed flat fee changed.');
    if(p.outputs.length!==(p.change?2:1)||p.outputs[0].value!==p.amount||p.outputs[0].script!==script(p.coin,p.destination)||p.change&&(p.outputs[1].value!==p.change||p.outputs[1].script!==script(p.coin,p.changeAddress)))throw Error('Send review outputs changed.');
    let total=0n;
    const seen=new Set();
    const scripts=p.inputs.map((input,index)=>{
      const u=verifyUTXO(p.coin,input,p.tip);total+=u.value;
      const outpoint=u.txid+':'+u.pos;if(seen.has(outpoint))throw Error('Duplicate transaction input.');seen.add(outpoint);
      const node=keyForInput(u);
      const ownScript='76a914'+U.ripemd160(U.sha256(node.publicKey)).slice(2)+'88ac';
      if(ownScript!==u.script)throw Error('Input is not owned by this seed.');
      const signingScripts=p.inputs.map((_,i)=>i===index?u.script:'');
      const digest=U.hexlify(hash256(concat([serialize(p,signingScripts),le(1,4)])));
      const sig=new U.SigningKey(node.privateKey).signDigest(digest);
      function derInt(h){let v=h.slice(2).replace(/^(00)+/,'')||'00';if(parseInt(v.slice(0,2),16)&128)v='00'+v;return '02'+hex(le(v.length/2,1))+v;}
      const body=derInt(sig.r)+derInt(sig.s),der='30'+hex(le(body.length/2,1))+body+'01';
      return hex(le(der.length/2,1))+der+hex(le(bytes(node.publicKey).length,1))+node.publicKey.slice(2);
    });
    if(total!==p.amount+p.change+p.fee)throw Error('Transaction amounts do not balance.');
    const raw=hex(serialize(p,scripts)),decoded=parse(raw);
    if(raw.length/2>limits.bytes)throw Error('Transaction exceeds the reviewed size limit.');
    if(p.flatFee&&raw.length/2>1000)throw Error('Transaction exceeds the flat-fee size limit.');
    return {raw,txid:decoded.txid};
  }
  function sign(p,recipe){
    const valid=E.validateRecipe(ethers,recipe),master=U.HDNode.fromMnemonic(valid.mnemonic,valid.passphrase);
    if(p.changeAddress!==E.accounts(ethers,valid,0)[p.coin].address)throw Error('Change address does not belong to this wallet.');
    return signWith(p,u=>master.derivePath(E.NETWORKS[p.coin].path.replace('{index}',String(u.index))));
  }
  function sweepKey(coin,wif){
    // Never include supplied text in errors, logs, storage, URLs or network calls.
    try{
      if(!E.NETWORKS[coin]||typeof wif!=='string'||! /^[1-9A-HJ-NP-Za-km-z]{51,52}$/.test(wif.trim()))throw Error();
      const a=U.base58.decode(wif.trim()),compressed=a.length===38;
      if(![37,38].includes(a.length)||a[0]!==E.NETWORKS[coin].wif||compressed&&a[33]!==1||hex(hash256(a.slice(0,-4)).slice(0,4))!==hex(a.slice(-4)))throw Error();
      const privateKey=U.hexlify(a.slice(1,33)),scalar=BigInt(privateKey);
      if(scalar===0n||scalar>=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n)throw Error();
      const publicKey=U.computePublicKey(privateKey,compressed),payload=concat([[E.NETWORKS[coin].prefix],U.ripemd160(U.sha256(publicKey))]);
      return {coin,privateKey,publicKey,compressed,address:U.base58.encode(concat([payload,hash256(payload).slice(0,4)]))};
    }catch(_){throw Error('Use a valid mainnet WIF private key. Encrypted keys, hex keys and recovery phrases are not supported.');}
  }
  function sweepSize(count,compressed=true){
    if(!Number.isSafeInteger(count)||count<1||typeof compressed!=='boolean')throw Error('Invalid sweep input count or key format.');
    // Maximum DER signature + sighash byte, both public-key encodings, CompactSize
    // input count, and exactly one P2PKH output. Never assume every WIF is compressed.
    const size=4+(count<253?1:count<=65535?3:5)+count*(compressed?149:181)+1+34+4;
    if(size>=SWEEP_MAX_BYTES)throw Error('The full balance is too large for one standard transaction. A multi-transaction sweep is required; no coins have moved.');
    return size;
  }
  function sweepFee(size,feeRate,coin='pep'){
    if(!Number.isSafeInteger(size)||size<1||size>=SWEEP_MAX_BYTES)throw Error('Invalid sweep transaction size.');
    const rules=policy(coin);
    let rate=integer(feeRate??rules.minRate);if(rate<rules.minRate)rate=rules.minRate;
    if(rate>rules.maxRate)throw Error('Network fee rate exceeds the sweep safety limit.');
    // Prorate by bytes, apply the cushion once, then round up only to base units.
    // Keep the uncushioned requirement alongside it for the pre-broadcast check.
    const numerator=BigInt(size)*rate,unit=BigInt(SWEEP_FEE_POLICY.bytesPerUnit),denominator=unit*100n;
    const fee=(numerator*BigInt(100+SWEEP_FEE_POLICY.cushionPercent)+denominator-1n)/denominator;
    if(coin==='ltc'&&fee>rules.maxFee)throw Error('Sweep fee exceeds the Litecoin safety limit.');
    return {rate,requiredFee:(numerator+unit-1n)/unit,fee};
  }
  function sweepPlan({coin,destination,utxos,tip,feeRate,compressed=true}){
    if(!Array.isArray(utxos)||!utxos.length)throw Error('No confirmed spendable coins found for this key on the selected network.');
    if(!Number.isSafeInteger(tip)||tip<0)throw Error('A fresh chain snapshot is required.');
    const estimatedBytes=sweepSize(utxos.length,compressed),destinationScript=script(coin,destination);
    const {rate,fee}=sweepFee(estimatedBytes,feeRate,coin),seen=new Set();
    const inputs=utxos.map(u=>{
      const input=verifyUTXO(coin,u,tip),id=input.txid+':'+input.pos;
      if(seen.has(id))throw Error('Duplicate transaction input.');seen.add(id);
      if(input.address!==utxos[0].address)throw Error('A sweep must spend from one private key.');
      return input;
    });
    const total=integer(inputs.reduce((n,u)=>n+u.value,0n)),value=total-fee;
    if(value<policy(coin).dust)throw Error(`The balance must cover the ${format(fee)} network fee plus at least ${format(policy(coin).dust)} for your wallet. No coins have moved.`);
    return {coin,destination,changeAddress:destination,amount:value,fee,change:0n,inputs,outputs:[{value,script:destinationScript}],tip,feeIncluded:true,flatFee:false,budget:total,version:1,locktime:0,createdAt:Date.now(),sweep:true,compressed,feeRate:rate,estimatedBytes};
  }
  function signSweep(p,key,recipe,destinationIndex){
    if(!Number.isInteger(destinationIndex)||destinationIndex<0||destinationIndex>=200||key.coin!==p.coin||p.change!==0n||p.outputs.length!==1||p.flatFee!==false||p.feeIncluded!==true||p.sweep!==true||p.compressed!==key.compressed)throw Error('Invalid sweep review.');
    const size=sweepSize(p.inputs.length,key.compressed),{fee}=sweepFee(size,p.feeRate,p.coin);
    if(p.estimatedBytes!==size||p.fee!==fee)throw Error('The reviewed sweep size or fee changed.');
    const owned=E.accounts(ethers,recipe,destinationIndex)[p.coin].address;
    if(p.destination!==owned||p.changeAddress!==owned||key.address===owned)throw Error('Sweep destination must be a different address in your wallet.');
    return signWith(p,()=>key,{inputs:p.inputs.length,bytes:size,fee});
  }
  return {COIN,DUST,MAX_FEE,FLAT_MAX_INPUTS,SWEEP_FEE_POLICY,policy,amount,format,formatDisplay,script,scriptHash,historyStatus,parse,serialize,verifyUTXO,plan,sign,sweepKey,sweepSize,sweepFee,sweepPlan,signSweep};
});
