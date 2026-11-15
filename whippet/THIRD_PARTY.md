# Existing project assets and libraries

Original SafeCore code is MIT-licensed. The root license is also bundled as
`www/assets/safecore.LICENSE` in the APK; the package audit verifies exact parity.
This does not change the following third-party licenses or artwork rights.

Copied without modifying their contents:

- `www/assets/pepecoin.png`: this project's `static_root/assets/P_logo.png`.
- `www/assets/whippet.png`: sibling Whippet project's
  `share/pixmaps/whippet256.png`.
- `www/assets/shibacoin.png`: unchanged `src/qt/res/icons/shibacoin.png` from
  https://github.com/shibacoinpow/shibacoin at
  `0af632dfa466c62d77a1b9a4358cf4d64d1fbd4b`.
  Its upstream MIT notice is bundled in `www/assets/shibacoin.LICENSE`.
- `www/assets/litecoin.png`: unchanged Litecoin Core icon from revision
  `ec1b6489a900d09cf5991e220dce089c77a232a2`. MIT notice/provenance is bundled in
  `www/assets/litecoin.LICENSE`. Trademark rights remain with their owners.
- `www/assets/bellscoin.png`: unchanged Bells Core bag icon from revision
  `fccdc6736fe81abc0b2b175bdacc58369c08845b`, `src/qt/res/icons/bitcoin.png`.
  Upstream MIT notice, provenance and checksum are bundled in
  `www/assets/bellscoin.LICENSE`; trademark rights remain with their owners.
- `www/assets/bitcoin.png`: unchanged Bitcoin Core v30.0 icon from `src/qt/res/icons/bitcoin.png`; MIT, full notice in `www/assets/bitcoin.LICENSE`.
- `www/assets/bonkcoin.png`: unchanged Bonkcoin Core icon from revision
  `d7a036ff48473622bb08f1c133c4af08df3cb518`, `src/qt/res/icons/bonkcoin.png`.
  Its MIT notice and provenance are bundled in `www/assets/bonkcoin.LICENSE`.
  Trademark rights remain with their owners.

- `www/assets/dingocoin.png`: unchanged Dingocoin Core icon from revision
  `c3c396cb71b55a3864a00badb6a24142179848bd`, `src/qt/res/icons/dingocoin.png`.
  Its MIT notice and provenance are bundled in `www/assets/dingocoin.LICENSE`.
- `www/assets/dogecoin.png`: unchanged Dogecoin Core icon from revision
  `b38c83fbf10302b23ac6e7ad89bc83068efe2fd8`. Its MIT notice and provenance are
  bundled in `www/assets/dogecoin.LICENSE`; trademark rights remain with their owners.
- `bech32` 2.0.0 (bitcoinjs, MIT) is a development-only independent address-test
  encoder. It is not bundled into the wallet or offline recovery tool.
- `www/assets/whippet-legacy.js`: this project's
  `static_root/whippet/wallet.js`, retained for original backup validation.
- `www/assets/ethers.umd.min.js`: existing `static_root/paperwallet/assets/`
  Ethers 5.7.2 bundle. Ethers is MIT-licensed; full notice is bundled as
  `www/assets/ethers.LICENSE`. Upstream source:
  https://github.com/ethers-io/ethers.js/tree/v5.7.2
- `www/assets/qrcode.min.js`: existing `static_root/paperwallet/assets/`
  QRCode.js bundle. Full MIT notice is bundled as `www/assets/qrcode.LICENSE`.
  Upstream source/license:
  https://github.com/davidshimjs/qrcodejs
- `www/assets/jsQR.js`: unchanged `dist/jsQR.js` from npm `jsqr@1.4.0`,
  Apache-2.0 licensed; full license in `www/assets/jsQR.LICENSE` (also bundled).
  Upstream: https://github.com/cozmo/jsQR
  Package integrity: `sha512-dxLob7q65Xg2DvstYkRpkYtmKm2sPJ9oFhrhmudT1dZvNFFTlroai3AWSpLey/w5vMcLBXRgOJsbXpdN9HzU/A==`.
  Bundle SHA-256: `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`.
  Installed with npm scripts disabled; camera frames are decoded locally.

Icon/brand rights remain with their respective owners. Local reuse here is not
a claim of ownership or a grant of rights to redistribute third-party marks.
Review all packaged dependency and artwork notices before a public APK release.

## Additional native-coin artwork and test tooling

- `www/assets/bitcoincash.svg`: Bitcoin Cash coin mark from the [published graphics kit](https://bitcoincash.org/en/graphics/), used for asset identification. Source and published use terms accompany it in `bitcoincash.LICENSE`.
- `www/assets/dash.png`: unchanged identification icon from [dashpay/dash](https://github.com/dashpay/dash/tree/da31ba69efc7386a5bf62af3e316cc7f1300377e). Full upstream notice and exact icon provenance accompany it in `dash.LICENSE`.
- `www/assets/digibyte.png`: unchanged identification icon from [DigiByte-Core/digibyte](https://github.com/DigiByte-Core/digibyte/tree/4942d9637681e178f4bc94b0b6d1c99ddd0b48d1). Full upstream notice and exact icon provenance accompany it in `digibyte.LICENSE`.
- `www/assets/junkcoin.png`: unchanged identification icon from [Junkcoin-Foundation/junkcoin-core](https://github.com/Junkcoin-Foundation/junkcoin-core/tree/0e5279a3a40f04964635c12857897618fd1e189b). Full upstream notice and exact icon provenance accompany it in `junkcoin.LICENSE`.
- `www/assets/luckycoin.png`: unchanged identification icon from [LuckycoinFoundation/luckycoin](https://github.com/LuckycoinFoundation/luckycoin/tree/8b1fa2b541d1fb2e6d27ed67155ad0997ef4c99c). Full upstream notice and exact icon provenance accompany it in `luckycoin.LICENSE`.
- `www/assets/ravencoin.png`: unchanged identification icon from [RavenProject/Ravencoin](https://github.com/RavenProject/Ravencoin/tree/6d48ae0175b10283248146ae3080e2ba70966739). Full upstream notice and exact icon provenance accompany it in `ravencoin.LICENSE`.
- Bitcore Cash 10.10.5 (BitPay, MIT) is a pinned, development-only independent BCH test verifier. It is not bundled in the wallet or offline recovery tool. Its package retains the full license.

- `www/assets/catcoin.png`: unmodified identification icon from [CatcoinCore/electrum-cat](https://github.com/CatcoinCore/electrum-cat/tree/703c3fffb84ed2232e675f1db74c4c04b92b6e9c). Exact source and upstream MIT notice accompany it in `catcoin.LICENSE`.
- `www/assets/trumpow.png`: unmodified identification icon from [trumpowppc/trumpow](https://github.com/trumpowppc/trumpow/tree/a9c8bb157bb1eb81c9916e82582e4aab7aedfd08). Exact source and upstream MIT notice accompany it in `trumpow.LICENSE`.
- `www/assets/flopcoin.png`: unmodified identification icon from [Flopcoin/Flopcoin](https://github.com/Flopcoin/Flopcoin/tree/6d9df5b32ffa14a3b47a15b2c099b554020afd88). Exact source and upstream MIT notice accompany it in `flopcoin.LICENSE`.
