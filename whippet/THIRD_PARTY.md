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
