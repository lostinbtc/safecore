# Licensing and third-party notices

This repository is a collection of separately licensed components, not a blanket
relicensing of them.

| Component | License / notice |
| --- | --- |
| Original SafeCore wallet, recovery tool, supporting tooling and documentation | MIT; [full license](LICENSE), copyright lostinbtc and SafeCore contributors; separately licensed components excluded |
| ElectrumX fork | MIT; [full license](services/electrumx/LICENCE), Neil Booth / Electrum developers |
| Pepecoin Blockbook fork | GNU AGPL-3.0; [full license](services/blockbook/COPYING), SatoshiLabs / Trezor and contributors; [dated fork notice](services/blockbook/README.md), original notices retained in source |
| ethers.js 5.7.2 | MIT; [wallet license](whippet/www/assets/ethers.LICENSE), [offline recovery license](recovery/assets/ethers.LICENSE); both bundles are identical |
| QRCode.js | MIT; [full license](whippet/www/assets/qrcode.LICENSE) |
| jsQR 1.4.0 | Apache-2.0; [full license](whippet/www/assets/jsQR.LICENSE) |
| Shibacoin logo | Upstream MIT notice and provenance in [bundled license](whippet/www/assets/shibacoin.LICENSE); trademark rights remain with their owners |
| Litecoin logo | Upstream MIT notice and provenance in [bundled license](whippet/www/assets/litecoin.LICENSE); trademark rights remain with their owners |
| Bellscoin logo | Upstream MIT notice and pinned provenance in [bundled license](whippet/www/assets/bellscoin.LICENSE); trademark rights remain with their owners |
| Bonkcoin logo | Upstream MIT notice and pinned provenance in [bundled license](whippet/www/assets/bonkcoin.LICENSE); trademark rights remain with their owners |
| Dingocoin logo | Upstream MIT notice and pinned provenance in [bundled license](whippet/www/assets/dingocoin.LICENSE); trademark rights remain with their owners |
| Bitcoin logo | Bitcoin Core v30.0 MIT notice and provenance in [bundled license](whippet/www/assets/bitcoin.LICENSE); trademark rights remain with their owners |
| Dogecoin logo | Upstream MIT notice and provenance in [bundled license](whippet/www/assets/dogecoin.LICENSE); trademark rights remain with their owners |
| Android/Gradle dependencies | Their upstream notices/licenses; resolved by the checked-in build configuration |
| Test-only Bitcore / Playwright dependencies | MIT / Apache-2.0 respectively; installed notices in npm packages, exact dependency graph in package-lock.json |
| Test-only bech32 2.0.0 | MIT; independent Litecoin address-test encoder, not bundled into either application |

See [wallet asset provenance](whippet/THIRD_PARTY.md). Coin logos and marks remain
with their respective owners; code licenses do not grant trademark rights.

The root [MIT license](LICENSE) applies to original SafeCore code and documentation
unless a file or component specifies another license. It does not replace upstream
licenses or notices. In particular, `services/blockbook/`, including modifications
to that fork, remains under AGPL-3.0; `services/electrumx/` retains its own MIT
license and copyright notices. Third-party assets and dependencies keep the
licenses listed above. Contributions remain copyrighted by their respective authors.

Preserve notices and satisfy the applicable component license when distributing
modified software or offering a modified AGPL-covered service over a network.
The Blockbook source, [Docker build recipe](services/blockbook/Dockerfile),
dependency manifests and [deployment instructions](docs/SELF_HOSTING.md) are
included here. Legacy upstream Makefile packaging requires additional `build/`
tooling not included in this checkout; use the documented Dockerfile path.

For a modified Blockbook network service, prominently offer users free access to
the corresponding source of the deployed version, including required build/install
scripts and any covered dependencies. A private repository or an upstream-only
link does not replace that offer. Check the actual deployed revision and source
download before asserting compliance. This document does not replace the full
license texts or legal review of a particular distribution.

## Additional native-coin artwork and test tooling

- `whippet/www/assets/bitcoincash.svg`: Bitcoin Cash coin mark from the [published graphics kit](https://bitcoincash.org/en/graphics/), used for asset identification. Source and published use terms accompany it in `bitcoincash.LICENSE`.
- `whippet/www/assets/dash.png`: unchanged identification icon from [dashpay/dash](https://github.com/dashpay/dash/tree/da31ba69efc7386a5bf62af3e316cc7f1300377e). Full upstream notice and exact icon provenance accompany it in `dash.LICENSE`.
- `whippet/www/assets/digibyte.png`: unchanged identification icon from [DigiByte-Core/digibyte](https://github.com/DigiByte-Core/digibyte/tree/4942d9637681e178f4bc94b0b6d1c99ddd0b48d1). Full upstream notice and exact icon provenance accompany it in `digibyte.LICENSE`.
- `whippet/www/assets/junkcoin.png`: unchanged identification icon from [Junkcoin-Foundation/junkcoin-core](https://github.com/Junkcoin-Foundation/junkcoin-core/tree/0e5279a3a40f04964635c12857897618fd1e189b). Full upstream notice and exact icon provenance accompany it in `junkcoin.LICENSE`.
- `whippet/www/assets/luckycoin.png`: unchanged identification icon from [LuckycoinFoundation/luckycoin](https://github.com/LuckycoinFoundation/luckycoin/tree/8b1fa2b541d1fb2e6d27ed67155ad0997ef4c99c). Full upstream notice and exact icon provenance accompany it in `luckycoin.LICENSE`.
- `whippet/www/assets/ravencoin.png`: unchanged identification icon from [RavenProject/Ravencoin](https://github.com/RavenProject/Ravencoin/tree/6d48ae0175b10283248146ae3080e2ba70966739). Full upstream notice and exact icon provenance accompany it in `ravencoin.LICENSE`.
- Bitcore Cash 10.10.5 (BitPay, MIT) is a pinned, development-only independent BCH test verifier. It is not bundled in the wallet or offline recovery tool. Its package retains the full license.

- `whippet/www/assets/catcoin.png`: unmodified identification icon from [CatcoinCore/electrum-cat](https://github.com/CatcoinCore/electrum-cat/tree/703c3fffb84ed2232e675f1db74c4c04b92b6e9c). Exact source and upstream MIT notice accompany it in `catcoin.LICENSE`.
- `whippet/www/assets/trumpow.png`: unmodified identification icon from [trumpowppc/trumpow](https://github.com/trumpowppc/trumpow/tree/a9c8bb157bb1eb81c9916e82582e4aab7aedfd08). Exact source and upstream MIT notice accompany it in `trumpow.LICENSE`.
- `whippet/www/assets/flopcoin.png`: unmodified identification icon from [Flopcoin/Flopcoin](https://github.com/Flopcoin/Flopcoin/tree/6d9df5b32ffa14a3b47a15b2c099b554020afd88). Exact source and upstream MIT notice accompany it in `flopcoin.LICENSE`.
