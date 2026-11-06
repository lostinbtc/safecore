# Licensing and third-party notices

This repository is a collection of separately licensed components, not a blanket
relicensing of them.

| Component | License / notice |
| --- | --- |
| ElectrumX fork | MIT; [full license](services/electrumx/LICENCE), Neil Booth / Electrum developers |
| Pepecoin Blockbook fork | GNU AGPL-3.0; [full license](services/blockbook/COPYING), original notices retained in source |
| ethers.js 5.7.2 | MIT; [wallet license](whippet/www/assets/ethers.LICENSE), [offline recovery license](recovery/assets/ethers.LICENSE); both bundles are identical |
| QRCode.js | MIT; [full license](whippet/www/assets/qrcode.LICENSE) |
| jsQR 1.4.0 | Apache-2.0; [full license](whippet/www/assets/jsQR.LICENSE) |
| Android/Gradle dependencies | Their upstream notices/licenses; resolved by the checked-in build configuration |
| Test-only Bitcore / Playwright dependencies | MIT / Apache-2.0 respectively; installed notices in npm packages, exact dependency graph in package-lock.json |

See [wallet asset provenance](whippet/THIRD_PARTY.md). Coin logos and marks remain
with their respective owners; code licenses do not grant trademark rights.

No blanket license has yet been selected for original SafeCore wallet/tooling
code. Public availability should not be represented as a general open-source
license grant for those portions. Existing upstream component licenses remain
in effect. Resolve first-party licensing before promoting unrestricted reuse.

Preserve notices and satisfy the applicable component license when distributing
modified software or offering a modified AGPL-covered service over a network.
The Blockbook source and its build files are included here. This document does
not replace the full license texts or legal review of a particular distribution.
