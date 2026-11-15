# Additional native coins (local integration)

This is a development implementation, not an independent audit or a claim of
funded mainnet testing. All amounts use integer base units (eight decimals).
All six receive through compressed P2PKH keys, account 0, branch 0; no Komodo
recovery. Existing backups without the new paths adopt the fixed paths below.
An explicitly different path is rejected. Existing keys are unchanged.

| Asset | P2PKH / P2SH / WIF | Receive path | Availability |
| --- | --- | --- | --- |
| Bitcoin Cash | 0 / 5 / 128 | `m/44'/145'/0'/0/{index}` | Public WSS + fallback |
| Dash | 76 / 16 / 204 | `m/44'/5'/0'/0/{index}` | Public WSS + fallback |
| DigiByte | 30 / 63 (legacy 5) / 128 | `m/44'/20'/0'/0/{index}` | Public WSS + fallback |
| Junkcoin | 16 / 5 / 144 | `m/44'/2013'/0'/0/{index}` | Legacy opt-in; custom WSS required |
| Luckycoin | 47 / 5 / 175 | `m/44'/790'/0'/0/{index}` | Legacy opt-in; custom WSS required |
| Ravencoin | 60 / 122 / 128 | `m/44'/175'/0'/0/{index}` | Public WSS + fallback |

Legacy opt-ins are installation settings, not seed changes. Turning one off
disconnects it, cancels pending reviews and stops address queries; saved keys and
the custom connection remain available for later. No working public JKC/LKY
WSS connection was verified. A user-supplied connection must pass the same chain
checks as a default connection before use.

## Chain-specific behavior

- **Bitcoin Cash:** displays CashAddr addresses; accepts ordinary mainnet
  P2PKH/P2SH20 CashAddr destinations, with or without prefix. BTC-style legacy
  destination strings, testnet, mixed case, token-aware and P2SH32 destinations
  are rejected. Signing uses SIGHASH_ALL | FORKID (0x41), fork ID 0, and commits
  the verified input amount. Genesis alone is insufficient: block 699484 is
  checked before wallet queries, distinguishing BCH from BTC/BSV/ABC.
- **Dash:** ordinary sends use standard legacy signatures. Reading previous
  special transactions retains their extra payload in the transaction ID.
  Platform withdrawal/new special transaction types fail closed. SafeCore does
  not implement Platform accounts, CoinJoin or InstantSend guarantees.
- **DigiByte:** standard legacy receiving; P2SH and established SegWit
  destinations are accepted. The conservative mining maturity is 100 blocks.
  Spending from previous transactions containing OP_RETURN metadata is blocked
  to avoid knowingly spending DigiAsset outputs; asset recovery is not supported.
- **Junkcoin:** legacy receiving, P2SH and v0 SegWit destinations. This is not an
  MWEB implementation. The listed public WSS connection timed out during checks.
- **Luckycoin:** revival-chain signatures prefix the legacy preimage with Core's
  little-endian uint256 chain identifier. Never falls back to unsafe old signing.
  Block 172330 distinguishes the revival chain; a server below replay-protection
  activation (tip 276500) is rejected. The old continuation is not supported.
- **Ravencoin:** native RVN only, not issued assets, restricted assets or NFTs.
  The exact plain-P2PKH prevout check rejects asset-extended scripts.

CashTokens and recognized SLP outputs are not spendable through this integration.
Metadata-based token protection is conservative, not a general token parser or
an assurance against every third-party asset protocol. Use a compatible asset
wallet for tokens. Do not send them to SafeCore.

## Automatic fees

All six use size-based fees, including every selected input and output.
The table shows local safety policy, not a promise of miner acceptance.
Rates are **base units per 1,000 bytes**, never coins per input.

| Asset | Minimum rate | Maximum rate | Maximum total fee (coins) | Minimum recipient/change (base units) | Mining maturity |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bitcoin Cash | 1,000 | 100,000 | 0.001 | 546 | 100 |
| Dash | 1,000 | 100,000 | 0.001 | 546 | 100 |
| DigiByte | 10,000,000 | 100,000,000 | 1 | 5,460 | 100 |
| Junkcoin | 10,000 | 1,000,000 | 0.01 | 5,460 | 70 |
| Luckycoin | 1,000,000 | 10,000,000 | 0.1 | 1,000,000 | 70 |
| Ravencoin | 1,000,000 | 10,000,000 | 0.1 | 546 | 100 |

