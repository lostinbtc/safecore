# SafeCore

SafeCore is a local-first, multi-wallet application for Pepecoin (PEP) and Whippet
(WHT), with a phone-sized browser interface and a bundled Android application.
Pepecoin uses green accents; Whippet uses blue. Dogecoin is a **Coming soon**
catalog entry, not an implemented wallet.

This is development software for small-value testing, not an independently
audited production wallet. Removing development labels from the interface does
not change its security status or transaction limits.

This guide intentionally omits operator domains, service URLs, credentials,
deployment targets, device identifiers and private testing history. Operational
values must be supplied and reviewed separately. **This README does not make the
rest of the source tree, Git history or compiled APK safe to publish.** See
[Preparing a public repository](#preparing-a-public-repository).

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
- [Preparing a public repository](#preparing-a-public-repository)

## Architecture and trust boundaries

The browser and Android app run the same bundled wallet code. Android serves it
from a private local HTTPS asset origin; it does not load a hosted wallet page.
There is no wallet-account backend and no upload of seeds or private keys.

```text
Saved recovery recipe -> local address derivation -> public address pool
                                                   |
                                                   v
                          configured chain service -> validated snapshots
                                                   |
                                                   v
                                        display / local public cache

User-approved send -> live input checks -> local signing -> signed transaction
                                                             |
                                                             v
                                                   chain-service broadcast
```

Each chain has a separate network client and expected genesis hash. The client
checks chain identity before use. Chain services receive public address hashes,
transaction queries and signed transactions, never recovery words or passwords.
A separate price request contains no wallet data.

History, confirmations and unspent-output reports are trusted to the configured
chain service. This is **not an SPV-proof client**. Raw input transactions are
verified locally, but that is not independent verification of the entire chain.

| Module | Responsibility |
| --- | --- |
| `www/engine.js` | BIP39 validation, recovery recipes, address derivation, vault encryption |
| `www/library.js` | Saved-wallet collection, activation, naming and removal |
| `www/receive.js` | Used-address tracking, receive cursor and first-address pin |
| `www/network.js` | Chain identity, RPC transport, scans, cache validation and live input checks |
| `www/reporting.js` | Balance-change stability window and cumulative valuation |
| `www/transactions.js` | Integer amounts, address checks, input verification, transaction construction and signing |
| `www/recovery.js` | Local word suggestions and phrase validation |
| `www/viewport.js` | Keyboard-aware scrolling and caret placement |
| `www/scanner.js` | On-device QR decoding, address extraction and camera cleanup |
| `www/native.js` | Narrow Android adapter and permission-sheet state |
| `www/app.js` | Navigation, user flows, state coordination, confirmations and rendering |
| `www/index.html`, `www/styles.css` | Application shell, content policy, themes and layout |
| Android sources | Local asset loading, permissions, lifecycle protection, clipboard and document picker |
| `scripts/serve.py` | Loopback-only, allowlisted development server |

Navigation is Overview, Receive, Send, Activity and Security. The header wallet
icon opens wallet management. A selected-wallet name is shown beneath the brand;
there is no preview/development status badge. Protected wallets also have a lock
control. Coin visibility, theme and icon choices do not alter keys.

State boundaries matter: changing or locking a wallet invalidates in-flight work.
Storage updates use Web Locks to coordinate tabs. Stale navigation events cannot
discard a newly staged import. A result belonging to an old wallet must never
update the new active wallet.

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

Suggestions come from the bundled 2,048-word list. They update while the keyboard
is composing a word, appear beside the caret and insert only after an explicit
selection. There is no silent spelling correction, remote lookup or saved phrase
draft. Submit-time validation still runs if a disabled control is bypassed.

Unprotected backup recipes are checked before staging. Encrypted recipes are
checked after decryption. After successful restore, both supported coin scans
start on Overview; the first validated balances are displayed without the
subsequent-change reporting delay.

A checksum-valid phrase is not proof that it is the intended wallet. A different
valid phrase or BIP39 passphrase creates different addresses. Compare a known
receiving address after restoration. Core `wallet.dat` files are not supported.

### Derivation contract

| Coin | P2PKH version byte | Receive path |
| --- | --- | --- |
| Pepecoin | 56 / `0x38` | `m/44'/3434'/0'/0/{index}` |
| Whippet | 73 / `0x49` | `m/0'/3'/{index}'` |

The displayed Address #1 is derivation index 0. Whippet's hardened receive path
is intentionally preserved for legacy compatibility. Do not change these paths,
formats or address versions as a cosmetic rename.

The current UI derives indices **0–19** per coin. Other accounts, higher indices
and external change branches are not discovered. Compatibility with another
wallet depends on its exact derivation recipe, not simply its use of BIP39.

### Passwords and secrets

The wallet password encrypts the saved recipe; it is not the BIP39 passphrase.
Protected vaults use AES-256-GCM with PBKDF2-HMAC-SHA256 at 600,000 iterations,
a random 16-byte salt and a random 12-byte nonce. The password is not stored.
The encrypted payload includes the phrase, BIP39 passphrase and derivation paths.

With protection off, the recovery recipe is **plaintext** in local storage and
unprotected exports. An app sandbox is not encryption. Public balance/history
metadata is plaintext even when the seed is encrypted.

Protected wallets require their password to unlock, reveal their seed again,
or confirm a send. Each saved wallet retains its own protection choice.
Protected wallets lock after two minutes of inactivity and on backgrounding.
Revealed recovery information hides on backgrounding or inactivity in either mode.
Unprotected wallets reopen automatically; hiding their screen is not protection.

Secrets exist in JavaScript memory during recovery, derivation and signing.
Garbage collection does not guarantee zeroization. Hardware-backed key custody,
biometrics and an independent security audit are not implemented.

## Receiving and address discovery

Receive starts with no asset selected. Choose a coin before an address, QR code,
copy button or previous/next navigation appears. Only enabled, implemented coins
can receive, including coins with zero balance. This choice is independent of
Overview and Send and resets when leaving Receive; address-pin preferences do not.
Tapping a supported coin row on Overview explicitly chooses that coin and opens
its Receive screen. The bottom Receive tab still starts without a selection.

An address becomes used when history is detected, not when displayed or copied.
Receiving advances to the next unused address after a payment is observed.
Previously used addresses remain accessible and are not recycled after spending.
At the end of the bounded pool, receiving stops rather than inventing coverage.

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

Visible, unlocked Overview, Send and Activity refresh both supported coins about every
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
Each supported asset has a collapsed header and a scrollable list of its latest
30 server transactions plus locally outstanding sends. Refreshes preserve open
sections and scroll positions. PEP transaction IDs link to the configured explorer;
WHT IDs remain plain text. Explorer pages open only after a user click, in an
external browser rather than the wallet WebView. Android allows only the exact
HTTPS explorer host and transaction-path format, with no query, fragment or user info.

Wallet value is cumulative for the active saved wallet, independent of selected
or hidden coins. The estimate converts supported coin/USD prices using the
USDT/USD quote; USDT is not assumed to equal one dollar. It is an estimate, not a
USDT account. Zero balances are excluded. Positive unpriced holdings make the
estimate incomplete (`*`), not worth zero. Whippet currently has no price feed.

Price requests run at most once per minute on unlocked Overview. Quotes expire
after five minutes. A missing quote never changes the actual coin balance.

## Sending and QR scanning

Send opens with no asset selected. Its asset picker shows supported coins with a
positive reported balance, even if hidden on Overview or without a market price.
Zero, unknown and coming-soon assets are not selectable. Pending and cached
balances are labeled; appearing in the picker does not establish spendability.
Switching assets clears the recipient, amount and quote, stops any camera scan,
and invalidates late callbacks. Leaving Send or switching wallets clears its
selection. Background balance updates do not replace an in-progress send form.

### Transaction flow

1. Open Send in the bottom bar and choose the asset. Create/restore or unlock a
   wallet first if needed. Overview only shows wallet value and the coin list.
2. Enter or scan a recipient and enter the **total including fee**.
3. Refresh spendable inputs and compute recipient amount, fee and change.
4. Review the coin, complete address, recipient amount and total deduction.
5. Explicitly confirm. Protected wallets require their password again.
6. Recheck live inputs, sign locally, record the input reservation, then broadcast.

Reviews expire after 90 seconds. A QR scan never signs, broadcasts, advances to
confirmation, or changes the amount. Opening the Send screen does not bypass
transaction checks.

Recipient validation checks Base58 encoding, payload size, network version byte
and checksum. Validation runs during planning and again when verifying reviewed
outputs before signing. PEP and WHT addresses are not interchangeable.
This build supports ordinary P2PKH destinations only, not P2SH, multisig,
Whippet assets/covenants or Dogecoin sending.

### Sweeping a private key

Choose an asset in Receive, then **Sweep private key**. Paste or camera-scan a
standard compressed or uncompressed mainnet WIF. Encrypted/BIP38 keys, raw hex,
recovery phrases, URLs and payment URIs are not accepted. PEP and WHT both use
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
and 0.01 coin/kB, plus a 25% fee cushion applied once. Calculation uses integers:
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

The proportional 0.01 coin/kB baseline is documented for both
[Pepecoin](https://github.com/pepecoinppc/pepecoin/blob/master/doc/fee-recommendation.md)
and [Whippet](https://github.com/chromatic/whippet-experimental-blockchain/blob/main/doc/fee-recommendation.md).
The sweep's conservative size estimate can slightly exceed the final signed size;
the reviewed fee is not silently changed after signing. The pre-broadcast check
uses the same byte-based calculation without the cushion, requiring a fresh
review if the current requirement exceeds the already approved buffered fee.

Both supported chains have a 400,000-weight standard-transaction boundary; these
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

### Current ordinary-send transaction limits

| Rule | Current value |
| --- | --- |
| Entered total | Limited by verified, confirmed spendable outputs; no 100-coin cap |
| Minimum recipient amount | 0.01 coin |
| Flat fee | 0.01 of the selected supported coin |
| Flat-fee transaction size | At most 1,000 bytes |
| Planner input limit | 8; size rules can reject fewer |
| Max input selection | Conservatively up to 6 |
| Candidate-output scan bound | 40 |
| General fee ceiling | 0.1 coin; flat-fee path still requires exactly 0.01 |
| Coinbase maturity | 240 confirmations |
| Review expiry | 90 seconds |

Only confirmed, mature outputs are spendable. Raw previous transactions must
match their transaction IDs, claimed values and wallet-owned scripts.
The live relay minimum is checked. A higher required fee or oversized transaction
is rejected rather than silently underpaying.

For a total of 5 coins, a 0.01 fee leaves 4.99 for the recipient. Tiny change below
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

The implementation uses localStorage, not a separate SQL database. Android
WebView storage is separate from desktop browser storage. Another browser
profile or origin is another storage location.

| Storage family | Purpose |
| --- | --- |
| `whippet.dev.encrypted.v1` | Legacy active-wallet slot; name does not guarantee encryption |
| `corevault.wallets.v1` | Saved-wallet collection |
| `corevault.balance.<wallet-id>.<coin>` | Public balance/history cache |
| `corevault.receive.<wallet-id>` | Used indices and first-address preferences |
| `corevault.send-attempts.<wallet-id>` | Input reservations and submission records |
| `corevault.hidden-coins.v1` | Displayed-coin selection |
| `corevault.theme`, icon preferences | Appearance only |

Historical key names are compatibility identifiers. Collection writes precede
activation so an activation failure does not intentionally discard the old
wallet. Malformed storage fails closed instead of silently creating a replacement.

Export each wallet separately. Protected exports remain encrypted; unprotected
exports contain readable recovery words and require confirmation. Import validates
the envelope and recipe. Android uses a system document picker with a 64 KB limit;
the browser file picker allows up to 1 MB before format-specific checks.
The documented backup formats are `pepecoin-whippet-encrypted-v1`,
`corevault-unprotected-v1` and the supported legacy `whippet-seed-v1` import.
The internal recovery recipe is `pepecoin-whippet-seed-v1`.

Deleting a wallet requires its named confirmation, typing REMOVE and acknowledging
recovery. Only that wallet and its local metadata are removed. Deleting an
inactive wallet does not activate it. Other wallets, exported backups and
on-chain funds are unchanged.

The localhost-only test reset removes SafeCore wallets, caches and preferences
for that origin, preserving unrelated storage keys. It cannot reset another
browser profile, the phone, a server database or the blockchain.
Uninstalling Android or clearing its app data removes local recovery material.
Keep an independent recovery backup before any destructive operation.

## Browser operation

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

Configured chain and price services must match their expected network identities,
the page's content security policy and the Android allowlist. This distribution
retains the tested public client defaults. For your own service deployment, see
[self-hosting](../docs/SELF_HOSTING.md). There is no runtime private-RPC configuration
loader in the app; do not put server credentials in client code.

Client-visible service addresses cannot be kept secret in a distributed app.
Do not embed credentials or expose administrative RPC. Obscurity is not access
control.

## Android operation

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
debugging and USB WebView inspection, and enables screenshot/task-preview
protection. Setting it true requires rebuilding and reinstalling; it is not a
remote backend switch. The separate Gradle debug variant remains a QA app and
must not be used to verify the liveTest manifest's non-debuggable setting.

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

Run the instrumentation only on a disposable emulator. Its smoke test includes
read-only live chain-identity checks as well as local UI tests, permission-dialog
handling, a simulated camera, keyboard input, backup handling and lifecycle
protection. Therefore it is not a fully offline test. The public-endpoint probe
is also explicitly network-dependent.

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

## Preparing a public repository

This is a publication checklist, not a claim that sanitization is complete.

1. Review the exact staging set and Git history before uploading. Removing a value
   from the latest README does not remove earlier commits.
2. Remove or replace operator addresses and service identifiers in
   `www/network.js`, `www/app.js`, `www/index.html`, Android network allowlists
   and relevant fixtures. Keep replacement network configuration, content policy
   and native allowlists consistent. Do not weaken TLS or genesis checks.
3. Exclude deployment-specific `deploy/` content and private runbooks from the
   public package unless deliberately rewritten as generic examples.
4. Review test scripts and Android local configuration for personal filesystem
   paths, devices, live targets and parent-project dependencies.
5. Exclude seeds, backups, browser profiles, caches, node data, environment files,
   credentials, signing keys, APKs not intended for release and test artifacts.
   Existing ignore rules help but do not untrack files already committed.
6. Inspect compiled artifacts too: operational addresses are recoverable from
   bundled code and network traffic. Never describe them as secrets once shipped.
7. Retain third-party copyright and license notices. See [THIRD_PARTY.md](THIRD_PARTY.md).
   Choose an appropriate project license and review artwork rights before release;
   third-party notices do not license all first-party code or branding.
8. Build from the intended public tree, verify its asset allowlist and signature,
   run isolated tests, review current limitations and document reproducible setup.
9. Add production signing, verified-backup onboarding and independent security
   review before presenting the application as production-ready.

No server deployment, endpoint rotation, Git push or public release is performed
by following the local build instructions alone.
