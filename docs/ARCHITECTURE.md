# Architecture and operating boundaries

The [wallet guide](../whippet/README.md) documents the complete UI, storage,
derivation, signing, recovery, reporting and Android logic. This page describes
how the components fit together.

```text
Android / browser wallet (keys, backups, signing remain local)
   | WSS: public script hashes, transaction lookups, signed broadcasts
   +---- PEP ElectrumX ---- private RPC ---- Pepecoin Core ---- PEP peers
   +---- WHT ElectrumX ---- private RPC ---- Whippet Core ----- WHT peers

PEP explorer links ---- HTTPS proxy ---- PEP Blockbook ---- private PEP RPC
Price display -------- public market data (no recovery material)
```

ElectrumX and Blockbook build independent, rebuildable indexes. They do not share
databases, and neither receives seeds or unsigned signing keys. Each ElectrumX
instance indexes exactly one chain. Never point both at the same volume.
Blockbook is not in SafeCore's balance or signing path; its PEP explorer is an
optional user-facing lookup. There is no Whippet explorer in this bundle.

The wallet verifies expected genesis hashes and address checksums/network bytes,
but trusts its Electrum server for history, confirmations and UTXO reports. It is
not an SPV wallet. A malicious or stale server can misreport state; self-hosting
changes that trust relationship, not the wallet's validation model.

Local storage and a password-encrypted seed are distinct boundaries. With password
protection disabled, the recipe is plaintext on-device and in an exported backup.
The APK contains no saved wallet. Importing an existing seed is an explicit local
action. A normal same-signature update preserves application data; uninstalling
does not. Back up each wallet before uninstalling or changing signing identities.

## Adding coins

The wallet currently implements PEP and WHT only. Backend forks contain other
coin classes, but those are not automatically supported assets in SafeCore.
Implement and test genesis identity, address/WIF versions, exact derivation paths,
transaction serialization/signatures, maturity/fee rules, server behavior,
restore compatibility and UI routing before enabling another coin. Keep network
configuration, CSP and Android external-navigation allowlists consistent.

## Important limits

- Wallet load/unlock and Overview's Rescan check all 200 receiving addresses per
  supported coin. Routine monitoring then uses a 20-address minimum window with
  lookahead growth in tens. Failed initial scans retry; cached balances never
  count as completion. The discovery cap is index 199.
- Sweep private keys stay in memory; only public addresses and signed transactions
  reach the network. PEP/WHT share WIF version 158, so asset selection is explicit.
- New validated restores report immediately; subsequent balance changes have a
  4-second stabilization window, with 4-second foreground polling. A cached value
  is not proof of current funds.
- Ordinary PEP/WHT sends use a fixed 0.01 coin fee under conservative size/input
  limits. Sweeps instead include all verified source outputs with a size-based
  fee and 25% cushion. A full sweep that cannot fit below the standard 100 kB
  boundary is refused, never silently truncated. See the wallet guide for gates.
- WHT has no price source: its unknown valuation is shown as `*`, not zero.
- Whippet AuxPoW parsing has synthetic coverage; real post-activation fixtures
  must be validated before claiming future-consensus compatibility.
- Recovery-word verification before creation, hardware-backed custody and a
  third-party security audit remain future work.

## Component provenance

The initial wallet snapshot is the working SafeCore 0.1.0-test.9 source. This
standalone repository adds portable tests, bundled notices and generic deployment
templates without changing derivation paths or wallet storage identifiers.

ElectrumX was imported from the Pepecoin ElectrumX fork at base commit
`46553b3`, including its local Whippet integration and history-compaction guard.
Whippet constants are aligned with Core v1.4.0, commit
`5714663d99a4ee5e79ab4f5b2354e4eab5acc38e`.
Blockbook is the existing Pepecoin-adapted Trezor Blockbook source snapshot, not
a claim of tracking the latest upstream release. Check component security updates
before Internet-facing deployment. Upstream fixtures and coin registries are
retained; live deployment files and databases are excluded.
