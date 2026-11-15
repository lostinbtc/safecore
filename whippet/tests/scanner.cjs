const assert=require('node:assert/strict'),S=require('../www/scanner.js'),T=require('../www/transactions.js'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const accounts=E.accounts(ethers,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
for(const coin of ['pep','wht','shic','doge','dingo','bel','bonc','ltc','btc','bch','dash','dgb','jkc','lky','rvn']){
 const address=accounts[coin].address,scheme={pep:'pepecoin',wht:'whippet',shic:'shibacoin',doge:'dogecoin',dingo:'dingocoin',bel:'bellscoin',bonc:'bonkcoin',ltc:'litecoin',btc:'bitcoin',bch:'bitcoincash',dash:'dash',dgb:'digibyte',jkc:'junkcoin',lky:'luckycoin',rvn:'ravencoin'}[coin];
 const payload=coin==='bch'?address.split(':')[1]:address;
 assert.equal(S.address(address,coin,T.script),address);
 assert.equal(S.address(` ${address}\n`,coin,T.script),address);
 assert.equal(S.address(`${scheme}:${payload}?amount=99999&label=ignored&message=%3Cscript%3E`,coin,T.script),address);
 for(const bad of [accounts[coin==='pep'?'wht':'pep'].address,`https://example.com/${address}`,`javascript:${address}`,`${scheme}://${address}`,`${scheme}:${payload}?req-test=1`,`${scheme}:${payload}?%72eq-test=1`,`${scheme}:${payload}#fragment`,'<img src=x onerror=alert(1)>','x'.repeat(2049),address.slice(0,-1)+'0'])assert.throws(()=>S.address(bad,coin,T.script));
}
assert.throws(()=>S.address('dogecoin:'+accounts.dingo.address,'dingo',T.script),/selected coin/);
assert.throws(()=>S.address('dingocoin:'+accounts.doge.address,'doge',T.script),/selected coin/);
assert.throws(()=>S.address('bellscoin:'+accounts.bonc.address,'bonc',T.script),/selected coin/);
assert.throws(()=>S.address('bonkcoin:'+accounts.bel.address,'bel',T.script),/selected coin/);
console.log('PASS: all supported QR schemes, same-format coin URI separation, address checksums, amount ignored, required parameters/URLs/scripts/oversized payloads rejected.');
