// Public BIP39 fixtures and synthetic transactions only. No mainnet broadcasts.
const assert=require('node:assert/strict'),{webcrypto,pbkdf2Sync}=require('node:crypto');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),R=require('../www/reporting.js'),S=require('../www/scanner.js');
const G=require('../../recovery/wallet.js'),F=require('../../recovery/formats.js'),B=require('../../recovery/wallet-format.js');
const ethers=require('../www/assets/ethers.umd.min.js'),bitcore=require('bitcore-lib-doge'),{bech32,bech32m}=require('bech32');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
(async()=>{
 const recipe=E.recipe(ethers,phrase),old=structuredClone(recipe);delete old.paths.ltc;
 for(const engine of [E,B]){
  assert.deepEqual(engine.validateRecipe(ethers,old),recipe);
  assert.throws(()=>engine.validateRecipe(ethers,{...old,paths:{...old.paths,ltc:"m/44'/0'/0'/0/{index}"}}));
  for(const backup of [engine.unprotected(webcrypto,old),await engine.encrypt(webcrypto,old,'Public-fixture-password')]){
   assert.deepEqual(engine.validateRecipe(ethers,await engine.decrypt(webcrypto,backup,'Public-fixture-password')),recipe);
  }
 }
 const bundle=await G.deriveAsync(ethers,phrase,{coin:'ltc',count:1000});
 const independent=bitcore.HDPrivateKey.fromSeed(pbkdf2Sync(phrase,'mnemonic',2048,64,'sha512'));
 for(const i of [0,1,19,199,999]){
  const key=independent.deriveChild("m/44'/2'/0'/0/"+i).privateKey,row=bundle.wallets[i];
  const address=bitcore.encoding.Base58Check.decode(row.address),wif=bitcore.encoding.Base58Check.decode(row.wif);
  assert.equal(address[0],48);assert.equal(wif[0],176);assert.equal(wif.at(-1),1);
  assert.deepEqual(wif.subarray(1,33),key.toBuffer());assert.deepEqual(address.subarray(1),bitcore.crypto.Hash.sha256ripemd160(key.toPublicKey().toBuffer()));
  assert.equal(row.address,E.accounts(ethers,recipe,i).ltc.address);assert.equal(T.sweepKey('ltc',row.wif).address,row.address);
  for(const coin of ['pep','wht','shic'])assert.throws(()=>T.sweepKey(coin,row.wif));
 }
 assert.equal(new Set(bundle.wallets.map(w=>w.address)).size,1000);
 assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,F.exportJSON(ethers,B,webcrypto,bundle)),bundle);
 const owner=E.accounts(ethers,recipe).ltc,change=owner.address;
 const destinations=[bundle.wallets[1].address];
 for(const version of [5,50]){const a=bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([version]),Buffer.alloc(20,9)]));assert.equal(T.script('ltc',a),'a914'+'09'.repeat(20)+'87');destinations.push(a);}
 for(const [version,size,encoder] of [[0,20,bech32],[0,32,bech32],[1,32,bech32m]]){
  const words=[version,...encoder.toWords(Buffer.alloc(size,7))],a=encoder.encode('ltc',words);
  const expected=(version?'51':'00')+size.toString(16).padStart(2,'0')+'07'.repeat(size);
  assert.equal(T.script('ltc',a),expected);assert.equal(T.script('ltc',a.toUpperCase()),expected);destinations.push(a);
  assert.equal(S.address('litecoin:'+a+'?amount=999','ltc',T.script),a);
  assert.throws(()=>T.script('ltc',a.slice(0,-1)+(a.endsWith('q')?'p':'q')));
  assert.throws(()=>T.script('ltc',encoder.encode('bc',words)));
  assert.throws(()=>T.script('ltc',(version?bech32:bech32m).encode('ltc',words)));
  assert.throws(()=>T.script('ltc','L'+a.slice(1)));
 }
 for(const a of [bech32m.encode('ltc',[2,...bech32m.toWords(Buffer.alloc(32))]),bech32.encode('ltc',[0,...bech32.toWords(Buffer.alloc(21))]),'ltcmweb1'+ 'q'.repeat(70)])assert.throws(()=>T.script('ltc',a));
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:1000000n,script:T.script('ltc',change)}],locktime:0})).slice(2);
 const input={...owner,raw,txid:T.parse(raw).txid,pos:0,height:1,value:1000000n};
 for(const destination of destinations){
  const p=T.plan({coin:'ltc',destination,changeAddress:change,amount:'0.005',tip:500,utxos:[input],feeIncluded:true,feeRate:1000n});
  assert.ok(p.fee>=200n&&p.fee<1000n);assert.equal(p.amount+p.fee,500000n);assert.equal(p.amount+p.fee+p.change,1000000n);
  const signed=T.sign(p,recipe),tx=new bitcore.Transaction(signed.raw),chunks=tx.inputs[0].script.chunks;
  assert.equal(bitcore.Transaction.sighash.verify(tx,bitcore.crypto.Signature.fromTxFormat(chunks[0].buf),bitcore.PublicKey.fromBuffer(chunks[1].buf),0,new bitcore.Script(p.inputs[0].script)),true);
  assert.ok(p.fee>=BigInt(signed.raw.length/2));assert.equal(T.parse(signed.raw).outputs[0].script,T.script('ltc',destination));
  assert.throws(()=>T.sign({...p,fee:100001n},recipe));
 }
 const args={coin:'ltc',destination:destinations[0],changeAddress:change,amount:'0.005',tip:500,utxos:[input]};
 assert.throws(()=>T.plan({...args,flatFee:true}));assert.throws(()=>T.plan({...args,feeRate:100001n}));assert.throws(()=>T.plan({...args,amount:'0.00005459'}));
 const sweep=T.sweepPlan({...args,compressed:true,feeRate:1000n});assert.ok(sweep.fee<1000n);
 T.signSweep(sweep,T.sweepKey('ltc',bundle.wallets[0].wif),recipe,1);
 assert.throws(()=>T.sweepFee(1000,100001n,'ltc'));
 assert.throws(()=>T.sweepFee(1000,100000n,'ltc')); // Cushion cannot bypass the absolute fee cap.
 assert.throws(()=>T.verifyUTXO('ltc',{...input,value:input.value+1n},500));
 assert.throws(()=>T.verifyUTXO('ltc',{...input,txid:'ff'.repeat(32)},500));
 assert.throws(()=>T.verifyUTXO('ltc',{...input,address:bundle.wallets[1].address},500));
 const coinbaseRaw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'0'.repeat(64),pos:0xffffffff,script:'00'}],outputs:[{value:1000000n,script:T.script('ltc',change)}],locktime:0})).slice(2);
 const reward={...input,raw:coinbaseRaw,txid:T.parse(coinbaseRaw).txid,height:401};T.verifyUTXO('ltc',reward,500);assert.throws(()=>T.verifyUTXO('ltc',reward,499));
 // Public Litecoin Core transaction IDs, independently obtained from the explorer.
 const hogexRaw='02000000000801842134a5196ca2dfc429a98fea7e267543f0f744a4922a6cd1985064fb11b41c0000000000ffffffff01ebec143c2532000022582096606edb5a8ab1abbab7526ac3ac1f509caee1fa84d98fdf0ed9fe002c7a63740000000000';
 assert.equal(T.parse(hogexRaw,'ltc').txid,'8af9edfbae8e12c233eaeb36ae3a599d00c68bb9a978599e644f31178087075a');
 assert.equal(T.parse(hogexRaw,'ltc').hogex,true);assert.throws(()=>T.parse(hogexRaw));
 const transparent=T.serialize({version:2,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:1000000n,script:T.script('ltc',change)}],locktime:0});
 const extended=ethers.utils.hexlify(ethers.utils.concat([transparent.slice(0,4),[0,8],transparent.slice(4,-4),[0],transparent.slice(-4)])).slice(2);
 const pegout={...input,raw:extended,txid:T.parse(extended,'ltc').txid,height:495};T.verifyUTXO('ltc',pegout,500);assert.throws(()=>T.verifyUTXO('ltc',pegout,499));
 assert.throws(()=>T.verifyUTXO('pep',pegout,500));
 const witnessRaw='0100000000010193e691a826dcb86946efc1197fe6b590898f6fba7f3003f60578c9af36e5c79e0000000000fdffffff01c822b401000000001976a9146a1b8ca4d8893c2090337c90becbe9f13e0fae3b88ac0247304402207a7de3a543b9ff69ed8b031994e6876ef9f2704b6c49a572e24cdab8d9be9f3702203701a870e1bc1e8bc483da5248c6d148fe7b85f24af589a3cdb8d6a11d6a15d201210319db1309c39131e629487bd9f75ada55aa3139dc9918b1d8869a75727301cb5f00000000';
 assert.equal(T.parse(witnessRaw,'ltc').txid,'c7e02c0246add76e557b84673e06476df3034a5c6f82fe0e544c27b0d5415ff7');
 const quote=R.ltcQuote({litecoin:{usd:80,last_updated_at:Math.floor(Date.now()/1000)}});assert.equal(quote.value,80);
 assert.equal(R.valueInUsdt('ltc',100000000n,null,.5,null,80),160);
 assert.equal(R.worth({pep:{confirmed:0n,unconfirmed:0n},wht:{confirmed:0n,unconfirmed:0n},ltc:{confirmed:100000000n,unconfirmed:0n}},null,.5,null,80).value,160);
 console.log('PASS: LTC independent HD/WIF, 1000-key offline restore, legacy/SegWit/Taproot destinations, signatures, coin-specific fees/dust/maturity, stale-safe pricing and old-backup compatibility.');
})().catch(e=>{console.error(e);process.exitCode=1;});