The higher of Core's configured local minimum, the fresh relay rate and the
six-block estimate is used. Only an explicit Electrum `-1` result allows the
minimum/relay fallback; a timeout, RPC error, malformed or excessive estimate
blocks spending. The user sees the fee and recipient amount before confirming.
No manual one-coin override. All coins now share the $5 warning / $100 hard block. Only an unavailable fresh USD price permits an explicit per-review override; network fee validation and coin caps cannot be waived.

## Verification and limits

- `node whippet/tests/layer1.cjs`: public throwaway phrase, 200 independent
  key/address/WIF comparisons per coin, 24-word recovery through index 999,
  old/encrypted JSON recovery, offline
  export/import, 1/2/6/8-input sends and sweeps, fee conservation, mining maturity,
  BCH and LKY replay rules, unsupported token/script rejection.
- `node whippet/tests/layer1_network.cjs`: synthetic servers, chain gating,
  custom-connection isolation, failover, bad fees and single-attempt broadcasts.
  LKY's network header is mocked; BCH uses a public, hash-checked header.
- `node whippet/tests/layer1_ui.cjs`: disposable browser, synthetic balances,
  coin order, logos, receiving, locked automatic fees, simulated sends and
  hidden JKC/LKY settings. No production wallet or desktop browser is used.
- Read-only live checks on 2026-11-15 verified TLS, genesis, height and relay fee
  on both configured servers for BCH/DASH/DGB/RVN; BCH's checkpoint also matched.
  Servers remain third-party dependencies. This wallet does not validate full
  chainwork or provide SPV proofs. Genesis/checkpoints are mismatch guards, not
  protection from a dishonest server presenting fabricated balances.
- **Still required before trusting funds:** expendable-value inbound/outbound
  mainnet tests for each coin; JKC/LKY also need a working verified server.

## Catcoin and TrumPOW additions

Catcoin (CAT) is hidden behind Legacy assets pending a verified WSS endpoint.
TrumPOW (TRMP) has one verified WSS default. Neither is a similarly named token.
Both use compressed P2PKH receiving keys and legacy SIGHASH_ALL transactions;
neither enables Komodo recovery. Offline recovery includes both networks.

| Rule | CAT | TRMP |
| --- | --- | --- |
| P2PKH / P2SH / WIF | 21 / 88 / 149 | 65 / 28 / 151 |
| BIP39 receive path | `m/44'/760'/0'/0/{index}` | `m/44'/1707'/0'/0/{index}` |
| Coinbase maturity | 100 blocks | 240 blocks |
| Minimum fee rate | 0.01 coin/kB | 0.01 coin/kB |
| Dust floor | 0.000546 CAT | 0.01 TRMP |
| Local rate / total fee caps | 0.1 CAT/kB / 0.1 CAT | 0.1 TRMP/kB / 0.1 TRMP |
| Maximum transaction money | 21 million CAT | 10 billion TRMP |

Catcoin's path follows **Electrum-CAT's BIP39 legacy import** configuration, not
an assumed SLIP-0044 registration or native Electrum seed format. Native Electrum
phrases are not interchangeable with BIP39. CAT SegWit/MWEB destinations remain
unsupported. Its dust floor follows Core's 300,000-base-unit/kB dust relay rate
for a 182-byte P2PKH spend; the wallet minimum is 1,000,000 units/kB.

TRMP's coin type 1707 is registered in SLIP-0044. It uses its own genesis and
network prefixes; the fee floor follows its Core fee recommendation. Both coins
use a fresh relay check, and only Electrum's explicit `-1` estimate response may
use the documented Core floor. Errors or excessive estimates do not silently
fall back. Existing input-count, previous-output and signing checks still apply.

On 2026-11-15, the second published TRMP WSS server matched its genesis and
answered header/relay/estimate requests. The first refused connections. Catcoin's
second listed Electrum server matched its genesis over TLS; WSS was not verified.
BONC's listed hostname did not resolve, JKC's WSS probe timed out, and no LKY WSS
endpoint was found. Mining Dutch's payout list is not evidence of a public
Electrum service. No unverified endpoint was added as a default or backup.

The independent derivation/signature suite now covers 1,800 keys across nine
additions, plus encrypted/plain JSON, multi-input fees, sweeps and wrong-chain
rejection. These are synthetic tests, **not funded CAT/TRMP mainnet tests**.
The UI tests exercise TRMP sends with a fake server and CAT's opt-in connection
gate. Fresh fiat quotes use CoinGecko IDs `catcoin` (the 2013 Core chain) and
`trumpow`, not similarly named tokens.

## Flopcoin

