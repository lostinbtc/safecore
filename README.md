# SafeCore

An extensible, self-custodial Android wallet for Layer-1 coins, launching with
Pepecoin, Whippet, Shibacoin (SHIC) and Litecoin (LTC), with self-hostable Pepecoin/Whippet backends
and external Shibacoin/Litecoin Electrum connections.

This is a development prerelease, not an audited production wallet. Use small,
expendable amounts and keep an independent recovery backup.

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

## Download and preview

[Download the Android prerelease](https://github.com/lostinbtc/safecore/releases)
or run the browser preview from a local checkout:

```sh
python3 whippet/scripts/serve.py
```

Open `http://localhost:8787`. See the wallet guide before importing recovery
material. Use an independent offline backup; browser storage is not a backup.

**Settings → Electrum connections** lets you test and select your own secure
`wss://` server separately for Pepecoin, Whippet, Shibacoin and Litecoin if the defaults are unavailable.
Choose a trusted operator: servers see your public address queries and IP address.
Connection preferences stay on this device, not in wallet backups. Restore default
connections is always available; the app does not silently switch servers.

## Components

- `whippet/`: the SafeCore wallet, Android project, browser preview and tests.
  The directory name is historical; the app is named SafeCore.
- `recovery/`: the self-contained offline Whippet address/key recovery tool.
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

## Offline recovery tool

Download and extract this repository, then open **`recovery/index.html`**
directly in your browser. It runs without a server, installation, or network
connection. Choose **Pepecoin, Whippet, Shibacoin or Litecoin** to generate 200 address/key pairs
for that asset by default, adjustable from 1 to 1,000. Local recovery-word
suggestions are included. It uses SafeCore’s receiving-address paths, not
legacy Komodo derivation.

Import plain or encrypted SafeCore/Whippet wallet JSON, or an original generator
backup. Export wallet-compatible JSON, WIF keys as TXT, address/key pairs as TXT,
or CSV. Exports are unencrypted and must be kept private.

See the [offline recovery guide](recovery/README.md) for the recovery recipe,
standalone ZIP packaging, compatibility details, and local verification.

## Start here

- [Wallet behavior and build instructions](whippet/README.md)
- [Offline multi-coin recovery](recovery/README.md)
- [Self-hosting](docs/SELF_HOSTING.md)
- [Architecture and boundaries](docs/ARCHITECTURE.md)
- [Security and current limitations](SECURITY.md)
- [Licenses and third-party notices](THIRD_PARTY_NOTICES.md)
- [APK release and verification](docs/RELEASES.md)

Core nodes must finish synchronization and transaction indexing before the
backend is usable. Starting containers is not proof of readiness. This repository
contains source and templates, not blockchain databases, wallets, TLS private
keys, RPC credentials or Android signing keys.

Currently implemented assets are PEP, WHT, SHIC and LTC. Dogecoin is a disabled coming-soon
entry. Adding another asset requires protocol, derivation, address-validation,
indexer and transaction tests; it is not just an icon or configuration change.
