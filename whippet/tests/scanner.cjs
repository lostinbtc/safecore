const assert=require('node:assert/strict'),S=require('../www/scanner.js'),T=require('../www/transactions.js'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const accounts=E.accounts(ethers,E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
for(const coin of ['pep','wht','shic']){
 const address=accounts[coin].address,scheme={pep:'pepecoin',wht:'whippet',shic:'shibacoin'}[coin];
 assert.equal(S.address(address,coin,T.script),address);
 assert.equal(S.address(` ${address}\n`,coin,T.script),address);
 assert.equal(S.address(`${scheme}:${address}?amount=99999&label=ignored&message=%3Cscript%3E`,coin,T.script),address);
 for(const bad of [accounts[coin==='pep'?'wht':'pep'].address,`https://example.com/${address}`,`javascript:${address}`,`${scheme}://${address}`,`${scheme}:${address}?req-test=1`,`${scheme}:${address}?%72eq-test=1`,`${scheme}:${address}#fragment`,'<img src=x onerror=alert(1)>','x'.repeat(2049),address.slice(0,-1)+'0'])assert.throws(()=>S.address(bad,coin,T.script));
}
console.log('PASS: PEP/WHT/SHIC QR address checksums and coin validation, plain/payment URI parsing, amount ignored, required parameters/URLs/scripts/oversized payloads rejected.');