FLOP is also opt-in under Legacy assets. Its two published WSS addresses refused
connections or were unreachable on 2026-11-15; no default endpoint is enabled.
Core parameters: P2PKH 35, P2SH 22, WIF 158; 240-block maturity; maximum transaction
money 10 billion FLOP. SafeCore uses `m/44'/3'/0'/0/{index}`, following the
[Komodo coin registry](https://github.com/KomodoPlatform/coins/blob/master/coins)
HD coin type. This is a BIP39 HD recipe, not a non-BIP39 Komodo sweep.
Automatic fees use Core's 0.01 FLOP/kB recommendation, a 0.01 FLOP dust floor and
local 0.1 FLOP/kB rate / 0.1 FLOP total caps. Only explicit `-1` estimation permits
the Core/relay floor; network failures do not. No verified USD feed is configured,
so a send requires the separate missing-price acknowledgment. Ordinary network
fee validation and caps remain enforced. Funded mainnet tests are still pending.

## Display updates without slower deposit monitoring

Push notification debounce remains 250 ms and fallback polling remains four
seconds. Hidden assets continue to be monitored. Published balance changes patch
existing overview nodes; unchanged data causes no DOM mutations. The existing
matching fresh-observation rule is unchanged. No frame-rate or debounce timer
delays a published balance. Unchanged public balance-cache writes are limited to
a 30-second heartbeat; changed data is saved immediately. This cache is never
authority to spend. Locking, wallet switches and connection changes clear the
write memo, and queued display work is guarded by wallet, epoch and route.

## Pinned primary references

- [bitcoincash Core](https://github.com/bitcoin-cash-node/bitcoin-cash-node/tree/07576013c91ff4a3a74acd85f189c69121cdad1b): chain parameters, policy, transaction rules; icon provenance and upstream notice are in `www/assets/bitcoincash.LICENSE`.
- [dash Core](https://github.com/dashpay/dash/tree/da31ba69efc7386a5bf62af3e316cc7f1300377e): chain parameters, policy, transaction rules; icon provenance and upstream notice are in `www/assets/dash.LICENSE`.
- [digibyte Core](https://github.com/DigiByte-Core/digibyte/tree/4942d9637681e178f4bc94b0b6d1c99ddd0b48d1): chain parameters, policy, transaction rules; icon provenance and upstream notice are in `www/assets/digibyte.LICENSE`.
- [junkcoin Core](https://github.com/Junkcoin-Foundation/junkcoin-core/tree/0e5279a3a40f04964635c12857897618fd1e189b): chain parameters, policy, transaction rules; icon provenance and upstream notice are in `www/assets/junkcoin.LICENSE`.
- [luckycoin Core](https://github.com/LuckycoinFoundation/luckycoin/tree/8b1fa2b541d1fb2e6d27ed67155ad0997ef4c99c): chain parameters, policy, transaction rules; icon provenance and upstream notice are in `www/assets/luckycoin.LICENSE`.
- [ravencoin Core](https://github.com/RavenProject/Ravencoin/tree/6d48ae0175b10283248146ae3080e2ba70966739): chain parameters, policy, transaction rules; icon provenance and upstream notice are in `www/assets/ravencoin.LICENSE`.
- [SLIP-0044 coin types](https://github.com/satoshilabs/slips/blob/master/slip-0044.md).
- [Catcoin Core](https://github.com/CatcoinCore/catcoincore/tree/491a6ca12bc301ec9aa5ab6fb3a4a120ae7d78de): chain parameters, wallet fee floor, dust policy and maturity.
- [Electrum-CAT](https://github.com/CatcoinCore/electrum-cat/tree/703c3fffb84ed2232e675f1db74c4c04b92b6e9c): BIP39 import path, network constants and published server list.
- [TrumPOW Core](https://github.com/trumpowppc/trumpow/tree/a9c8bb157bb1eb81c9916e82582e4aab7aedfd08): chain parameters, fee recommendation, money limit and maturity.
- [Flopcoin Core](https://github.com/Flopcoin/Flopcoin/tree/6d9df5b32ffa14a3b47a15b2c099b554020afd88): chain parameters, fee recommendation, money limit and maturity.
- [BCH CashAddr](https://documentation.cash/protocol/blockchain/encoding/cashaddr)
  and [replay-protected signing](https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/replay-protected-sighash.md).
- [Public Electrum discovery](https://github.com/KomodoPlatform/coins/tree/master/electrums).

The additional Bitcore Cash package is pinned and **test-only**. It is not bundled
in the application; production key/signing code remains local and dependency-free
apart from the existing bundled cryptographic library.
