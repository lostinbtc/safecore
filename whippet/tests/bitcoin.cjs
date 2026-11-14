// Public BIP39 fixtures and synthetic transactions only. No mainnet broadcasts.
const assert=require('node:assert/strict'),{webcrypto,pbkdf2Sync}=require('node:crypto');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),R=require('../www/reporting.js'),S=require('../www/scanner.js');
const G=require('../../recovery/wallet.js'),F=require('../../recovery/formats.js'),B=require('../../recovery/wallet-format.js');
const ethers=require('../www/assets/ethers.umd.min.js'),bitcore=require('bitcore-lib-doge'),{bech32,bech32m}=require('bech32');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
(async()=>{
 const recipe=E.recipe(ethers,phrase),old=structuredClone(recipe);delete old.paths.btc;
 for(const engine of [E,B]){
  assert.deepEqual(engine.validateRecipe(ethers,old),recipe);
  assert.throws(()=>engine.validateRecipe(ethers,{...old,paths:{...old.paths,btc:"m/44'/1'/0'/0/{index}"}}));
  for(const backup of [engine.unprotected(webcrypto,old),await engine.encrypt(webcrypto,old,'Public-fixture-password')]){
   assert.deepEqual(engine.validateRecipe(ethers,await engine.decrypt(webcrypto,backup,'Public-fixture-password')),recipe);
  }
 }
 const bundle=await G.deriveAsync(ethers,phrase,{coin:'btc',count:1000});
 const independent=bitcore.HDPrivateKey.fromSeed(pbkdf2Sync(phrase,'mnemonic',2048,64,'sha512'));
 for(const i of [0,1,19,199,999]){
  const key=independent.deriveChild("m/44'/0'/0'/0/"+i).privateKey,row=bundle.wallets[i];
  const address=bitcore.encoding.Base58Check.decode(row.address),wif=bitcore.encoding.Base58Check.decode(row.wif);
  assert.equal(address[0],0);assert.equal(wif[0],128);assert.equal(wif.at(-1),1);
  assert.deepEqual(wif.subarray(1,33),key.toBuffer());assert.deepEqual(address.subarray(1),bitcore.crypto.Hash.sha256ripemd160(key.toPublicKey().toBuffer()));
  assert.equal(row.address,E.accounts(ethers,recipe,i).btc.address);assert.equal(T.sweepKey('btc',row.wif).address,row.address);
  for(const coin of ['pep','wht','shic'])assert.throws(()=>T.sweepKey(coin,row.wif));
 }
 assert.equal(new Set(bundle.wallets.map(w=>w.address)).size,1000);
 assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,bundle),bundle);
 assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,F.exportJSON(ethers,B,webcrypto,bundle)),bundle);
 const owner=E.accounts(ethers,recipe).btc,change=owner.address;
 const destinations=[bundle.wallets[1].address];
 for(const version of [5]){const a=bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([version]),Buffer.alloc(20,9)]));assert.equal(T.script('btc',a),'a914'+'09'.repeat(20)+'87');destinations.push(a);}
 for(const [version,size,encoder] of [[0,20,bech32],[0,32,bech32],[1,32,bech32m]]){
  const words=[version,...encoder.toWords(Buffer.alloc(size,7))],a=encoder.encode('bc',words);
  const expected=(version?'51':'00')+size.toString(16).padStart(2,'0')+'07'.repeat(size);
  assert.equal(T.script('btc',a),expected);assert.equal(T.script('btc',a.toUpperCase()),expected);destinations.push(a);
  assert.equal(S.address('bitcoin:'+a+'?amount=999','btc',T.script),a);
  assert.throws(()=>T.script('btc',a.slice(0,-1)+(a.endsWith('q')?'p':'q')));
  assert.throws(()=>T.script('btc',encoder.encode('ltc',words)));
  assert.throws(()=>T.script('btc',(version?bech32:bech32m).encode('bc',words)));
  assert.throws(()=>T.script('btc','L'+a.slice(1)));
 }
 for(const a of [bech32m.encode('bc',[2,...bech32m.toWords(Buffer.alloc(32))]),bech32.encode('bc',[0,...bech32.toWords(Buffer.alloc(21))]),'ltcmweb1'+ 'q'.repeat(70)])assert.throws(()=>T.script('btc',a));
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:1000000n,script:T.script('btc',change)}],locktime:0})).slice(2);
 const input={...owner,raw,txid:T.parse(raw).txid,pos:0,height:1,value:1000000n};
 for(const destination of destinations){
  const p=T.plan({coin:'btc',destination,changeAddress:change,amount:'0.005',tip:500,utxos:[input],feeIncluded:true,feeRate:1000n});
  assert.ok(p.fee>=200n&&p.fee<1000n);assert.equal(p.amount+p.fee,500000n);assert.equal(p.amount+p.fee+p.change,1000000n);
  const signed=T.sign(p,recipe),tx=new bitcore.Transaction(signed.raw),chunks=tx.inputs[0].script.chunks;
  assert.equal(bitcore.Transaction.sighash.verify(tx,bitcore.crypto.Signature.fromTxFormat(chunks[0].buf),bitcore.PublicKey.fromBuffer(chunks[1].buf),0,new bitcore.Script(p.inputs[0].script)),true);
  assert.ok(p.fee>=BigInt(signed.raw.length/2));assert.equal(T.parse(signed.raw).outputs[0].script,T.script('btc',destination));
  assert.throws(()=>T.sign({...p,fee:100001n},recipe));
 }
 const args={coin:'btc',destination:destinations[0],changeAddress:change,amount:'0.005',tip:500,utxos:[input],feeRate:1000n};
 assert.throws(()=>T.plan({...args,flatFee:true}));assert.throws(()=>T.plan({...args,feeRate:100001n}));assert.throws(()=>T.plan({...args,amount:'0.00000545'}));
 const sweep=T.sweepPlan({...args,compressed:true,feeRate:1000n});assert.ok(sweep.fee<1000n);
 T.signSweep(sweep,T.sweepKey('btc',bundle.wallets[0].wif),recipe,1);
 assert.throws(()=>T.sweepFee(1000,100001n,'btc'));
 assert.throws(()=>T.sweepFee(1000,100000n,'btc')); // Cushion cannot bypass the absolute fee cap.
 assert.throws(()=>T.verifyUTXO('btc',{...input,value:input.value+1n},500));
 assert.throws(()=>T.verifyUTXO('btc',{...input,txid:'ff'.repeat(32)},500));
 assert.throws(()=>T.verifyUTXO('btc',{...input,address:bundle.wallets[1].address},500));
 const coinbaseRaw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'0'.repeat(64),pos:0xffffffff,script:'00'}],outputs:[{value:1000000n,script:T.script('btc',change)}],locktime:0})).slice(2);
 const reward={...input,raw:coinbaseRaw,txid:T.parse(coinbaseRaw).txid,height:401};T.verifyUTXO('btc',reward,500);assert.throws(()=>T.verifyUTXO('btc',reward,499));
 const quote=R.btcQuote({bitcoin:{usd:80000,last_updated_at:Math.floor(Date.now()/1000)}});assert.equal(quote.value,80000);
 assert.equal(R.valueInUsdt('btc',100000000n,null,.5,null,null,null,80000),160000);
 const K=require('../www/komodo.js');assert.equal(K.supports('btc'),false);assert.equal(K.supports('doge'),false);assert.equal(K.supports('pep'),true);assert.equal(K.supports('shic'),true);assert.throws(()=>K.key(phrase,K.fingerprint('different'),'btc'));
 for(const feeRate of [null,undefined,0n])assert.throws(()=>T.plan({...args,feeRate}));
 for(const compressed of [true,false]){
  const privateKey=new bitcore.PrivateKey({...independent.deriveChild("m/44'/0'/0'/0/0").privateKey.toObject(),compressed});
  const payload=Buffer.concat([Buffer.from([128]),privateKey.toBuffer(),...(compressed?[Buffer.from([1])]:[])]);
  const key=T.sweepKey('btc',bitcore.encoding.Base58Check.encode(payload));
  const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:1000000n,script:T.script('btc',key.address)}],locktime:0})).slice(2);
  const u={index:0,address:key.address,raw,txid:T.parse(raw).txid,pos:0,height:1,value:1000000n};
  const p=T.sweepPlan({coin:'btc',destination:destinations[1],utxos:[u],tip:500,feeRate:1000n,compressed});
  // The real sweep must target a wallet-owned P2PKH address.
  p.destination=E.accounts(ethers,recipe,1).btc.address;p.changeAddress=p.destination;p.outputs[0].script=T.script('btc',p.destination);
  const signed=T.signSweep(p,key,recipe,1),tx=new bitcore.Transaction(signed.raw),chunks=tx.inputs[0].script.chunks;
  assert.equal(bitcore.Transaction.sighash.verify(tx,bitcore.crypto.Signature.fromTxFormat(chunks[0].buf),bitcore.PublicKey.fromBuffer(chunks[1].buf),0,new bitcore.Script(p.inputs[0].script)),true);
  assert.equal(p.fee,compressed?242n:282n);
 }
 console.log('PASS: BTC independent HD/WIF, offline restore, legacy/SegWit/Taproot destinations, signatures, fee limits, maturity, compressed/uncompressed sweeps, old backups and no Komodo.');
})().catch(e=>{console.error(e);process.exitCode=1;});
