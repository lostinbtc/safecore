# SafeCore

SafeCore is a self-custodial Android wallet with a browser preview and an offline
recovery tool. Keys are derived and transactions are signed on your device.

This source version supports **Pepecoin (PEP), Dogecoin (DOGE), Litecoin (LTC),
Shibacoin (SHIC), Whippet (WHT) and Bitcoin (BTC)**, in that order in the wallet.
The latest downloadable APK may lag behind the source; check its release notes
for the features included in that build.

This is a development prerelease, not an audited production wallet. Use small,
expendable amounts and keep an independent recovery backup.

## Start here

1. **Install on Android:** [download an APK from Releases](https://github.com/lostinbtc/safecore/releases).
   Read the release notes and [verification instructions](docs/RELEASES.md).
   Back up before updating; do not uninstall to work around a signing error.
2. **Create or restore a wallet:** follow the [wallet guide](whippet/README.md).
   New wallets start with no coins shown. Use **Add coins** to choose your assets;
   each wallet remembers its own selection. Existing wallets keep their selections.
   Keep a separate recovery backup before receiving funds. The developers cannot
   recover a lost phrase or backup password.
3. **Recover offline:** download and extract this repository, then open
   `recovery/index.html` in your browser. See the [offline recovery guide](recovery/README.md).

For developers and operators: [security and limitations](SECURITY.md),
[architecture](docs/ARCHITECTURE.md), [self-hosting](docs/SELF_HOSTING.md),
and [licenses and notices](THIRD_PARTY_NOTICES.md).

### Browser preview

From a local checkout, run:

```sh
python3 whippet/scripts/serve.py
```

Open `http://localhost:8787`. Use a disposable wallet to try the layout.
Browser storage is not a backup; password-free browser wallets are stored without
encryption. Read the [wallet guide](whippet/README.md) before importing real recovery
material.

## Connections and backups

**Settings → Electrum connections** lets you test and select your own secure
`wss://` server separately for each supported coin if the defaults are unavailable.
Choose a trusted operator: servers see your public address queries and IP address.
Connection preferences stay on this device, not in wallet backups. Restore default
connections is always available. Default servers have automatic failover where
verified alternates exist; custom connections stay pinned to your chosen server.

New-wallet setup offers an optional password-encrypted recovery copy. On Android,
choose a local folder; in a browser, save the downloaded JSON. The separate backup
password is required and never saved. A local document can survive an app uninstall,
but it does not protect against losing or resetting the device. Keep a separate
manual backup. After reinstalling, select the saved JSON through Restore and enter
its password; recovery is not automatic.

## Supported coins and recovery limits

All six coins listed above are implemented in this source version. Existing
SafeCore backups remain compatible. Legacy Komodo sweeps support **PEP and SHIC
only**.

Bitcoin uses BIP44 legacy receiving addresses and size-based fees; it can send to
standard legacy, SegWit and Taproot destinations. It does not discover unrelated
BIP49/84/86 accounts or Electrum seed wallets. See the [wallet guide](whippet/README.md)
for coin-specific behavior and limits.

### Offline recovery tool

Open **`recovery/index.html`** from an extracted copy of the repository. It runs
without a server, installation, or network connection. Choose any supported coin
to derive 200 address/key pairs by default, adjustable from 1 to 1,000. Local
recovery-word suggestions are included. It uses SafeCore’s receiving-address paths,
not legacy Komodo derivation.

Import plain or encrypted SafeCore/Whippet wallet JSON, or an original generator
backup. Export wallet-compatible JSON, WIF keys as TXT, address/key pairs as TXT,
or CSV. **Exports are unencrypted and must be kept private.**

See the [offline recovery guide](recovery/README.md) for supported backup formats,
derivation details, standalone ZIP packaging, and local verification.

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
- `recovery/`: the self-contained offline recovery tool for all six supported coins.
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
