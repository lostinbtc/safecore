# SafeCore

A self-custodial Android wallet with a browser preview and offline recovery tool.
Keys and transaction signing stay on your device.

Supports **Bellscoin, Bitcoin, Bitcoin Cash, Dash, DigiByte, Dingocoin, Dogecoin, Litecoin, Pepecoin, Ravencoin, Shibacoin, TrumPOW and Whippet**.
Bonkcoin (BONC), Catcoin (CAT), Flopcoin (FLOP), Junkcoin (JKC) and Luckycoin (LKY) are opt-in legacy assets: enable them in **Settings → Legacy assets**
and supply your own secure Electrum endpoint. No default server is provided for
these five; BONC and FLOP also have no verified price feed. Local signing/recovery tests do not replace
funded mainnet tests. The latest additions are documented in the
[chain-specific validation notes](whippet/docs/layer1-validation.md).
This is an unaudited development prerelease: use expendable amounts and keep an
independent recovery backup. Check release notes—the downloadable APK may lag
behind this source.

## Start here

1. [Download an Android APK](https://github.com/lostinbtc/safecore/releases).
   [Verify it](docs/RELEASES.md) and back up before updating. Do not uninstall to
   bypass a signing error.
2. Create or restore a wallet, then use **Add coins** to choose what appears.
3. Keep a separate recovery backup. A local recovery copy does not protect
   against losing or resetting your device.

Tap a coin on Overview for its larger icon, centered balance and estimated value,
with direct Receive and Send controls. Hide balances also masks this screen.

[Wallet guide](whippet/README.md) · [Offline recovery](recovery/README.md) ·
[Security](SECURITY.md) · [Self-hosting](docs/SELF_HOSTING.md)

### Browser preview

```sh
python3 whippet/scripts/serve.py
```

Open `http://localhost:8787`. Use a disposable wallet for testing.
Password-free browser wallets are not encrypted; browser storage is not a backup.

Balance notifications and four-second fallback polling remain active while the wallet is open. Unchanged balances do not rebuild the overview; changed balances retain the existing fresh-observation safety check.

Prices refresh before expiry. After five minutes without a fresh quote, saved
display prices show **Last known** with an age in minutes, hours, days or months.
The age survives app restarts; these historical values never authorize fee checks.

## Sending and fees

Enter one **Total to spend**, including the fee. Max uses the available balance;
the review separates the recipient amount from the network fee.

For **every coin**, a fee above **$5 USD** shows a warning and above **$100 USD**
blocks sending with no override. These notices stay hidden below the thresholds.
Only a missing/stale USD price exposes a separate, unchecked **one-transaction
risk acknowledgment**; it waives the dollar check, not network-fee validation or
coin-denominated caps. Whippet, BONC and FLOP currently need this acknowledgment.
Receiving is unaffected. Automatic fee amounts cannot be edited.

- **BTC/LTC:** automatic, read-only size-based fees. Estimates are held for up to
  five minutes; transaction reviews expire after 90 seconds.
- **BELLS:** automatic size-based fees. If the API supplies no estimates, use
  Bells Core’s wallet minimum of 10 sat/byte; this does not guarantee confirmation.
  The rate cap is 1,000 sat/byte and the total-fee cap is 0.01 BELLS. No fee override.
- **DINGO:** automatic fees per started kilobyte, at least 1 DINGO/kB and the
  live relay rate. Recipient/change outputs must be at least 1 DINGO. Maximum
  rate: 10 DINGO/kB; total fee: 20 DINGO. No fee override.
- **CAT/FLOP/TRMP:** automatic size-based fees, minimum 0.01 coin/kB plus current relay requirements; total-fee cap 0.1 coin. No manual override. Catcoin and Flopcoin require user-supplied WSS servers.
- **BONC:** automatic size-based fees, at least 0.01 BONC/kB and the live relay
  rate. Recipient/change outputs must be at least 0.01 BONC. Maximum rate:
  0.1 BONC/kB; total fee: 0.1 BONC. No fee override.
- **BCH/DASH/DGB/JKC/LKY/RVN:** automatic size-based fees with per-chain
  minimums and hard caps. Invalid estimates block spending; no fee override.
  See the [rate and total-fee limits](whippet/docs/layer1-validation.md#automatic-fees).
- **PEP/DOGE/SHIC/WHT:** default **0.01-coin** fee within transaction-size limits.
  An optional **1-coin total fee** replaces it for larger input sets; off by default.
- Every send requires confirmation. Live input/fee checks remain mandatory, and
  fees are never silently increased. Sweeps have separate fee rules.

See [fee details and limits](whippet/README.md#fee-safety-and-usd-limits).

## Connections and recovery

Bellscoin uses a public HTTPS explorer API; other coins use Electrum. Settings
supports a custom secure Electrum connection for each coin. Defaults
retry and use verified backups where available; custom connections stay pinned.
Servers see your public address queries and IP address, not recovery secrets.
DOGE and DINGO share their official recovery path and address format, but have
separate balances and networks. Distinct historical block checks keep their
connections separate; always confirm which coin the recipient expects.

An optional encrypted JSON recovery copy uses a separate password. Save it in a
local folder and keep an independent backup. After reinstalling, restore the file
manually with its password.

For offline recovery, open **`recovery/index.html`** from an extracted repository.
It supports the thirteen standard assets plus the five legacy assets and plain/encrypted wallet JSON. Private-key exports
are unencrypted—keep them private. Legacy Komodo recovery is **PEP/SHIC only**;
other wallets' derivation paths may differ.

## Wallet risks & disclaimer

SafeCore is experimental, self-custody wallet software provided “as is,” without warranties.

You are responsible for safeguarding your recovery phrase, maintaining backups, and verifying transactions. Software defects, compromised devices, network problems, or user errors may cause permanent loss of funds.

The developers do not hold your funds or recovery keys and cannot recover lost keys or reverse confirmed transactions.

SafeCore’s developers and contributors are not liable for lost funds or other losses resulting from use of this wallet.

Your BIP39 recovery phrase can also be restored in Coinomi on supported networks when the address derivation and any extra BIP39 passphrase match. Verify a known receiving address after restoring.

The app asks you to acknowledge this notice once per installation/browser and
keeps it available under **Settings → Information**. Clearing app/browser data
removes the acknowledgment. This notice does not replace applicable law or
change the component licenses listed in [third-party notices](THIRD_PARTY_NOTICES.md).

## Components

- `whippet/`: the SafeCore wallet, Android project, browser preview and tests.
  The directory name is historical; the app is named SafeCore.
- `recovery/`: the self-contained offline recovery tool for all eighteen supported coins.
- `services/electrumx/`: the ElectrumX fork with Pepecoin and Whippet support.
- `services/blockbook/`: the Pepecoin Blockbook fork and its source.
- `infra/`: self-hosted deployment templates and node configuration examples.
- `docs/`: architecture, operations, compatibility and release instructions.

Pepecoin and Whippet each need their own fully synchronized Core node, ElectrumX
process and database. A single ElectrumX instance does not index both chains.
Blockbook indexes Pepecoin separately and provides explorer/API functionality;
Whippet does not currently have a bundled Blockbook adapter or explorer.

The wallet derives keys and signs on-device. Indexers receive public address
queries and signed transactions, never recovery phrases or private keys.

Core nodes must finish synchronization and transaction indexing before the
backend is usable. Starting containers is not proof of readiness. This repository
contains source and templates, not blockchain databases, wallets, TLS private
keys, RPC credentials or Android signing keys. Adding another asset requires
protocol, derivation, address-validation, indexer and transaction tests; it is not
just an icon or configuration change.

## Credits, licenses and Blockbook source

SafeCore includes work from independent upstream projects. Credit does not
replace their license conditions, and their inclusion does not imply endorsement
of SafeCore.

- **Blockbook:** created by SatoshiLabs / Trezor and its contributors. The
  [upstream project](https://github.com/trezor/blockbook) is licensed under
  [GNU AGPL-3.0](services/blockbook/COPYING). This repository includes a
  **modified Pepecoin fork**, with Pepecoin parser/RPC support and coin
  configurations; it is not an unmodified upstream release. See the
  [fork notice](services/blockbook/README.md),
  [source](services/blockbook/), [Docker build recipe](services/blockbook/Dockerfile)
  and [setup instructions](docs/SELF_HOSTING.md). Original notices are retained.
- **ElectrumX:** copyright Neil Booth and the Electrum developers; the
  [Pepecoin/Whippet fork](services/electrumx/) retains its
  [MIT license](services/electrumx/LICENCE).
- **Wallet libraries:** ethers.js and QRCode.js retain their MIT licenses;
  jsQR retains Apache-2.0. See [third-party notices](THIRD_PARTY_NOTICES.md)
  for component licenses and attribution.

Original SafeCore wallet, recovery-tool and supporting tooling/documentation code
is available under the [MIT license](LICENSE), except where a file or component
carries a separate license. Copyright remains with lostinbtc and the respective
SafeCore contributors.

The root MIT license does not relicense third-party code: the Blockbook fork,
including its modifications, remains AGPL-3.0; ElectrumX and bundled libraries
retain their own licenses and notices. See [third-party notices](THIRD_PARTY_NOTICES.md)
for the component boundaries. Coin names and logos remain subject to their owners'
rights; this license grants no trademark rights.

### Blockbook source for Pepecoin Service

- [View the modified Pepecoin Blockbook source](https://github.com/lostinbtc/safecore/tree/main/services/blockbook)
- [Read its AGPL-3.0 license](https://github.com/lostinbtc/safecore/blob/main/services/blockbook/COPYING)
- [Build and setup instructions](docs/SELF_HOSTING.md)

The source lives in this repository; a separate Blockbook repository is not
required. This repository is publicly accessible.
For the live service's API-page source notice, use a publicly accessible commit
or release matching the deployed version, rather than relying only on the moving
`main` branch. Verify the source and license links while logged out before
publishing the notice.

### Source access for a modified Blockbook service

If you operate a modified Blockbook service, prominently offer its remote users
free access to the corresponding source for the version actually running,
including your modifications and the required build/install scripts. Preserve
the applicable license and copyright notices, and identify modifications and
their relevant dates. See the [AGPL license](services/blockbook/COPYING),
particularly sections 1, 4–6 and 13.

A clear **Blockbook source code** link on the service should lead to an accessible
release, commit or source archive matching that deployment. A private repository,
an upstream-only link, or a promise to publish later is not a substitute for that
source offer. Publishing this README alone does not establish that the live
service has an accessible, complete source offer. Do not include wallet secrets,
RPC passwords or production private keys in a source release; use safe examples
for operator-specific settings.
