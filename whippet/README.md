# SafeCore wallet guide

Local-first Android and browser wallet for **BELLS, BTC, DINGO, DOGE, LTC, PEP, SHIC and WHT**.
Keys and signing stay on-device. This is unaudited development software; keep
independent backups and use expendable amounts.

For downloads and a quick overview, start with the [main README](../README.md).
This guide covers recovery, fees, limits and developer setup for the current
source. Check release notes for the features in a particular APK.

## Contents

- [Architecture and trust boundaries](#architecture-and-trust-boundaries)
- [Wallet creation, recovery and protection](#wallet-creation-recovery-and-protection)
- [Receiving and address discovery](#receiving-and-address-discovery)
- [Balances, activity and valuation](#balances-activity-and-valuation)
- [Sending and QR scanning](#sending-and-qr-scanning)
- [Local storage, backup and deletion](#local-storage-backup-and-deletion)
- [Browser operation](#browser-operation)
- [Android operation](#android-operation)
- [Testing and troubleshooting](#testing-and-troubleshooting)

## Architecture and trust boundaries

The Android app bundles the same wallet code as the browser preview; it does not
load a hosted wallet page. Recovery secrets and signing remain local.

Electrum services supply history, balances and unspent outputs. SafeCore checks
chain identity and previous transactions, but is **not an SPV-proof client**.
Price queries contain no wallet data. Neither address caching nor displayed
balances authorize spending.

Amounts use exact integer base units. Network results are scoped to the current
wallet; switching or locking invalidates pending work. Public caches are separate
from recovery secrets, and storage writes are coordinated across browser tabs.

Navigation is Overview, Receive, Send, Activity and Settings. New wallets start
with no coins shown; **Add coins** controls visibility without changing keys or
disabling discovery. Settings contains appearance, privacy, authentication and
connection controls.

## Wallet creation, recovery and protection

### Creation

- Generate 12 or 24 English BIP39 words using cryptographic randomness.
- Password protection and the separate BIP39 passphrase are optional, off by default.
- Creation requires acknowledging the importance of recovery backups.
- Persist the wallet before displaying its generated words. Failed persistence
  must show an error, not claim success.
- Navigation, reload or backgrounding hides displayed words without deleting a
  successfully saved wallet.

The planned production onboarding requires writing down and verifying recovery
words before activation. That word-verification gate is **not implemented yet**.
Automatic saving in this build is not a substitute for an independent backup.

### Restoration

Accept a valid English BIP39 phrase, a supported protected/unprotected JSON
backup, or the supported legacy Whippet backup format. Manual restore accepts
standard BIP39 word counts and validates dictionary membership, count and checksum.
The creation-only acknowledgment is not required on Restore.

Restore has a dedicated full-page editor with empty numbered word fields and
12/15/18/21/24-word lengths. A local on-screen keyboard highlights possible next
letters without showing a predicted-word strip. Complete unambiguous words
advance automatically; words that can still grow (such as `act` → `action`)
wait for Space, Enter or **Next word**. Backspace sits at the right of the bottom
letter row. The page and keyboard stay anchored; the entry pane scrolls only as
needed. There are no prefilled words or automatic guesses. Hardware typing and pasting
a full phrase into the first field also work. Filled extra words must be cleared
before reducing the word count; missing slots never silently shift later words.

Validation uses the bundled 2,048-word list. No recovery draft is saved or sent
to a server. Back, navigation, backgrounding and idle lock clear unfinished
entry. Advanced settings contain backup-file import, the optional wallet name,
extra BIP39 passphrase and local password lock. These do not change the existing
derivation or encryption formats. Submit-time checksum validation still runs if
a disabled control is bypassed. Komodo uses the same numbered layout with separate
legacy validation and exact-text handling.

Unprotected backup recipes are checked before staging. Encrypted recipes are
checked after decryption. After successful restore, all supported coin scans
start on Overview; the first validated balances are displayed without the
subsequent-change reporting delay.

A checksum-valid phrase is not proof that it is the intended wallet. A different
valid phrase or BIP39 passphrase creates different addresses. Compare a known
receiving address after restoration. Core `wallet.dat` files are not supported.

### Derivation contract

| Coin | P2PKH version byte | Receive path |
| --- | --- | --- |
| Bellscoin (BELLS) | 25 / `0x19` | `m/44'/762'/0'/0/{index}` |
| Bitcoin (BTC) | 0 / `0x00` | `m/44'/0'/0'/0/{index}` |
| Bitcoin Cash (BCH, CashAddr) | 0 / `0x00` | `m/44'/145'/0'/0/{index}` |
| Bonkcoin (BONC, legacy opt-in) | 25 / `0x19` | `m/0'/0'/{index}'` |
| Catcoin (CAT, legacy opt-in) | 21 / `0x15` | `m/44'/760'/0'/0/{index}` |
| Dash (DASH) | 76 / `0x4c` | `m/44'/5'/0'/0/{index}` |
| DigiByte (DGB) | 30 / `0x1e` | `m/44'/20'/0'/0/{index}` |
| Dingocoin (DINGO) | 30 / `0x1e` | `m/44'/3'/0'/0/{index}` |
| Dogecoin (DOGE) | 30 / `0x1e` | `m/44'/3'/0'/0/{index}` |
| Flopcoin (FLOP, legacy opt-in) | 35 / `0x23` | `m/44'/3'/0'/0/{index}` |
| Junkcoin (JKC, legacy opt-in) | 16 / `0x10` | `m/44'/2013'/0'/0/{index}` |
| Litecoin (LTC) | 48 / `0x30` | `m/44'/2'/0'/0/{index}` |
| Luckycoin (LKY, legacy opt-in) | 47 / `0x2f` | `m/44'/790'/0'/0/{index}` |
| Pepecoin | 56 / `0x38` | `m/44'/3434'/0'/0/{index}` |
| Ravencoin (RVN) | 60 / `0x3c` | `m/44'/175'/0'/0/{index}` |
| Shibacoin (SHIC) | 63 / `0x3f` | `m/44'/4474'/0'/0/{index}` |
| TrumPOW (TRMP) | 65 / `0x41` | `m/44'/1707'/0'/0/{index}` |
| Whippet | 73 / `0x49` | `m/0'/3'/{index}'` |

### Bellscoin (BELLS)

Uses the registered BIP44 coin type 762: `m/44'/762'/0'/0/{index}`.
Receiving keys are compressed legacy P2PKH (version 25), with WIF version 153.
Sending also accepts Bellscoin P2SH and established SegWit/Taproot destinations.
The P2SH prefix overlaps Dogecoin P2PKH: an address checksum cannot distinguish
those networks, so confirm with the recipient that the destination is for BELLS.
Mining outputs require 30 confirmations. Komodo recovery remains PEP/SHIC only.

Bellscoin's default connection is an HTTPS Esplora-style API adapter, not a
public Electrum socket. It verifies genesis, preserves integer base units,
pages history, resolves missing output heights and verifies raw previous
transactions before spending. Requests have deadlines, bounded response sizes,
no credentials/referrers and at most four concurrent HTTP requests. Broadcasts
are attempted once; a lost response retains the uncertain-send safeguard.
This is not full-node/SPV validation: a server can still omit data or misreport
confirmation heights. There is no verified independent default backup server.
Settings can select a user-supplied, tested Electrum WSS server instead.

Fees are automatic and size-based. A valid six-block API estimate is used when
available, never below the Core wallet minimum of 10 sat/byte. An empty estimate
table uses that minimum and is identified in Send; an unavailable or invalid
response does not authorize a fallback spend. Rates above 1,000 sat/byte and
total fees above 0.01 BELLS are blocked. The all-coin USD safeguards also apply.

The offline tool uses the same path and supports `bellscoin-seed-v1` bundles and
SafeCore plain/encrypted JSON. Old SafeCore backups remain compatible. Nintondo's
older wallet used coin type 0, so its phrase alone may not restore the same
addresses here; always compare a known address. This is a coin wallet, not an
inscription/collectible wallet: do not import wallets holding Bellinals or tokens
whose outputs must be preserved. The bag icon comes unchanged from Bells Core;
its source revision and upstream notice are bundled with the asset.

References: [Bells Core chain parameters](https://github.com/BellsChain/bellscoin/blob/fccdc6736fe81abc0b2b175bdacc58369c08845b/src/kernel/chainparams.cpp),
[Core wallet fee policy](https://github.com/BellsChain/bellscoin/blob/fccdc6736fe81abc0b2b175bdacc58369c08845b/src/wallet/wallet.h),
[coinbase maturity](https://github.com/BellsChain/bellscoin/blob/fccdc6736fe81abc0b2b175bdacc58369c08845b/src/consensus/consensus.h),
[SLIP44 registry](https://github.com/satoshilabs/slips/blob/master/slip-0044.md).

### Bitcoin (BTC)

BTC uses legacy P2PKH receiving addresses on `m/44'/0'/0'/0/{index}`, WIF 128
and eight decimals. Missing BTC paths in old SafeCore backups adopt this fixed
path; explicit alternate paths are rejected. Existing addresses/passwords stay
unchanged. This is not BIP49/84/86, multisig or Electrum-seed discovery. Change
returns to the first receiving address as with the existing sender.

Recipients may use mainnet P2PKH, P2SH, SegWit v0 or Taproot v1/32-byte addresses.
Wallet-owned inputs and WIF sweeps remain legacy P2PKH. Other witness versions,
testnet addresses and Komodo recovery are rejected. WIF sweeps do not discover
SegWit outputs for that key. Ordinals/tokens are not detected or preserved.

Fees use a six-block Electrum estimate with a conservative 1 sat/byte floor,
a 100 sat/byte rate ceiling and 0.001 BTC total-fee ceiling. These are application
safety limits, not Bitcoin consensus rules. Fees are proportional to estimated
legacy bytes, never a 0.01 BTC flat fee. Minimum outputs are conservatively 546
satoshis; coinbase maturity is 100 confirmations. Missing/invalid/over-limit
estimates leave balances visible but block spends/sweeps until a fresh estimate.
Sweeps retain the 25% cushion and pre-broadcast fee recheck. No RBF/CPFP UI is
implemented, and an estimate is not a confirmation guarantee.

The default and backup WSS servers passed live genesis/height/fee checks.
The automatic fallback shares an operator with the primary server; this is not
independent-operator redundancy or an uptime guarantee. BTC uses CoinGecko for
display values and the USD fee safety check.
Offline JSON/WIF/TXT/CSV exports work without network access. Real BTC receive/send
testing remains pending; no real transactions were broadcast by automated tests.

References: [Bitcoin Core v30.0](https://github.com/bitcoin/bitcoin/tree/v30.0),
[BIP44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki).

#### Local Bitcoin verification

```sh
BITCOIND_BIN=/absolute/path/to/verified/bitcoind node whippet/tests/bitcoin_core.cjs
```

Run from the repository root after verifying the Core executable using its
[official download instructions](https://bitcoincore.org/en/download/).
Verified locally with Bitcoin Core 30.4. The test disables peer networking, uses
only a public disposable recovery fixture and fake coins, checks all supported
destination types plus Max/multiple inputs and tamper rejection. It compares
Core's independently calculated fees with the reviewed input/output difference,
checks actual signed sizes at 1–100 sat/byte, tests tiny/normal/Max totals and
full-balance sweeps with their fee cushion, and mines a local confirmation.
It never attaches to an existing node and removes its own
temporary chain afterward. This validates transaction/address compatibility,
not a funded mainnet end-to-end test or an independent security audit.

### Bitcoin Cash (BCH)

Uses CashAddr and replay-protected ForkID signatures, with a post-fork chain
checkpoint and automatic size-based fees. Native BCH only; no CashTokens/SLP.
See [chain-specific verification and limits](docs/layer1-validation.md).

### Bonkcoin (BONC) — opt-in legacy asset

Native proof-of-work Bonkcoin, not Solana BONK. Hidden by default. Enable it in
**Settings → Legacy assets**, then test and use a custom secure Electrum
connection in **Network connections**. There is no default server, fallback,
explorer link or price feed. Enabling the switch alone makes no BONC queries and
does not enable receiving/sending. Every connection verifies BONC's genesis before
address queries. Disabling the asset closes its connection, cancels pending
reviews and hides it without deleting its saved endpoint or recovery material.

SafeCore uses BIP39 with the explicit recipe `m/0'/0'/{index}'`, compressed P2PKH
version 25, P2SH version 28 and WIF version 151. This path follows the actual
[Core child derivation code](https://github.com/Bonkcoin/Bonkcoin-core/blob/d7a036ff48473622bb08f1c133c4af08df3cb518/src/wallet/wallet.cpp),
not its inconsistent `hdKeypath` metadata, which says `m/0'/3'/…`.
Core uses a random master seed, not BIP39: a Core `wallet.dat` is not recoverable
from SafeCore words. This is SafeCore's documented BONC recipe, not a claim of
compatibility with other mnemonic wallets. The offline tool supports plain and
encrypted SafeCore JSON plus `bonkcoin-seed-v1` bundles. Existing coin paths and
stored wallet files are unchanged; mismatched explicit BONC paths are rejected.

Automatic fees use exact transaction size at a minimum of 0.01 BONC/kB or the
fresh live relay rate, whichever is higher. A valid six-block estimate can raise
that rate. An explicit `-1` estimate uses the Core/relay minimum; malformed,
failed or oversized estimates block spending. Recipient/change minimum: 0.01
BONC; maximum rate: 0.1 BONC/kB; total-fee cap: 0.1 BONC. No override. Mined
outputs require 240 confirmations; the transaction value limit is 10 billion
BONC. No SegWit or Komodo recovery. BONC and Bellscoin share their P2PKH version,
so a bare address cannot prove which coin the recipient expects.

Chain identity and address versions were cross-checked against
[Bonkcoin Core](https://github.com/Bonkcoin/Bonkcoin-core/blob/d7a036ff48473622bb08f1c133c4af08df3cb518/src/chainparams.cpp)
and its [ElectrumX implementation](https://github.com/Bonkcoin/electrumx-bonc/blob/5dc841963c802c158676066f61dd071b1bf63cbd/electrumx/lib/coins.py).
Independent key/WIF/signature tests and synthetic Electrum/send tests cover the
local implementation. No working public server or funded BONC mainnet transfer
has been verified. Test only expendable amounts after configuring a trusted node.

### Catcoin (CAT) — opt-in legacy asset

Enable in Legacy assets and test your own secure WebSocket Electrum server.
The verified public TLS server is not a WebSocket endpoint. Catcoin uses the
Electrum-CAT BIP39 legacy path shown above, compressed P2PKH keys and WIF 149.
Native Electrum seed phrases are not BIP39 and are not accepted as substitutes.
Sends use automatic size-based fees with a 0.01 CAT/kB minimum, 0.1 CAT/kB rate
cap, 0.1 CAT total cap, 0.000546 CAT dust floor and 100-block mining maturity.
No SegWit/MWEB destinations or Komodo recovery are enabled. Offline recovery works
without a server. See the chain-specific validation notes for sources and limits.

### Dash (DASH)

Standard Dash receiving and sends, automatic fees, and special-transaction prevout
parsing. No Platform accounts or CoinJoin. See [verification and limits](docs/layer1-validation.md).

### DigiByte (DGB)

Legacy BIP44 receiving, P2SH/SegWit destinations and automatic fees. No DigiAsset
support; metadata-bearing prevouts are blocked. See [verification and limits](docs/layer1-validation.md).

### Dingocoin (DINGO)

Uses `m/44'/3'/0'/0/{index}`, matching the
official Dingocoin browser wallet/recovery tool: compressed P2PKH version 30,
P2SH version 22 and WIF version 158. SegWit destinations and Komodo recovery
are not supported. Mined outputs require 240 confirmations. The offline tool
supports `dingocoin-seed-v1` bundles and existing plain/encrypted SafeCore JSON.

DOGE and DINGO share genesis, their address format and this derivation path.
The same seed therefore produces matching address text, **not shared funds**.
Every DOGE connection checks the pinned Dogecoin block 104679; every DINGO
connection checks Dingocoin block 1 before address queries or broadcasts.
Balances, history/cache records, send attempts and connection settings remain
keyed by coin. Changing the Send asset clears its draft and review. An address
checksum cannot identify which of these coins a recipient expects. These checks
prevent accidental chain mixups, not a malicious server lying about chain data;
SafeCore is not a full node or SPV verifier.

Three verified public WSS endpoints use the existing failover/cooldown logic.
Custom connections remain pinned. Only public hashes and signed transactions
leave the device, and a broadcast is never automatically retried.

DINGO fees are automatic at the greater of 1 DINGO/kB, the current relay rate and
a valid six-block estimate. Electrum's explicit `-1` (no estimate) uses the
fresh relay rate/Core minimum; malformed responses, errors or timeouts do not
authorize a fallback spend. Unlike BTC/LTC/BELLS, the billed size rounds **up to
whole kilobytes**, as Dingocoin Core requires. Recipient and change outputs must
be at least 1 DINGO. A small remainder triggers a Max hint rather than silently
increasing the fee. Rates over 10 DINGO/kB and total fees over 20 DINGO are blocked.
The ordinary planner selects at most eight inputs; no manual 1-coin override.
Sweeps apply the existing 25% cushion to the whole-kB requirement. Live relay
rates are checked again against the signed transaction; a higher requirement
stops the send instead of changing the approved fee. The all-coin USD safeguards also apply.
Core's 10-billion-DINGO per-transaction amount limit is enforced.

References: [pinned Core parameters and checkpoints](https://github.com/dingocoin/dingocoin/blob/c3c396cb71b55a3864a00badb6a24142179848bd/src/chainparams.cpp),
[fee rounding](https://github.com/dingocoin/dingocoin/blob/c3c396cb71b55a3864a00badb6a24142179848bd/src/amount.cpp),
[dust rule](https://github.com/dingocoin/dingocoin/blob/c3c396cb71b55a3864a00badb6a24142179848bd/src/primitives/transaction.h),
[official wallet recovery format](https://github.com/dingocoin/dingobrowserwallet).

### Dogecoin (DOGE)

DOGE uses BIP44 coin type 3, P2PKH version 30, P2SH version 22 and WIF version
158, with eight decimals. Existing backups without `paths.doge` derive the fixed
path above; explicit alternate paths are rejected. Existing coin addresses and
protection preferences are unchanged. Asset lists are alphabetical by coin name.
A previously hidden DOGE entry stays hidden; enable it through **Add coins**.

Ordinary small sends retain the reviewed 0.01 DOGE fee, 0.01 DOGE minimum output
and 1,000-byte limit. An optional, default-off 1 DOGE total-fee checkbox supports
up to 40 verified inputs within the documented bounds. Sweeps use at least 0.01 DOGE/kB proportionally plus the
existing 25% cushion. Mining rewards require 240 confirmations. No SegWit or
Dogecoin token/inscription handling is implemented. Coin-specific genesis checks,
raw-prevout verification and uncertain-broadcast protection remain mandatory.

The default and backup WSS servers passed live metadata checks. Both share an
operator, so the automatic fallback is not independent-operator redundancy or
an uptime guarantee. DOGE quotes
share the display-only CoinGecko request with SHIC/LTC. Offline JSON/WIF/TXT/CSV
recovery makes no network requests. A real DOGE receive/send test is still needed.

Network parameters, icon and fee guidance: [Dogecoin Core](https://github.com/dogecoin/dogecoin/tree/b38c83fbf10302b23ac6e7ad89bc83068efe2fd8),
`src/chainparams.cpp` and `doc/fee-recommendation.md`.

### Flopcoin (FLOP) — opt-in legacy asset

FLOP uses compressed P2PKH version 35, P2SH 22, WIF 158 and the BIP39 path
`m/44'/3'/0'/0/{index}`, following the Komodo coin registry's HD coin type.
This is not the non-BIP39 Komodo sweep recipe; no Komodo sweep is enabled.
Both published WSS servers were unreachable, so a tested custom endpoint is
required. Automatic fees use a 0.01 FLOP/kB floor and 0.1 FLOP rate/total caps,
0.01 FLOP dust and 240-block mining maturity. No verified USD feed is configured:
sending requires the explicit missing-price acknowledgment. Offline recovery works
without a server; this does not restore Core's random-seed wallet.dat from words.

### Junkcoin (JKC) — opt-in legacy asset

Enable in Settings → Legacy assets and test a custom secure Electrum connection.
No default endpoint is configured. Automatic fees, registered BIP44 receiving and
offline recovery are supported. See [verification and limits](docs/layer1-validation.md).

### Litecoin (LTC)

LTC receives to legacy BIP44 `L…` addresses with compressed keys and WIF version
176. Existing backups without an LTC path use the fixed path above; explicit
alternate paths are rejected. Existing coin addresses and format names do not change.
This is not automatic discovery of BIP49/BIP84 accounts or other wallets' change branches.

Sending accepts checksum-validated Litecoin P2PKH, P2SH (`M…` and legacy `3…`),
native SegWit v0 and Taproot v1 addresses. Legacy `3…` addresses share Bitcoin's
version byte, so the encoding alone cannot prove the intended chain. Confirm
the recipient requested Litecoin. Future witness versions and MWEB privacy
addresses are rejected. No MWEB keys or private balances are generated/scanned.
When checking a transparent previous output, its Litecoin txid excludes witness
and MWEB extension data, matching Core's `ComputeHash`; the extension is not
interpreted or used for signing. Recognized HogEx withdrawals require six
confirmations; mining rewards require 100. Only legacy wallet inputs are signed.

The default and backup WSS servers passed certificate, genesis, height and
read-only RPC checks during local integration. They share an operator, so the
automatic fallback is not independent-operator redundancy or an uptime guarantee.
Users can test/select a different WSS server in Settings.

LTC fees use a six-block Electrum estimate, at least the live relay minimum
and 1,000 litoshis/kB, calculated proportionally by byte, with a
100,000-litoshi/kB rate cap and a 0.001 LTC total-fee cap. The conservative output
minimum is 5,460 litoshis; small change handling remains explicit. LTC does not
use the other coins' 0.01 flat fee. Sweeps retain the 25% fee cushion and absolute
LTC fee cap. Missing or invalid estimates block sends/sweeps without hiding balances.
Price estimates use CoinGecko's `litecoin` ID in the same four-minute
public request as SHIC, with per-asset validation and expiry. No wallet data is sent.
The offline tool supports LTC JSON/WIF/TXT/CSV without network requests.

Parameters and logo source: Litecoin Core revision
`ec1b6489a900d09cf5991e220dce089c77a232a2`, `src/chainparams.cpp`,
`src/policy/policy.h`, `src/consensus/consensus.h` and
`src/primitives/transaction.cpp`. Test.19 promotes the local LTC integration.
Automated checks passed; real-funds LTC receive/send testing remains pending.

### Luckycoin (LKY) — opt-in legacy asset

Requires an enabled legacy option and tested custom Electrum connection. Uses the
revival chain's replay-protected signatures, not legacy-chain signing. Automatic
fees and offline recovery are supported. See [verification and limits](docs/layer1-validation.md).

### Pepecoin (PEP)

Pepecoin is the native PEP proof-of-work chain, not an Ethereum token. It uses
eight decimals, compressed legacy P2PKH receiving addresses on the path above,
and WIF version 158. Standard sends and private-key sweeps verify previous
transaction outputs and sign locally. Newly mined block rewards (coinbase outputs)
have a 240-block maturity rule in
[Pepecoin Core](https://github.com/pepecoinppc/pepecoin/blob/master/src/chainparams.cpp).
SafeCore waits for 240 confirmations before spending those outputs. This does
not apply to ordinary incoming transfers or typical mining-pool payouts;
ordinary outputs become eligible after one confirmation, subject to the other
send checks.
The default fee for ordinary small sends is 0.01 PEP; the optional 1 PEP total-fee
checkbox supports larger input sets within the documented limits.

Pepecoin has a default server and an automatic fallback. Connections
validate the pinned Pepecoin genesis; a fallback is not an uptime guarantee.
PEP/USD and USD/USDT display estimates use Kraken. The offline recovery tool
supports PEP JSON/WIF/TXT/CSV, and legacy Komodo recovery is opt-in for PEP/SHIC
only. This does not discover unrelated derivation paths or Core wallet.dat files.

### Ravencoin (RVN)

Native RVN only, with BIP44 receiving and automatic fees. Issued/restricted assets
and NFTs are not supported. See [verification and limits](docs/layer1-validation.md).

### Shibacoin (SHIC)

Shibacoin is the native SHIC proof-of-work chain, not the SHIB token. Its mainnet
parameters were checked against Shibacoin Core revision
`0af632dfa466c62d77a1b9a4358cf4d64d1fbd4b` (`src/chainparams.cpp`,
`src/amount.h`, and `doc/fee-recommendation.md`) and SLIP-0044 coin type 4474.
SHIC uses a third-party WSS server by default.
Certificate validation and the pinned genesis
`ff271edcc83f7d71e7a4e4b0a43b386a188e1470a28671cdbdc47e900118ac7f`
are mandatory. This server is not operated by SafeCore; availability and chain
reports remain third-party dependencies. Custom WSS connections remain available.
No SHIC node/indexer deployment is included in this change.

SHIC uses eight decimal places, compressed P2PKH addresses, WIF version 158 and
the existing conservative fee/dust/maturity guards. Old SafeCore JSON backups
without a SHIC path derive this fixed path; an explicitly different SHIC path is
rejected. PEP/WHT paths, wallet IDs and existing backup format names are unchanged.
The offline recovery tool supports SHIC JSON, WIF/TXT and CSV without networking.

Ordinary small sends default to 0.01 SHIC. The optional 1 SHIC total-fee checkbox
supports larger input sets within the documented bounds; it starts off and does
not change sweep fees. Legacy Komodo recovery is opt-in for PEP and SHIC only.

SHIC USD estimates come from CoinGecko's `shibacoin` ID, normally once per
four minutes while the wallet is unlocked/foregrounded, with one-minute retries
after failed requests. The request contains no
wallet address, balance, seed or credentials. CoinGecko sees the client's IP.
Missing, malformed, future-dated or more-than-ten-minute-old provider quotes are
rejected; fetched quotes expire for fee checks after five minutes. HTTP failures
and rate limits leave coin balances unaffected. Saved display prices remain
visible with a persistent last-known age once stale; stale fee quotes require
the explicit per-review acknowledgment. USDT conversion uses the same Kraken
USD/USDT quote as PEP; no 1:1 USD/USDT assumption is made.
Native HTTP access remains restricted to the exact public quote requests;
remote scripts remain blocked. SHIC support is included in test.18; earlier APKs remain unchanged.

### TrumPOW (TRMP)

TrumPOW is the independent proof-of-work chain, not a TRUMP token. It uses
compressed P2PKH keys, WIF 151 and the SLIP-0044 path shown above. One default
WSS server was verified; the other listed server was unavailable and is not used
as a pretend backup. Fees are automatic by serialized size: minimum 0.01 TRMP/kB,
rate/total caps of 0.1 TRMP, and a 0.01 TRMP dust floor. Coinbase maturity is 240
blocks. No Komodo recovery. The offline tool supports the same recipe.

### Whippet (WHT)

Whippet preserves its legacy hardened receiving path `m/0'/3'/{index}'`,
P2PKH version 73 and WIF version 158. It uses eight decimals and legacy P2PKH
wallet inputs. Old generator backups and offline JSON/WIF/TXT/CSV recovery remain
compatible with that path. Assets/covenants and legacy Komodo recovery are not
supported. Mining rewards require 240 confirmations.

Ordinary small sends keep the 0.01 WHT default. The optional 1 WHT total-fee
checkbox is separate, off by default, and intended for larger input sets.
Existing proportional sweep fees and their review remain unchanged. There is
currently no configured Whippet explorer or reliable USD price feed.

Whippet has one default WSS server. No second public server has been verified;
retries are not independent redundancy.
Users can choose their own WSS server in Settings.

### Recovery-path compatibility

The displayed Address #1 is derivation index 0. Whippet's hardened receive path
is intentionally preserved for legacy compatibility. Do not change these paths,
formats or address versions as a cosmetic rename.

The wallet can check indices **0–199** per coin; routine discovery starts with a
20-address lookahead and full Rescan checks the 200-address pool. Other accounts,
indices beyond that pool and external change branches are not discovered. Compatibility with another
wallet depends on its exact derivation recipe, not simply its use of BIP39.

Coinomi accepts compatible recovery phrases on supported networks; the address
derivation and any extra BIP39 passphrase must match. Confirm a known receiving
address after restoring. This is not a claim that every SafeCore asset or address
path is supported by Coinomi; Whippet uses the legacy path listed above.
See [Coinomi's migration guidance](https://coinomi.freshdesk.com/support/solutions/articles/29000009716-migrating-from-other-wallets-into-coinomi)
and [backup/restore guidance](https://coinomi.freshdesk.com/support/solutions/articles/29000019254-how-can-i-back-up-my-wallet-what-happens-if-i-lose-my-phone-).

### Passwords and secrets

The wallet password encrypts the saved recipe; it is not the BIP39 passphrase.
Protected vaults use AES-256-GCM with PBKDF2-HMAC-SHA256 at 600,000 iterations,
a random 16-byte salt and a random 12-byte nonce. The password is not stored.
The encrypted payload includes the phrase, BIP39 passphrase and derivation paths.

With password protection off, the recovery recipe is **plaintext** in browser
local storage and in unprotected exports. Starting in test.17, Android adds
device-bound encryption for every saved wallet, including password-free wallets.
Public balance/history metadata remains plaintext. Export formats are unchanged.

Protected wallets require their password to unlock, reveal their seed again,
or confirm a send. Each saved wallet retains its own protection choice.
Protected wallets lock after two minutes of inactivity and on backgrounding.
Revealed recovery information hides on backgrounding or inactivity in either mode.
Without a wallet password or Android device authentication, wallets reopen
automatically; hiding their screen is not protection.

Starting in test.17, Android supports optional device authentication using the
phone's screen-lock credential or a supported strong biometric. It protects all
saved wallets on that installation, independently of each wallet's password.
First-wallet setup defaults it on when a secure screen lock exists; later opt-outs
are preserved. Enabling or disabling it requires OS authentication, as do returning
from the background, revealing recovery words, exporting and confirming a send
while it is enabled. Keep a separate recovery backup: removing the phone's screen
lock can invalidate the device-bound key.

Secrets exist in JavaScript memory during recovery, derivation and signing.
Garbage collection does not guarantee zeroization. Android storage encryption uses
a non-exportable Keystore key; hardware backing depends on the device. Wallet
private keys still enter app memory for signing: this is not hardware-wallet
transaction signing or protection against a compromised running process.
An independent security audit has not been completed.

## Receiving and address discovery

Receive starts with no asset selected. Choose a coin before an address, QR code,
copy button or previous/next navigation appears. Once selected, only that coin
is shown; return to Overview before choosing another. Only enabled, implemented coins
can receive, including coins with zero balance. This choice is independent of
Overview and Send and resets when leaving Receive; address-pin preferences do not.
Tapping a supported coin row on Overview opens its asset screen, with a larger
icon, centered balance and estimated value. Receive and Send on that screen
explicitly choose that coin. The bottom Receive tab still starts without a selection.

An address becomes used when history is detected, not when displayed or copied.
Receiving advances to the next unused address after a payment is observed.
Previously used addresses remain accessible and are not recycled after spending.
At the end of the bounded pool, receiving stops rather than inventing coverage.

Once unlocked, Receive can show a locally verified address immediately, even
while offline or waiting for history. This proves wallet ownership, not that
the address is unused. The screen notes when history refresh is pending; a
later history result may advance the current address. Older addresses still work.

A versioned local cache stores the 200 public keys and addresses per asset,
bound to the wallet ID, network parameters, paths and recovery data with HMAC-SHA256.
Its domain-separated authentication key is derived only while unlocking and is
never stored. Cached public-key/address pairs and scope are validated before use;
altered, corrupt or mismatched caches are regenerated from the unlocked wallet.
No seed, private key, extended key or chain code is added to this cache. It is
bounded to three wallets, optional when storage is unavailable, and removed for
a wallet when that wallet is deleted. Public cache data can reveal address links.
This prevents storage-only cache substitution when recovery secrets remain
protected; it does not defend against compromised app code/OS or someone who
already has the recovery phrase (including readable unprotected browser storage).

**Keep using the first address** pins both the displayed address and its QR to
index 0 until unchecked. The setting is per wallet and coin. It does not stop
monitoring other previously used addresses. Change currently returns to index 0.
The setting is saved locally and survives restarts and in-place APK updates.
Uninstalling or clearing app data removes it. Seed recovery and current wallet
backup files restore keys, not this local preference; select it again afterward.

Each wallet load or unlock performs one full scan of receiving indices 0–199
(200 addresses) per coin, even when saved balances are available. Failed initial
scans retry while the wallet is unlocked and visible; only a successful scan
completes that asset's initial discovery. Overview's **Rescan** also checks all
200 addresses on demand. These scans use batches of ten, not 200 simultaneous
requests.

Initial discovery quietly updates the UI after each 20 verified addresses while
the rest of the scan continues. There are no progress banners or completion
alerts. Receive shows locally verified ownership without waiting for history;
Send selection remains available, but spending waits for completion. Incomplete checkpoints are display-only, never saved
as a completed balance cache or accepted for spending. Previously cached balances
remain in unvisited rows until checked, avoiding a temporary zero on reopening.
Each asset scans independently. Wallet switches, locking and app backgrounding
invalidate in-flight work; unopened/password-locked wallets are not decrypted
or scanned behind the user's back.

After initial discovery, routine monitoring uses a window starting at 20 receiving
addresses and extends in batches of 10 as the highest used index reaches the
final ten addresses of the window, up to index 199. It monitors all earlier addresses, including
empty gaps, and never forgets an ever-used address because its balance is zero.
Legacy 20-row caches expand without treating unknown rows as checked history.

Electrum subscriptions deliver status changes; unchanged live rows are reused.
Statuses are reconciled roughly every 30 seconds while active, on reconnect,
and before accepting a pending balance change. Roughly every 30 seconds an additional
batch of ten addresses is probed beyond the initial range, cycling through the
200-address pool. Overview's **Rescan** immediately checks the entire range in
batches of ten (at most 30 balance/history/UTXO requests concurrently per coin).
No sweep key is involved in wallet discovery. Lock/background stops normal scans.

When all 200 addresses have been used, Overview and Receive display an address
capacity warning. No new address is issued beyond the cap. Existing addresses,
including the pinned first address, still work. Create another wallet for fresh
addresses; do not infer that a seed has no funds beyond this discovery boundary.

This is not general gap-limit recovery. Funds sent to unmonitored paths or
indices may not appear. The balance is the sum of monitored addresses, not a
claim to find every possible balance derived from a seed.

## Balances, activity and valuation

Visible, unlocked Overview, Send and Activity refresh all supported coins about every
4 seconds. Receive refreshes its selected coin. Locking or backgrounding stops
normal scanning; reopening resumes it.

A scan checks history, balances and unspent outputs. Duplicate transaction IDs,
duplicate outpoints, inconsistent totals and invalid responses are rejected.
Partial failed scans are not published as successful snapshots.

The first validated balance is shown immediately, including a genuine zero.
Subsequent changed confirmed/pending totals must remain consistent for at least
4 seconds and be observed again in a fresh query. A timer alone never publishes
an old candidate. Changed candidates or failed refreshes restart that window.

Accepted totals are cached per saved-wallet identifier and coin. Reloads show a
last-known balance with its original timestamp. Missing/corrupt cache means
unknown (`*`), not zero. Cache validation checks the derived address pool.
Cached unspent outputs are discarded and never authorize signing. Send review
requires fresh, accepted data; unsettled changes block review until rechecked.

Activity includes server history and locally recorded submitted/uncertain sends.
An unconfirmed or unknown submission is not automatically assumed failed.
Each supported asset has a collapsed header and shows all 10 transactions on its
selected history page, without an inner scroll area. Borderless Previous/Next
controls and a jump-to-page field sit below the history. All
loaded history is accessible, newest first. Locally outstanding sends stay above
the paged list. Refreshes preserve open sections, scroll positions, selected pages
and focused page-entry drafts; shrinking history clamps to the last valid page.
Page selections are per coin and reset when the wallet is locked or changed.
Valid transaction IDs link to the matching chain:
PEP keeps `pepecoinservice.org/explorer/tx/`, BTC uses `mempool.space/tx/`,
DOGE uses `dogechain.com/tx/`, LTC uses `litecoinspace.org/tx/`, and SHIC uses
`explorer.shibacoinshic.org/tx/`. WHT IDs remain plain text because no explorer is
configured. Both history entries and locally outstanding sends use these links.
Explorer pages open only after a user click, in an external browser rather than
the wallet WebView. Android allows only the exact HTTPS hosts and transaction-path
formats, with no query, fragment, custom port or user info. IDs must be 64 hex
characters. No explorer request is made during refresh; following a link shares
that public transaction ID and the user's IP with the explorer.

Wallet value is cumulative for the active saved wallet, independent of selected
or hidden coins. The estimate converts supported coin/USD prices using the
USDT/USD quote; USDT is not assumed to equal one dollar. It is an estimate, not a
USDT account. Zero balances are excluded. Positive unpriced holdings make the
estimate incomplete (`*`), not worth zero. Whippet currently has no price feed.

Overview requests Kraken prices at most once per minute and the combined
CoinGecko quote normally once per four minutes, before its five-minute freshness
deadline. Failed requests retry at most once per minute. Valid PEP and USDT
quotes are retained independently, so a missing field cannot erase every price.
After five minutes without a fresh quote (or when its provider timestamp is too
old), the overview shows **Last known · 7 minutes ago**, advancing through hours,
days, months and years. The displayed age uses the older of the coin price and
USDT conversion timestamps. The wallet total uses its oldest contributing price.
Original public values and timestamps are saved locally and survive restarts;
failed refreshes never renew them. No wallet identifiers are saved with prices.
This display cache is untrusted and is never loaded into live transaction-fee
quotes. Without any saved quote, the price remains unavailable; USD is never
silently substituted for USDT. Quotes still expire for fee checks after five minutes.
Fee review can request a missing/expired configured USD quote sooner, with at
least ten seconds between attempts and an eight-second request timeout. A missing
quote never changes the actual coin balance; sending without one requires the
explicit per-review risk acknowledgment described below.

## Sending and QR scanning

Send opens with no asset selected. Its asset picker shows supported coins with a
positive reported balance, even if hidden on Overview or without a market price.
Zero, unknown and coming-soon assets are not selectable. Pending and cached
balances are labeled; appearing in the picker does not establish spendability.
Coins remain selectable while discovery is running; spending still waits for
a complete, current scan and verified inputs.
After selection, a compact coin header stays above the form. **Change** opens
the asset list with an explicit selected marker; **Close** keeps the current
coin and draft. The form is hidden while choosing, and its receiving-address
label names the selected coin. Balance refreshes update existing picker rows
instead of replacing buttons during a tap.
Switching assets clears the recipient, amount and quote, stops any camera scan,
and invalidates late callbacks. Leaving Send or switching wallets clears its
selection. Background balance updates do not replace an in-progress send form.

### Transaction flow

1. Open Send in the bottom bar and choose the asset. Create/restore or unlock a
   wallet first if needed. Overview only shows wallet value and the coin list.
2. Enter or scan a recipient and enter the **Total to spend**, including the fee.
3. Refresh spendable inputs and compute recipient amount, fee and change.
4. Review the coin, complete address, recipient amount, network fee and total deduction.
5. Explicitly confirm. Protected wallets require their password again.
6. Recheck live inputs, sign locally, record the input reservation, then broadcast.

Reviews expire after 90 seconds. A QR scan never signs, broadcasts, advances to
confirmation, or changes the amount. Opening the Send screen does not bypass
transaction checks.

There is one editable amount field. **Max** fills the total payment budget; it
does not turn that amount into a fee. BTC/LTC show a separate, read-only automatic
fee estimate. The verified fee rate is held in memory for up to five minutes
while this Send form stays open; changing transaction size or inputs can change
the calculated total fee. A fresh estimate replaces an expired one. The final
review still expires after 90 seconds and cannot outlive its fee quote.
Before broadcast the current relay requirement is checked against the signed
transaction size: if the approved fee is insufficient, sending stops and requires
a new review. Fees are never silently increased. Sweeps keep their separate fee
calculation and review rules.

All eighteen supported assets use eight coin decimals. Amount parsing, Max, fees and
signed outputs use integer base units, independent of market-price changes.
Values beyond the supported signed 64-bit output range or with excess decimals
are rejected. Fiat values are display estimates; very small positive unit prices
use scientific notation instead of rounding to zero, and positive totals below
one cent show `<0.01`. Assets with different precision need explicit transaction
support before they can be enabled; precision is never guessed from a price.

### Fee safety and USD limits

Every coin requires an explicit fee/address/amount acknowledgment and confirmation;
there is no automatic send. Every coin's ordinary sends, WIF sweeps and supported
Komodo sweeps use the same USD safeguards, independently of Overview's USDT valuation.
Normal fee reviews stay compact; threshold notices appear only when needed:

- Above **$5 USD**: a prominent high-fee warning; check the amount and confirm,
  or cancel and try again later.
- Above **$100 USD**: sending is blocked. The review shows the estimated coin/USD
  fee and suggests trying again later. **No override is offered.** Exactly $100
  is not above this limit, but other safety caps still apply.
- Missing, invalid or stale price: the USD value is unknown, never zero. A separate,
  unchecked override is shown **only** in this state. Explicitly acknowledge that
  the dollar fee could exceed $100 to proceed with this transaction, or try later.
  This choice is never saved or carried into another review. Whippet has no silent
  exemption. A fresh returning quote removes the override and reapplies both limits.
- Invalid/missing network fee estimates still block sending. No USD override can
  bypass the coin's fee-rate/total caps, live relay, input or signing checks.

Kraken PEP quotes use their fetch time. CoinGecko's per-coin USD quote must have been fetched less than five minutes ago,
with a provider timestamp no more than ten minutes old (at most 30 seconds ahead).
The quote is checked at review, confirmation, and immediately before reserving
inputs for broadcast. A newly high or increased high USD fee requires another
acknowledgment; a newly exceeded $100 cap blocks submission. Price expiry requires
a new explicit missing-price acknowledgment.
Thresholds use exact integer/decimal arithmetic, not rounded display dollars.
USD display rounds up to the next cent; positive sub-cent fees display as
`<$0.01 USD`. Price-provider errors or market changes
can still make the real-world cost differ; these are safeguards, not a guarantee.

BTC/LTC rates use `blockchain.estimatefee` with a six-block target, in whole coins
per 1,000 bytes, never coins per byte. The relay minimum and application floor
also apply. Missing, nonpositive or excessive estimates fail closed; no fallback
silently authorizes a minimum-rate spend. Both coins retain a 100,000-base-unit/kB
rate ceiling and 0.001-coin total-fee ceiling, including sweep cushions. These
coin caps are enforced independently of the USD limits.

The exact reviewed coin fee is checked against verified inputs and signed outputs;
it is never silently raised. Sweeps retain their existing 25% size-based cushion
and live pre-signing fee recheck. PEP, DOGE, SHIC and WHT are **not** subject to
the new USD checks: ordinary small sends keep the existing **0.01-coin default**,
and their existing sweep/relay/size limits are unchanged. In particular, Whippet
does not require a price feed to send.

#### Optional 1-coin fee for PEP, DOGE, SHIC and WHT

The Send form has an unchecked **Use 1 PEP/DOGE/SHIC/WHT total fee** option. Selecting
it replaces the 0.01-coin default with **exactly one coin for the entire
transaction**, not one coin per input or an additional coin. It is included in
the entered total: a total of 20 PEP sends 19 PEP and pays 1 PEP in fees.

The option supports up to 40 verified, confirmed inputs and 10,000 signed bytes.
This limits inputs in one transaction, not the number of outputs a wallet may
hold. Larger wallets remain usable; all candidate outputs still undergo funding-
transaction verification. The planner, review and signer enforce the coin allowlist and
exact fee. A fresh relay check runs before signing; insufficient fee coverage,
unsupported relay rates, changed inputs or dust change block sending rather than
silently changing the fee. Max uses up to 40 inputs when selected. Leaving Send
or switching assets resets the option to off; it is never saved as a preference.

This is a user-selected higher fee, not a recommended fee for ordinary small
payments. It does not affect BTC/LTC estimates or USD limits, WIF sweeps,
or Komodo recovery. All sends still require the final acknowledgment/confirmation.

Recipient validation checks Base58 encoding, payload size, network version byte
and checksum. Validation runs during planning and again when verifying reviewed
outputs before signing. PEP, WHT and SHIC addresses are not interchangeable.
Wallet-owned inputs use P2PKH. DOGE also accepts P2SH destinations; LTC accepts
P2SH and supported SegWit destinations as documented above. Multisig ownership,
Whippet assets/covenants and MWEB privacy transfers are not implemented.

### After an ordinary send

New ordinary sends record their transaction ID and affected wallet address indices
(input addresses, change and any wallet-owned recipient). While unlocked and
visible, the wallet checks confirmation every four seconds. After one confirmation,
it refreshes only those addresses and retains other validated live rows. This
focused refresh takes priority over an in-flight scan; older results cannot replace
the new balance. The four-second fresh-matching-read balance guard still applies.
The transaction receipt updates when the balance has refreshed, and Overview/Send
use the same updated state without requiring a manual 200-address Rescan.

Public tracking metadata survives navigation and restart. Lock/background stops
checks; reopening completes initial discovery before resuming focused refreshes.
Offline checks retry reads only, never broadcasts. Older records without address
metadata continue to use ordinary refresh. Full discovery and manual Rescan can
still take longer than four seconds; this change does not remove that work.

### Sweeping a private key

Choose an asset in Receive, then **Sweep private key**. Paste or camera-scan a
standard compressed or uncompressed mainnet WIF. Encrypted/BIP38 keys, raw hex,
recovery phrases, URLs and payment URIs are not accepted. PEP, WHT and SHIC all use
WIF prefix 158: the key format cannot distinguish these chains. The selected
asset, independently checked server genesis and derived source address determine
which network is queried. No seed, private key or password is sent to a server.

The destination is index 0 when **Keep using the first address** is selected;
otherwise it is the next unused, live-checked receiving address, not a historical
address being browsed. A full unpinned wallet cannot accept a sweep into a new
address. Keys for addresses already in this wallet are rejected with a Rescan hint.

All source outputs must be confirmed and mature. Every unspent output at the
selected key's address is included in one transaction, with one wallet output
and no change back to the source. Sweeps do not use the ordinary send path's
input-count, candidate-count or flat-fee limits. Previous transactions are fetched
in batches of at most ten, deduplicated, and independently checked before signing.

The fee is based on a conservative signed-size estimate (including compressed or
uncompressed public keys and CompactSize counts), charged proportionally by byte,
not rounded to whole kilobytes. The rate is the greater of the live relay floor
and 0.01 coin/kB for PEP/WHT/SHIC/DOGE. BTC/LTC additionally require the six-block
estimate, with a 0.00001-coin/kB floor. BELLS uses its API estimate or the
documented empty-table fallback, with a 0.0001-coin/kB wallet floor; its API does
not report a live relay floor. A 25% fee cushion is applied once. Calculation uses integers:
`ceil(estimatedBytes * rateInBaseUnitsPerKB * 125 / 100000)`.
Only the final fractional base unit is rounded up. For example, a one-input
compressed-key sweep estimated at 193 bytes pays 0.0024125 coin at the default
rate; a 5-coin balance delivers 4.9975875. The fee is deducted from the full
source balance. Review shows that balance, the fee and the amount arriving.
The sweep form does not show fee formulas or percentage examples. The review
highlights the estimated fee in the selected coin and requires explicit
acknowledgment followed by **Confirm sweep** before submission.
The rate remains bounded at 0.1 coin/kB before the cushion; the ordinary-send
0.1-coin total-fee ceiling does not apply to larger sweeps. Nothing is sent if
the balance cannot cover the fee plus the minimum 0.01 wallet output.
Those rate/output limits apply to PEP/WHT/SHIC/DOGE. Litecoin instead has a
0.001 LTC/kB rate cap, a 0.001 LTC absolute fee cap (including the cushion),
and a 0.00005460 LTC minimum output.

The proportional 0.01 coin/kB baseline is documented for both
[Pepecoin](https://github.com/pepecoinppc/pepecoin/blob/master/doc/fee-recommendation.md)
and [Whippet](https://github.com/chromatic/whippet-experimental-blockchain/blob/main/doc/fee-recommendation.md).
The sweep's conservative size estimate can slightly exceed the final signed size;
the reviewed fee is not silently changed after signing. The pre-broadcast check
uses the same byte-based calculation without the cushion, requiring a fresh
review if the current requirement exceeds the already approved buffered fee.

Supported chains have a 400,000-weight standard-transaction boundary; these
legacy non-witness sweeps must be below 100,000 bytes. If the conservative estimate
cannot fit the entire balance, the sweep is rejected with a multi-transaction
explanation. Automatic multi-transaction sweeping is not implemented. No partial
sweep is silently substituted. The Electrum response-size and safe-integer guards
also remain in effect; this is not a claim to support unlimited histories.

Explicit confirmation and the destination wallet's password (if protected) are
required. Source outputs, relay fee and the destination are rechecked before
signing. Changed source outputs or a fee requirement beyond the reviewed cushion
require a fresh review. Deposits arriving after the final check are not part of
the reviewed transaction and may require another sweep.
Existing input-reservation and uncertain-broadcast protections also apply.

Visible progress distinguishes source checks, receiving-address checks, signing
and submission. After an accepted sweep, the receipt screen polls the public
destination history every four seconds until the transaction has one confirmation,
then displays **Sweep confirmed**. Offline or delayed-indexing results remain
pending and retry status checks only, never the broadcast. Navigation, lock and
backgrounding stop this screen's watcher; the saved transaction ID remains in
Activity. Closing the page after submission does not cancel a transaction.

The WIF field is masked and cleared after parsing. Secret references are discarded
on cancellation, navigation, lock/background, expiry and broadcast attempts. The
key is never added to local storage, backups, logs or requests. JavaScript garbage
collection does not guarantee physical memory zeroization. Tests use public,
disposable fixtures only; never use fixture keys for funds.

### Optional Komodo recovery (Pepecoin and Shibacoin only)

This feature is off by default. In **Settings → Komodo recovery (PEP / SHIC)**,
enable it for the selected unlocked wallet. Then choose **Receive →
Pepecoin or Shibacoin → Sweep Komodo seed**, directly below **Sweep private key**.
Send and Receive show coin choices directly, without a dropdown.
The setting is local, per wallet,
and contains no recovery material. It never enables a Whippet, Litecoin, Dogecoin, Bitcoin or KMD Komodo sweep. The one
opt-in applies to both supported assets; only the selected asset is recovered.

Enter only the old Komodo phrase. A required acknowledgment reminds the user to
save the current SafeCore backup and not reuse the old seed; it does not prove
they have a backup. The current SafeCore seed/passphrase is not requested.
The unlocked wallet supplies an in-memory mnemonic fingerprint for the no-reuse
check; it is never persisted. Protected wallets still require their password at
final send confirmation. The recovery session expires after ten minutes and the
fee review after 90 seconds. Leaving, background/lock, wallet change or disabling
recovery clears the session and entered words. Normal inactivity hiding applies.

The source follows the legacy single-address transformation in
[ks2pwif at 8a72544](https://github.com/PepeEnthusiast/ks2pwif/blob/8a725440427534c7b3638db5f0a952b1073d8458/src/index.js):
SHA-256 of UTF-8 text; clear the first byte's low three bits, clear the last
byte's high bit and set its next bit; use those bytes as the big-endian secp256k1
key with a compressed public key and the selected coin's prefixes (PEP: 56,
SHIC: 63; WIF: 158 for both). Outer whitespace is
trimmed to match that converter's UI. Case, internal whitespace and Unicode bytes
are not normalized. SafeCore implements the transformation independently using
its existing libraries; it does not download or execute the converter at runtime.
The same non-HD SHA256/clamping behavior is verified against
[Komodo's legacy key derivation](https://github.com/GLEECBTC/komodo-defi-framework/blob/9b3fd7026e9e5ad4c8bd2cba5a5499cecba8d957/mm2src/crypto/src/privkey.rs).
SHIC's Komodo HD path is different and intentionally not scanned. Recovery sessions
are bound to the selected coin as well as the current wallet and connection.

The old-phrase entry reuses the local restore-word suggestions, but its validation
is isolated: 12 or 24 words are accepted without SafeCore's HD mnemonic checksum
gate. [Komodo's documentation](https://komodoplatform.com/en/docs/komodo-wallet/desktop/import-private-key-or-seed-phrase/)
uses the English BIP39 list for standard backups and also describes custom seeds.
Suggestions are optional explicit replacements, not automatic corrections.
The numbered editor starts empty, allows words outside the suggestion dictionary,
and has an uppercase toggle. Pasting a phrase into the first field preserves its
case, internal whitespace and Unicode bytes; only outer whitespace is trimmed.
Matching the word count does not verify ownership: confirm the displayed old PEP/SHIC
address before approving a sweep. Other phrase lengths, Komodo HD accounts,
hardware-wallet derivations, KMD and other assets are not supported by this flow.

The existing full-source sweep checks, byte-based fee review, current-wallet
destination selection, signing and first-confirmation screen are reused. The
review warns that all reviewed spendable funds for the selected coin leave the derived old address,
minus the fee, and the current SafeCore backup controls the recovered funds.
Do not reuse the old Komodo seed/address, but retain its backup until any other
assets have been recovered. A seed is not deleted on-chain, and this operation
does not empty unrelated addresses or coins. New deposits after the final source
check are outside the reviewed transaction. Old phrases and derived keys are
never stored in wallet backups, settings, logs or network requests.

### Current ordinary-send transaction limits

| Rule | Current value |
| --- | --- |
| Entered total | Limited by verified, confirmed spendable outputs; no 100-coin cap |
| Minimum recipient amount | PEP/WHT/SHIC/DOGE: 0.01 coin; LTC: 0.00005460; BELLS/BTC: 0.00000546; DINGO: 1 coin |
| Fee | PEP/DOGE/SHIC/WHT: 0.01 coin default or optional exact 1-coin fee; BTC/LTC: six-block estimate, size-based, at least 0.00001 coin/kB; BELLS: size-based, at least 0.0001 coin/kB; DINGO: automatic, at least 1 coin per started kB |
| Flat-fee transaction size | Default: at most 1,000 bytes; explicit 1-coin option: at most 10,000 bytes; not used for BTC/LTC/BELLS/DINGO |
| Planner input limit | 8 normally; 40 with the explicit PEP/DOGE/SHIC/WHT 1-coin option; size rules can reject fewer |
| Max input selection | Default PEP/WHT/SHIC/DOGE: conservatively up to 6; BTC/LTC/BELLS/DINGO: up to 8; explicit 1-coin option: up to 40 |
| Wallet output count | No 40-output wallet-wide block; selected transaction inputs remain limited as above |
| General fee ceiling | PEP/DOGE/SHIC/WHT: 0.1 coin (default flat path exactly 0.01), or exactly 1 coin with explicit selection; BTC/LTC: 0.001 coin plus USD guard; BELLS: 0.01 coin; DINGO: 20 coins |
| USD fee guard | All coins: warn above $5; block above $100 with no override; missing/stale USD price alone permits a per-review explicit risk acknowledgment |
| Newly mined block rewards (coinbase outputs) | SafeCore waits for 240 confirmations for PEP/WHT/SHIC/DOGE/DINGO; 100 for BTC/LTC; 30 for BELLS. Ordinary transfers do not have this wait. LTC MWEB withdrawals separately require 6. |
| Review expiry | 90 seconds |

Only confirmed, mature outputs are spendable. Raw previous transactions must
match their transaction IDs, claimed values and wallet-owned scripts.
The live relay minimum is checked where exposed; BELLS uses the documented
Core floor instead. A higher required fee or oversized transaction
is rejected rather than silently underpaying.

For PEP/WHT/SHIC/DOGE, a total of 5 coins and a 0.01 fee leaves 4.99 for the recipient. Tiny change below
0.01 is rejected in the fee-inclusive flow with guidance to use Max; it is not
silently added to the fee. Change returns to the first receiving address.

Input reservations are serialized across tabs. A recorded attempt prevents
reusing its inputs. An uncertain broadcast is **never automatically retried**.
Keep its transaction ID and resolve its status before another payment. Never
delete a wallet or clear storage to bypass that reservation.

### Camera behavior

The camera button requests video only, preferring the rear camera. Decoding uses
a bundled library; frames remain in memory and are not uploaded or saved.
The square preview fills its available width, and decoding uses the matching
center crop, up to 960 pixels square. Higher-resolution capture and continuous
autofocus are requested when supported.
The preview shows a neutral loading state until frames are available. Decoding
starts from frame readiness rather than waiting for the video playback promise;
a camera that supplies no frames times out instead of waiting indefinitely.
The DOM exposes only frame/detection counters for diagnostics, not decoded QR
contents or image data. Android permits preview playback after asynchronous
startup, while camera access still requires an explicitly opened scanner and OS
permission.

Accepted QR content is a plain supported address or a matching coin payment URI.
Optional amounts, labels and messages are ignored. Unsupported required payment
parameters and unrelated URLs are rejected. Decoded content is never executed
or used to navigate the WebView.

Camera tracks stop on success, cancel, navigation, backgrounding and removal of
the scanner view. A stream arriving after cancellation is immediately stopped.
Permission denial or no camera leaves manual entry available.

Android grants only video capture to a local, visible Send or Sweep scanner after OS
permission. Microphone and other WebView resource requests remain denied.
The app-owned permission sheet's temporary hidden state preserves the send form;
a real native background transition still locks and cancels capture.

## Local storage, backup and deletion

Browsers use localStorage. Android stores the two secret-bearing records below
in one atomic encrypted file in its no-backup directory; only preferences and
public caches remain in WebView localStorage. Another browser profile or origin
is another storage location.

Android storage uses AES-256-GCM with a fresh 12-byte IV per write and authenticated
format metadata. Its 256-bit key is generated inside Android Keystore and cannot
be exported. Hardware backing varies by device. Wallet passwords remain optional
and provide a separate encryption layer.
This is at-rest protection, not hardware signing: decrypted recipes still enter
application/JavaScript memory, and an unlocked or compromised app can access them.

**Settings → Use device authentication** is optional and installation-wide.
Enabling or disabling it requires fresh OS authentication and an atomic,
read-back-verified re-encryption of the existing store. Android 11+ supports strong
biometrics or the phone's PIN/pattern/password; Android 8–10 uses the system device
credential screen. Without a configured screen lock, the switch is unavailable;
wallet creation still does not require a wallet password.
First-wallet creation or restore defaults to enabling device authentication when
a phone screen lock is configured. Setup asks for OS confirmation before saving
the wallet; cancellation saves no wallet. Existing installations keep their choice,
and disabling the setting is remembered even if all wallets are later deleted.

When enabled, the Keystore key requires recent user authentication (60 seconds).
Opening after backgrounding always requests authentication, even during that
interval, and the previous WebView is destroyed to discard its decrypted state.
Revealing existing recovery words, exporting a backup and confirming a send also
request fresh authentication. Long-running storage operations can request it again.
This is not a hardware-isolated signing policy: signing still happens in the
unlocked app. The OS owns credential entry; SafeCore never reads the phone PIN.

Cancel leaves protection unchanged. Cancelling an OS prompt while protection is on
returns to the native lock screen and discards the previous unlocked view.
Removing the phone's screen lock may invalidate
its authentication key: disable device authentication first, and keep independent
backups for every wallet. Lost/invalidated keys never trigger plaintext fallback.
Recovery phrases and exported JSON remain portable; the destination phone uses its
own key and authentication settings. Neither the old PIN nor fingerprint is needed
to restore a separate backup. Unprotected exports still contain readable words.

Migration validates all wallets, saves and reads back the encrypted snapshot, then
removes the old localStorage records. Interrupted cleanup is retried only when the
remaining records match. Conflicting copies, unavailable keys, and authentication
failures stop wallet access without plaintext fallback or automatic replacement.
Browser record removal cannot guarantee forensic erasure of old database pages or
previous device snapshots. Missing device keys require an independent recovery
backup; do not uninstall or clear app data to troubleshoot a storage error.

Native changes use revision checks and atomic, verified commits before the UI
reports success. An interrupted response requires reopening the app to determine
the committed state. An older APK cannot read this device store; do not downgrade
or assume copying app files to another device is a recovery backup.

| Storage family | Purpose |
| --- | --- |
| `whippet.dev.encrypted.v1` | Legacy active-wallet slot; name does not guarantee encryption |
| `corevault.wallets.v1` | Saved-wallet collection |
| `corevault.balance.<wallet-id>.<coin>` | Public balance/history cache |
| `corevault.public-addresses.<wallet-id>` | Authenticated public-key/address cache; never spending authority |
| `corevault.receive.<wallet-id>` | Used indices and first-address preferences |
| `corevault.send-attempts.<wallet-id>` | Input reservations and submission records |
| `corevault.hidden-coins.v1` | Legacy displayed-coin selection; fallback for existing wallets |
| `corevault.hidden-coins.v2.<wallet-id>` | Per-wallet displayed-coin selection; new wallets start empty |
| `corevault.theme`, icon preferences | Appearance only |

Historical key names are compatibility identifiers. Collection writes precede
activation so an activation failure does not intentionally discard the old
wallet. Malformed storage fails closed instead of silently creating a replacement.

In **Your wallets**, expand the desired row, then choose **Export** without
switching wallets. Rows start collapsed; expanding one only reveals its controls.
The active wallet is marked **(current)**, and its recovery control names that
wallet explicitly. Use **Open** to switch wallets. Export is not duplicated in
Settings. Unprotected confirmation identifies
the selected wallet and expires if its saved contents change or the app locks.
Export each wallet separately. Protected exports remain encrypted; unprotected
exports contain readable recovery words and require confirmation. Import validates
the envelope and recipe. Android uses a system document picker with a 64 KB limit;
the browser file picker allows up to 1 MB before format-specific checks.
The documented backup formats are `pepecoin-whippet-encrypted-v1`,
`corevault-unprotected-v1` and the supported legacy `whippet-seed-v1` import.
The internal recovery recipe is `pepecoin-whippet-seed-v1`.

New-wallet setup offers **Yes / No, continue** for an encrypted local recovery
copy. Yes requires a separate backup password of at least 12 characters and a
matching confirmation, even when the wallet itself has no password. The copy
uses the portable PBKDF2-SHA256/AES-256-GCM JSON envelope above, includes the BIP39
passphrase, and recovers all supported coins. The backup password is never saved.
Android requires device authentication when enabled, uses a local-only system
document picker, rejects cloud and app-specific destinations, and reads the saved
encrypted bytes back before reporting success. Each export creates a new file.
The last successfully saved document is a hint for the next picker location; it
does not grant silent writes. Browser downloads use the browser's save settings.

Shared local documents normally survive Android uninstall; app-private wallets,
Keystore keys, remembered locations and access grants do not. After reinstall,
choose the saved JSON through Restore and enter its backup password. This is not
automatic recovery, cloud backup, a guarantee against device loss/reset, or a way
around a forgotten backup password. Keep an independent manual backup. Cancelling
the optional copy does not delete the already-saved wallet. Existing/restored
wallets keep their manual Export controls; nothing is exported without approval.

Deleting a wallet requires its named confirmation, typing REMOVE and acknowledging
recovery. Only that wallet and its local metadata are removed. Deleting an
inactive wallet does not activate it. Other wallets, exported backups and
on-chain funds are unchanged.

The localhost-only test reset removes SafeCore wallets, caches and preferences
for that origin, preserving unrelated storage keys. It cannot reset another
browser profile, the phone, a server database or the blockchain.
Uninstalling Android or clearing its app data removes app-private recovery material.
Keep an independent recovery backup before any destructive operation.

## Browser operation

The default brand artwork is the supplied silver SC / blue globe, used for the
header, favicon, Android adaptive launcher icon and offline recovery tool. Earlier
gallery preferences do not override this approved default; all earlier designs
remain selectable. `scripts/prepare-brand-assets.py <square-source.png>` resamples
the artwork to the packaged 512px assets (Pillow required only for this developer
step). It does not alter wallet data or contact a service.

Commands below run from the SafeCore repository root, which contains `whippet/`.
No production service changes are needed to start the preview.

```sh
python3 whippet/scripts/serve.py
```

Open localhost on port 8787. The server binds to loopback, validates Host and
serves only allowlisted files under `www/`. Stop it with Ctrl+C. Use the same
hostname and port consistently: localhost and its numeric loopback equivalent
have separate browser storage.

A secure browser context with Web Crypto, BigInt and Web Locks is required.
Camera access also requires browser permission. There is no service worker,
CDN runtime dependency, analytics or remote font.

Settings → Electrum connections supports a separate custom server for each coin.
Enter a secure `wss://host:port/path`, test it, then choose Use connection. Raw
Electrum TCP/SSL ports are not WebSocket endpoints. Normal TLS certificate checks
and the expected coin genesis are required; credentials, query strings and
fragments are not accepted. A test checks chain height and relay fee without wallet
queries or broadcasts. It does not prove the operator is honest or that a future
transaction will be accepted. Compatible servers support the ordinary send flow;
signing remains local and all existing transaction checks still apply.

Choose a trusted operator: it sees your public address queries and IP address.
Overrides apply to wallets on this device/browser and are not included in backups.
Tests do not change the active server. Using a connection clears pending transaction
reviews and refreshes discovery; custom-server failures never fall back to public
servers. Restore default
connections resets all supported coins, including invalid saved preferences. The content
policy permits secure WebSocket hosts for user-selected servers, while scripts and
ordinary HTTP requests retain their restrictions. This distribution retains the
tested public client defaults. For your own service deployment, see
[self-hosting](../docs/SELF_HOSTING.md). There is no runtime private-RPC configuration
loader in the app; do not put server credentials in client code.

Client-visible service addresses cannot be kept secret in a distributed app.
Do not embed credentials or expose administrative RPC. Obscurity is not access
control.

### Default connection resilience

Verified default pools retain the original primary server. PEP, BTC, DOGE and
LTC have automatic backup servers. WHT and SHIC currently have no verified second
WSS server, so they only reconnect to their existing server. Unreachable candidate
servers are excluded. Availability can change; the public read-only connection
test is not an uptime guarantee.

Transport/read failures rotate through available pool members, with bounded
2–30 second per-server cooldowns instead of reconnection storms. Every connection
must match the coin's genesis before address queries; a reported chain tip more
than 12 blocks behind the highest seen this session is rejected. This is a
freshness safeguard, not independent blockchain validation. Concurrent reads
share one connection. An interrupted scan restarts coherently; old-server or
disconnected snapshots cannot authorize spending. Manual connections remain
pinned for privacy. Transaction broadcasts are never automatically retried;
existing uncertain-send tracking remains authoritative.

## Android operation

Android shows the full SafeCore globe for 2.3 seconds on initial launch and
after returning from the background. Returns from authentication, camera permission
and backup-picker flows do not replay it. The splash is presentation only: it does
not unlock a wallet, delay background locking, or change screenshot protection.

Use Java 17 or newer, Android SDK/build tools 35 and the checked-in Gradle wrapper.
Set `ANDROID_HOME` to your SDK installation. Network access may be needed for
initial dependency resolution; offline builds require a populated cache.

```sh
cd whippet/android
./gradlew -PsafeCoreDebugTools=false :app:assembleLiveTest
./gradlew :app:lintLiveTest
```

Output: `app/build/outputs/apk/liveTest/app-liveTest.apk`.
Application identifiers are defined in the Android build and manifest; use those
values when configuring your own package or launching it through ADB.

The current sideload build uses the local debug signing certificate even with
debugging disabled. This is **not production release signing**. Keep the same
signing key for upgrades. Do not uninstall a funded app to work around a signing
mismatch. Treat signing-key management as a separate release requirement.
The publication gate now verifies the actual APK against a pinned public signing
certificate and rejects debugging-enabled, wrong-package, wrong-version, unsigned
or tampered artifacts. For local test builds use
`python3 scripts/verify-apk.py PATH_TO_APK --local` from the repository root with
`ANDROID_HOME` set. This is not production-key migration; see the
[signing custody and migration plan](../docs/RELEASES.md#signing-key-custody-and-migration).

From the containing checkout, replace `YOUR_DEVICE_SERIAL` with the intended
device from `adb devices`:

```sh
adb devices
adb -s YOUR_DEVICE_SERIAL install -r whippet/android/app/build/outputs/apk/liveTest/app-liveTest.apk
python3 whippet/tests/android_bundle.py
```

The replacement install preserves existing app data when package/signature rules
allow it. The APK includes allowlisted application assets only, never desktop
wallet storage or test fixtures. A fresh installation starts empty.

`safeCoreDebugTools=false` is the current default. It disables liveTest app
debugging and USB WebView inspection. Setting it true requires rebuilding and reinstalling; it is not a
remote backend switch. The separate Gradle debug variant remains a QA app and
must not be used to verify the liveTest manifest's non-debuggable setting.

**Settings → Block screenshots** is on by default, independently of debugging
and wallet passwords. Android stores this device-wide preference outside wallet
backups. Allowing screenshots requires a native confirmation; re-enabling the
block applies immediately. Android's secure-window flag also restricts screen
recording. Background windows remain protected, and Android 13+ task previews are
disabled even when foreground screenshots are allowed. The localhost/browser UI
shows this control disabled: a website cannot enforce Android screenshot blocking.
Allowing captures can expose recovery words; it never enables USB debugging.

**Settings → Hide balances** masks Overview's total, coin balances and holding
values, pending amounts, and Send's asset-picker balances. This display-only
preference persists across wallets and reloads on this app/browser; it does not
alter wallet backups, network scans, transaction amounts or fees. Explicit payment
entry, Max and transaction reviews remain visible so users can verify a payment.
Public unit prices and addresses are not hidden. The legacy `#security` route is
retained for bookmarks and the narrowly scoped Android settings bridge.

Android blocks cleartext traffic, invalid TLS, remote-page navigation, file URL
access and broad native JavaScript interfaces. Its narrow adapter handles
address copying and explicitly chosen backup files. Automatic cloud backup and
device-transfer extraction are disabled. These controls do not replace seed
encryption or protect against a compromised device.

## Testing and troubleshooting

Use disposable profiles, public fixtures and isolated emulators. Never run QA
instrumentation against a funded wallet. Do not log or screenshot recovery words,
passwords, private keys or backup payloads.

Core module tests:

```sh
for test in receive library transactions network_cache network_consistency reporting recovery scanner; do
  node "whippet/tests/$test.cjs"
done
```

Install pinned test dependencies with `npm ci --ignore-scripts`, then run
`npm test` for all core tests, including independent Bitcore derivation checks.
These dependencies are test-only and are not included in the app.

Browser tests use isolated Playwright contexts and serve this checkout through
request interception at a test-only loopback origin. They do not use a personal
browser profile or require stopping an existing preview server. Install Chromium
with `npx playwright install chromium`, or set `CHROME_BIN` to an installed Chrome
executable. Run `npm run test:browser` for all suites. Individual examples:

```sh
node whippet/tests/browser.cjs
node whippet/tests/wallets.cjs
node whippet/tests/scanner_ui.cjs
node whippet/tests/activity_ui.cjs
```

Additional suites cover coin visibility, cached/offline state, reset and icons.
Mocked send tests verify confirmation, password gates, changed/reserved inputs
and uncertain responses without mainnet broadcasts. Scanner tests decode real
generated QR frames in portrait and landscape arrangements and test cleanup.

Android QA uses separate debug and instrumentation packages:

```sh
cd whippet/android
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
```

The **Android security checks** GitHub workflow runs on pull requests, pushes to
`main`, and manual dispatch. It builds only the disposable QA app (not a release)
and runs `python3 scripts/android_security.py` from the repository root. Locally,
build the QA APKs above first, set `ANDROID_HOME`, and install
`system-images;android-35;google_apis;x86_64` using the SDK manager.

The runner creates its own temporary Android 35 emulator on port 5580. It refuses
an occupied port or a mismatched emulator identity; it never selects a connected
phone. It covers encrypted storage, tampering/key loss, interrupted writes,
legacy migration, first-wallet defaults, authentication cancellation, background
locking, protected export/import return, expiry, and screen-lock removal. Local
recovery-copy checks cover encrypted-only/local-provider policy, remembered
picker locations, a real document save, and restore after uninstall/reinstall
of only the disposable QA package (25 native security/icon/splash test executions in total, including
the per-coin explorer URL allowlist and full-globe adaptive-icon safe-area checks
at six rendered sizes, the system splash mask, and 2.3-second cold/reopen splash
timing without delaying background protection or replaying after system flows).
Only disposable fixtures and a public fake PIN are used. No release credentials,
real wallets or funded transactions are needed. Raw device logs, screenshots,
wallet data and emulator snapshots are not uploaded. A failed, missing, timed-out,
or incomplete instrumentation result fails the job rather than silently passing.
The temporary emulator is stopped and discarded when the runner exits normally
or through its error handler. Existing devices and the shared ADB server are left
alone.

Start with this single API level; emulator success does not establish biometric
hardware behavior or coverage of every supported Android/OEM version. Live-chain
smoke tests are deliberately separate. After verifying the workflow in GitHub,
make **Native storage and authentication (Android 35)** a required branch check;
adding the workflow alone does not change repository branch protection.

Run the instrumentation only on a disposable emulator. Its smoke test includes
read-only live chain-identity checks as well as local UI tests, permission-dialog
handling, a simulated camera, keyboard input, backup handling and lifecycle
protection. Therefore it is not a fully offline test. The public-endpoint probe
is also explicitly network-dependent.

Device-authentication instrumentation is phased, not an all-methods-at-once suite.
Use only a dedicated emulator and the `.qa` package. Start with a fresh QA install;
`DeviceStorageUiTest.testMigrationCreateReloadAndProtection` populates disposable
wallets. Run these `DeviceAuthenticationTest` methods individually, in order:

1. `testNoScreenLock`, with no emulator screen lock.
2. Set the **emulator only** PIN to the public fixture `24682468`.
3. `testAuthenticationLifecycle`, then `testProtectedExportAndImportReturn`.
4. `testExpiredAuthorizationCannotDecrypt` (waits past the key's 60-second window).
5. Remove the **emulator only** screen lock using that fixture PIN, then run
   `testCredentialRemovedFailsClosed`.

These tests deliberately exercise credential loss and must never target a personal
phone or funded QA installation. They use their own UI automation connection; do
not run a second UIAutomator session concurrently. `DeviceWalletStoreTest` uses
isolated fixture files/aliases for ciphertext tampering, atomic writes and key loss.

The isolated Core regtest harness needs separately installed node binaries. Set
`PEP_CORE_BIN` and `WHT_CORE_BIN`, or put `pepecoind` and `whippetd` on PATH. It creates
disconnected temporary chains and must never be pointed at a live node data
directory. Do not infer production readiness from a regtest or emulator pass.

| Symptom | Check |
| --- | --- |
| Balance is `*` | Wallet state, service reachability, chain identity and missing/corrupt cache; do not replace unknown with zero |
| Last-known balance does not update | Connectivity and timestamps; retain the cache and recovery material |
| Expected funds absent after restore | Exact phrase, BIP39 passphrase, derivation recipe; run Rescan; addresses beyond index 199 are outside this wallet's discovery cap |
| Send disabled or rejected | Confirmed mature funds, current snapshot, pending reporting change, reservations and size/amount limits |
| Wrong-network/checksum error | Selected coin and full recipient address; never bypass validation |
| Submission uncertain | Check the retained transaction ID before retrying; never clear reservations to force another send |
| Camera denied or unavailable | App/browser permission, another camera app, manual address entry |
| Camera sees QR but does not decode | Whole code and quiet border in frame, focus, lighting, distance and supported content |
| Restore words appear invalid | Exact spelling/order/count/checksum; never silently substitute guessed words |
| Backup import rejected | Supported format, file bounds, correct password and unchanged recovery recipe |
| Android update rejected | Device, package ID, version and signing key; back up before any removal |
| Screenshot or USB inspection blocked | Expected with the debug toggle off; do not weaken a funded wallet just to troubleshoot UI |
