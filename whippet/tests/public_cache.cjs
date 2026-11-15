// Public fixtures only. Authenticate address caches before using their contents.
const assert=require('node:assert/strict'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const other=E.recipe(ethers,'legal winner thank year wave sausage worth useful legal winner thank yellow');
const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i],get length(){return values.size;}};
const id='a'.repeat(32),cacheId=E.PUBLIC_CACHE_PREFIX+id;
let branches=0;
const instrumented={...ethers,utils:{...ethers.utils,HDNode:{fromMnemonic(...args){const master=ethers.utils.HDNode.fromMnemonic(...args);return {privateKey:master.privateKey,derivePath(path){branches++;return master.derivePath(path);}};}}}};
const expected=E.receivePool(ethers,recipe,3);
assert.deepEqual(E.cachedReceivePool(instrumented,recipe,storage,id,3),expected);assert.equal(branches,Object.keys(E.NETWORKS).length);
const valid=storage.getItem(cacheId),parsed=JSON.parse(valid);
assert.equal(Object.keys(parsed.body.pools).length,Object.keys(E.NETWORKS).length);
assert.ok(parsed.body.pools.wht.every(a=>a.publicKey.length===68));
assert.doesNotMatch(valid,/mnemonic|passphrase|privateKey|chainCode|xpub|xprv/);
assert.ok(!valid.includes(ethers.utils.HDNode.fromMnemonic(recipe.mnemonic).privateKey));
branches=0;assert.deepEqual(E.cachedReceivePool(instrumented,recipe,storage,id,3),expected);assert.equal(branches,0,'Authenticated hit skips all child derivations');
for(const mutate of [
 c=>c.body.pools.pep[0].address=E.accounts(ethers,other).pep.address,
 c=>c.body.pools.pep[0].publicKey=c.body.pools.pep[1].publicKey,
 c=>c.body.pools.wht[0].path="m/44'/0'/0'/0/0",
 c=>c.body.pools.btc.reverse(),
 c=>c.body.metadata.walletId='b'.repeat(32),
 c=>c.mac=ethers.utils.sha256(ethers.utils.toUtf8Bytes(JSON.stringify(c.body))),
 c=>c.body.pools.ltc.pop(),
 c=>c.body.metadata.version=2
]){
 const cache=JSON.parse(valid);mutate(cache);storage.setItem(cacheId,JSON.stringify(cache));branches=0;
 assert.deepEqual(E.cachedReceivePool(instrumented,recipe,storage,id,3),expected);assert.equal(branches,Object.keys(E.NETWORKS).length,'Tampering must regenerate trusted addresses');
}
for(const raw of ['{broken',JSON.stringify({body:null,mac:'0x'+'0'.repeat(64)}),'x'.repeat(1048577)]){
 storage.setItem(cacheId,raw);assert.deepEqual(E.cachedReceivePool(ethers,recipe,storage,id,3),expected);
}
storage.setItem(cacheId,valid);
assert.deepEqual(E.cachedReceivePool(ethers,other,storage,id,3),E.receivePool(ethers,other,3),'A swapped cache cannot redirect a different seed');
storage.setItem(cacheId,valid);
const passphrased=E.recipe(ethers,recipe.mnemonic,'public extra passphrase');
assert.deepEqual(E.cachedReceivePool(ethers,passphrased,storage,id,3),E.receivePool(ethers,passphrased,3));
assert.deepEqual(E.cachedReceivePool(ethers,recipe,{getItem(){throw Error('blocked');},setItem(){throw Error('quota');}},id,3),expected);
storage.setItem('unrelated-wallet-record','keep');
for(const n of [1,2,3,4])E.cachedReceivePool(ethers,recipe,storage,n.toString(16).repeat(32),3);
assert.equal([...values.keys()].filter(k=>k.startsWith(E.PUBLIC_CACHE_PREFIX)).length,3);
assert.equal(storage.getItem('unrelated-wallet-record'),'keep');
assert.throws(()=>E.cachedReceivePool(ethers,recipe,storage,'invalid',3));
const start=performance.now();E.cachedReceivePool(ethers,recipe,storage,id,200);const generated=performance.now()-start;
const hit=performance.now(),loaded=E.cachedReceivePool(ethers,recipe,storage,id,200),hitMs=performance.now()-hit;
assert.deepEqual(loaded,E.receivePool(ethers,recipe,200));
// Timing below is informational; no flaky performance threshold gates correctness.
console.log(`PASS: public-only authenticated cache, all supported paths, tamper/seed/passphrase/scope rejection, bounded storage and safe fallback (generation ${Math.round(generated)} ms; authenticated reload ${Math.round(hitMs)} ms).`);
