/* Legacy Komodo Wallet -> PEP recovery only. No storage, DOM or networking.
   Compatibility reference: PepeEnthusiast/ks2pwif @ 8a725440427534c7b3638db5f0a952b1073d8458.
   Independently implemented with the existing cryptographic library.
   This is not BIP32/BIP39 HD derivation, KMD support, or multi-asset discovery. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./assets/ethers.umd.min.js'),require('./engine.js'),require('./transactions.js'));
  else root.WalletKomodo=factory(root.ethers,root.WalletEngine,root.WalletTransactions);
})(typeof globalThis==='object'?globalThis:this,function(ethers,E,T){
  const U=ethers.utils;
  const canonical=s=>s.normalize('NFKD').trim().toLowerCase().replace(/\s+/g,' ');
  const fingerprint=s=>U.sha256(U.toUtf8Bytes(canonical(s)));
  async function verifyDestination(crypto,vault,password,words,passphrase){
    const mnemonic=E.normalize(ethers,words);
    const current=E.validateRecipe(ethers,await E.decrypt(crypto,vault,password));
    if(mnemonic!==current.mnemonic||passphrase!==current.passphrase)throw Error('These recovery details do not match the current wallet. Check your new wallet backup.');
    return fingerprint(mnemonic);
  }
  function key(passphrase,destinationFingerprint){
    if(typeof passphrase!=='string'||passphrase.length>2048||!/^0x[0-9a-f]{64}$/.test(destinationFingerprint||''))throw Error('Verify your current wallet backup before entering a Komodo phrase.');
    // Match the converter UI: trim outer whitespace only. Internal spacing,
    // case and Unicode bytes are key material and must never be normalized.
    const text=passphrase.trim();
    if(![12,24].includes(text.split(/\s+/).length))throw Error('Enter the exact 12 or 24 words from your legacy Komodo backup.');
    if(fingerprint(text)===destinationFingerprint)throw Error('Do not reuse your Komodo seed. Create or select a wallet with a different recovery phrase first.');
    let secret;
    try{
      secret=U.arrayify(U.sha256(U.toUtf8Bytes(text)));
      secret[0]&=248;secret[31]=(secret[31]&127)|64;
      const payload=U.concat([[158],secret,[1]]);
      const checksum=U.arrayify(U.sha256(U.sha256(payload))).slice(0,4);
      return T.sweepKey('pep',U.base58.encode(U.concat([payload,checksum])));
    }catch(_){throw Error('Could not derive the legacy Komodo PEP address. Check the original phrase.');}
    finally{secret?.fill(0);}
  }
  return Object.freeze({verifyDestination,key});
});
