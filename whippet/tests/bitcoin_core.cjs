// Optional independent Bitcoin Core consensus check. PUBLIC fixture only.
// Starts its own network-disabled regtest node; never attaches to an existing node.
// Run with BITCOIND_BIN pointing to a verified Bitcoin Core executable.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const net=require('node:net'),{spawn}=require('node:child_process'),{once}=require('node:events');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),G=require('../../recovery/wallet.js');
const ethers=require('../www/assets/ethers.umd.min.js'),bitcore=require('bitcore-lib-doge'),{bech32,bech32m}=require('bech32');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const base58=bitcore.encoding.Base58Check;
const recode=(text,prefix)=>base58.encode(Buffer.concat([Buffer.from(prefix),base58.decode(text).subarray(prefix.length)]));
(async()=>{
  const binary=process.env.BITCOIND_BIN;
  assert.ok(binary&&path.isAbsolute(binary)&&fs.existsSync(binary),'Set BITCOIND_BIN to a verified absolute executable path');
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'safecore-btc-regtest-'));
  const node=spawn(binary,['-regtest',`-datadir=${directory}`,'-server=1','-daemon=0','-disablewallet=1',
    '-networkactive=0','-listen=0','-connect=0','-dnsseed=0','-discover=0','-persistmempool=0',
    '-rpcbind=127.0.0.1','-rpcallowip=127.0.0.1',`-rpcport=${port}`,'-dbcache=32','-printtoconsole=0'],{stdio:'ignore'});
  let spawnError;node.on('error',error=>spawnError=error);
  const stopped=new Promise(resolve=>node.once('close',resolve));
  async function rpc(method,...params){
    const cookie=fs.readFileSync(path.join(directory,'regtest/.cookie'),'utf8').trim();
    const response=await fetch(`http://127.0.0.1:${port}/`,{method:'POST',signal:AbortSignal.timeout(30000),
      headers:{Authorization:'Basic '+Buffer.from(cookie).toString('base64'),'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
    const body=await response.json();if(body.error)throw Error(`Core ${method}: ${body.error.code}`);return body.result;
  }
  try{
    let ready=false;
    for(let i=0;i<120;i++){
      if(spawnError)throw spawnError;if(node.exitCode!==null)throw Error('Disposable Core exited before readiness');
      try{const info=await rpc('getblockchaininfo');assert.equal(info.chain,'regtest');ready=true;break;}catch(_){await delay(250);}
    }
    assert.ok(ready,'Disposable Core must become ready');
    assert.equal((await rpc('getnetworkinfo')).networkactive,false);assert.equal(await rpc('getconnectioncount'),0);
    async function addresses(descriptor,range){
      const info=await rpc('getdescriptorinfo',descriptor);
      return rpc('deriveaddresses',descriptor+'#'+info.checksum,...(range?[range]:[]));
    }
    const recipe=E.recipe(ethers,phrase),pool=E.receivePool(ethers,recipe,200).btc;
    const master=ethers.utils.HDNode.fromMnemonic(phrase);
    const tprv=recode(master.extendedKey,[4,53,131,148]);
    const coreAddresses=await addresses(`pkh(${tprv}/44h/0h/0h/0/*)`,[0,199]);
    for(let i=0;i<200;i++)assert.equal(recode(coreAddresses[i],[0]),pool[i].address);
    assert.equal(pool[0].address,'1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA');
    const offline=G.derive(ethers,phrase,{coin:'btc',count:200});
    for(let i=0;i<200;i++){
      assert.equal(offline.wallets[i].address,pool[i].address);
      assert.equal(T.sweepKey('btc',offline.wallets[i].wif).address,pool[i].address);
    }
    for(const i of [0,1,19,199]){
      const wif=recode(offline.wallets[i].wif,[239]);
      assert.equal((await addresses(`pkh(${wif})`))[0],coreAddresses[i]);
    }
    console.log('PASS: Core independently derives 200 BIP44 addresses; app/offline/WIF round trips match');
    const pub=master.derivePath("m/44'/0'/0'/0/1").publicKey.slice(2);
    const destinations=[];
    for(const descriptor of [`pkh(${pub})`,`sh(wpkh(${pub}))`,`wpkh(${pub})`,`wsh(pk(${pub}))`,`tr(${pub.slice(2)})`]){
      const [address]=await addresses(descriptor),info=await rpc('validateaddress',address);
      let mainnet;
      if(address.startsWith('bcrt1')){
        const codec=info.iswitness&&info.witness_version===0?bech32:bech32m;
        mainnet=codec.encode('bc',codec.decode(address).words);
      }else mainnet=recode(address,[info.isscript?5:0]);
      assert.equal(T.script('btc',mainnet),info.scriptPubKey);
      destinations.push(mainnet);
    }
    const blocks=await rpc('generatetoaddress',110,coreAddresses[0]),utxos=[];
    for(let i=0;i<2;i++){
      const block=await rpc('getblock',blocks[i]);
      const raw=await rpc('getrawtransaction',block.tx[0],false,blocks[i]),decoded=await rpc('decoderawtransaction',raw);
      const pos=decoded.vout.findIndex(o=>o.scriptPubKey.hex===T.script('btc',pool[0].address));
      assert.ok(pos>=0);assert.equal(T.parse(raw,'btc').txid,decoded.txid);
      utxos.push({...pool[0],raw,txid:decoded.txid,pos,height:i+1,value:T.parse(raw,'btc').outputs[pos].value});
    }
    async function accepted(signed){
      const [result]=await rpc('testmempoolaccept',[signed.raw]);
      assert.equal(result.allowed,true,JSON.stringify(result));assert.equal(result.txid,signed.txid);
    }
    let last;
    for(const destination of destinations)for(const feeIncluded of [false,true]){
      const plan=T.plan({coin:'btc',destination,changeAddress:pool[0].address,amount:'0.005',utxos:[utxos[0]],tip:110,feeRate:1000n,feeIncluded});
      last=T.sign(plan,recipe);await accepted(last);
      assert.throws(()=>T.sign(plan,E.recipe(ethers,phrase,'wrong fixture passphrase')));
    }
    for(const amount of ['50','60']){
      const plan=T.plan({coin:'btc',destination:destinations[0],changeAddress:pool[0].address,amount,utxos,tip:110,feeRate:1000n,feeIncluded:true});
      await accepted(T.sign(plan,recipe));
    }
    const damaged=T.parse(last.raw,'btc');damaged.outputs[0].value-=1n;
    const altered=ethers.utils.hexlify(T.serialize(damaged)).slice(2);
    assert.equal((await rpc('testmempoolaccept',[altered]))[0].allowed,false,'Core rejects tampered signed output');
    // Submit and mine ONLY on the private, peer-disabled chain owned by this test.
    assert.equal(await rpc('sendrawtransaction',last.raw),last.txid);
    const [mined]=await rpc('generatetoaddress',1,coreAddresses[0]);
    assert.ok((await rpc('getblock',mined)).tx.includes(last.txid));
    assert.equal((await rpc('gettxout',last.txid,0)).confirmations,1);
    assert.equal(await rpc('getconnectioncount'),0);
    console.log('PASS: Core accepts SafeCore signatures for legacy/P2SH/SegWit/Taproot destinations, Max and multi-input sends; rejects tampering; confirms a private regtest send. No real BTC or peers.');
  }finally{
    // This child and mkdtemp directory belong solely to this invocation.
    if(node.exitCode===null&&!spawnError)node.kill('SIGTERM');
    await Promise.race([stopped,delay(10000)]);
    if(node.exitCode===null&&!spawnError){node.kill('SIGKILL');await stopped;}
    fs.rmSync(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
