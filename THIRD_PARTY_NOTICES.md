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
