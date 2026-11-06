# Verification

## 0.1.0-test.15: opt-in legacy Komodo Pepecoin recovery

Fourteen core suites and twenty isolated browser suites pass. The legacy
derivation is checked independently with
Node/OpenSSL SHA256 and secp256k1 against disposable public fixtures, including
case, internal spacing, Unicode, outer trimming and 12/24-word inputs. Current
wallet backup verification covers plaintext and encrypted vaults, extra BIP39
passphrases, wrong credentials and refusal to reuse the old seed. Standard
SafeCore mnemonic validation remains separate from legacy Komodo word entry.

Recovery browser fixtures cover default-off and per-wallet opt-in, PEP-only
controls and route guards, backup verification, cancellation, backgrounding,
verification/review expiry, disabled recovery at submission, pinned/next-empty
destinations, fees, first confirmation and absence of the old phrase in storage.
No live recovery phrase or mainnet broadcast is used by these tests.
The nine Komodo UI scenarios include a reload that preserves the second selected
wallet, proving that enabling recovery does not opt other wallets in.

The Android QA and test.15 liveTest builds and lint pass (zero errors, six existing warnings).
The exact bundled-asset audit includes `komodo.js` and excludes wallet databases,
backups and signing keys. The version code is 15, app debugging is disabled, and
the signing certificate matches test.14. The artifact's hash and immutable
transport commit are recorded in `release/manifest.json`. Changed/new source
secret scans pass. These checks are not an independent security audit or a
real-funds Komodo recovery.

The Activity regression checks full fetched history before truncating display,
including reload, old confirmed attempts, retained uncertain attempts and scoped
wallet state. Eight release-tool tests pass, including the private-repository
artifact fetch: authentication is scoped to GitHub HTTPS in a subprocess
environment, never stored in Git config or command arguments. Both workflows
use a pinned checkout action without persisted credentials. Live GitHub checks
and release publication must still complete after the source PR is opened and
merged; local fixtures do not prove a particular account's Actions permissions.

## 0.1.0-test.14 confirmed-send balance refresh

Thirteen core suites, nineteen isolated browser suites, recovery compatibility
and seven release-tool tests pass. Android build/lint pass with zero errors and
six existing warnings. Exact bundled assets, signature, version and disabled
debugging are verified; staged-source secret and publication checks pass.

Focused-refresh fixtures cover both coins, input/change address selection,
deduplication, retention of unrelated balances, forced fresh rereads and rejection
of restored disk caches, invalid indices and inconsistent responses. Browser
fixtures cover pending and offline checks, persisted tracking across reload,
background cancellation, stale in-flight scan suppression and no rebroadcast.
The ordinary-send fixture verifies that public refresh indices are recorded.
Wallet vault format, derivation and signing identity remain unchanged;
no private wallet data is part of these tests or the APK.

## 0.1.0-test.13 discovery and sweeping

The test.13 build includes discovery, rescan and private-key sweeping changes.
Twelve core suites and eighteen isolated
browser suites pass, plus seven release-tool tests. Additional sweep UI cases
cover expiry and app backgrounding. Automated tests do not broadcast mainnet
transactions. Separately, a user-operated six-input PEP sweep was observed to
receive its first confirmation with the source balance reduced to zero and the
reviewed fee preserved. No private key was accessed by the diagnostic tools.

Discovery fixtures cover a late deposit to address #5, lookahead growth in tens,
the 200-address boundary, old-cache migration, full Rescan, notification-driven
updates outside the current window, reconnect, periodic probing and failed scans.
Initial-discovery UI fixtures check full 200-address scans for both coins on
load/unlock, cached startup, non-overview routes, failed-scan retries, wallet
switching and re-unlock. Routine polling does not repeat the full scan; Rescan does.
Fetched history must match its announced status before it can become reusable.
Private-key fixtures cover both coins, compressed/uncompressed WIF, and independent
Bitcore verification of every generated sweep signature, including 121-input
compressed/uncompressed sweeps and the 253-input CompactSize boundary. Fees
are proportional to bytes with a single 25% cushion, not whole-kilobyte rounded.
Fixtures check fractional-base-unit rounding, 999/1000/1001-byte continuity,
both network tickers, higher live rates, full-source conservation, one-output/no-change behavior,
size-limit refusal and unchanged ordinary-send limits are checked. Network
fixtures cover 121 outputs, long source history, deduplicated/bounded raw fetches,
and rejection of pending/immature outputs and malformed previous transactions. UI tests cover
QR decoding from generated frames, first-address/next-empty destinations,
password confirmation, cancellation, source changes, uncertain broadcasts, full
address pools, large sweeps, fee rises inside/beyond the cushion, and absence of
WIF data in storage. Receive picker state survives
background refreshes.
Sweep receipt fixtures cover pending-to-one-confirmation transitions on both
coins, offline/indexing retries without rebroadcast, staged submission progress,
duplicate-click prevention and navigation during an in-flight confirmation check.
Overview Rescan placement is checked at narrow mobile and desktop widths.

Android build/lint pass with zero errors and six existing warnings. Debugging is
off and the exact bundled-asset audit passes. This is not a physical-camera test
or an independent security audit. Test sweeps use public disposable keys only;
the single-standard-transaction sweep boundary and 200-address discovery cap are explicit.

## 0.1.0-test.12 polling optimization

Includes Chromatic's reviewed PR #1, merged into main at `8356cfe`. Network
fixtures verify that unchanged live address-status fingerprints reuse rows,
changed statuses trigger fresh balance/history/UTXO requests, decoded disk caches
cannot authorize reuse, and inconsistent totals remain rejected. Four-second
polling and changed-balance stabilization remain unchanged.

The core wallet and isolated browser suites pass, including send review, input
rechecks, recovery focus, cache isolation and reporting timing. Android liveTest
build and lint pass (zero errors, six existing warnings). The exact asset audit,
APK signature and non-debuggable manifest are verified with the existing signing
certificate. Tests use fixtures and do not broadcast mainnet transactions; no
wallet database, recovery material or signing private key is packaged.

## 0.1.0-test.11 recovery-focus fix

The CI recovery failure was reproduced as a real event-ordering bug: ArrowDown
focused a suggestion, then a queued textarea `select` event refreshed the list
and removed that focused button. A deterministic test forces this ordering and
fails on test.10. The handler now processes selection updates only while the
textarea is focused; validation, genuine input updates and blur cleanup remain
unchanged. The regression passes, along with 20 real ArrowDown/Enter selections
and checks for cleanup after focus leaves the field or the app backgrounds.

## 0.1.0-test.10 timing update

Foreground polling and changed-balance stabilization both use 4 seconds. Tests
check no periodic query at 3,999 ms, a query at 4,000 ms, and no publication of a
changed total until another fresh matching query 4 seconds later. Initial restore
balances remain immediate. The candidate-reset, stale-result, cache-isolation and
in-flight scan guards are unchanged; wallet storage and derivation are unchanged.

Core wallet tests and the reporting, send-picker and activity browser regressions
pass. Android liveTest build/lint and the exact bundled-source audit pass with
debugging/screenshots disabled and the existing signing certificate retained.

## Initial publication

Checks performed against the standalone source tree for 0.1.0-test.9:

- Nine core wallet suites, including independent Bitcore derivation, recovery,
  signing, transaction limits, network consistency, cache isolation, first-address
  pinning, QR parsing and the 25-second balance reporting gate.
- Sixteen isolated browser suites covering desktop/mobile layouts, creation,
  recovery, backup, deletion, asset selection, scanner lifecycle, Max, activity,
  reporting, cached/offline state and local reset. Mocked sends did not broadcast
  on either mainnet.
- Real browser-generated signatures accepted and mined by both Core binaries on
  disconnected temporary regtest chains, with zero network peers.
- Android liveTest build and lint: zero errors, six warnings; signed APK verified;
  manifest non-debuggable; exact allowlisted source/assets matched; no saved wallet
  or private signing material packaged. Existing dependency/deprecation warnings
  remain maintenance work, not evidence of a security audit.
- ElectrumX container build plus ten Whippet/history-compaction regression tests.
- Blockbook's complete native/RocksDB container build, including its PEP adapter.
- Compose syntax validation using placeholder configuration, not production values.
- Seven offline release-publisher tests: tag/hash/debug guards, draft publication,
  no overwriting published assets and no token forwarding to an untrusted host.
- Staged-source path/content guard and Gitleaks scan, with reviewed narrowly scoped
  public-fixture exceptions.

The generic multi-service deployment has not been brought up against newly synced
mainnet nodes as part of publication. Operators must perform the documented
readiness, TLS and firewall checks. A unit test, successful build or clean secret
scan does not establish production security or consensus compatibility.

GitHub's fresh browser environment exposed test assertions that read the previous
screen immediately after hash navigation. The affected wallet-list, receive,
deletion and icon tests now wait for rendered state, not an arbitrary delay.
The wallet's runtime behavior and released APK are unchanged by those test fixes.

The initial Blockbook Dockerfile used obsolete Debian Bullseye package URLs that
failed during this check. The standalone build uses Bookworm, removes unnecessary
container-host packages, bounds RocksDB compile parallelism and stops on dependency
download errors. It retains the imported Go 1.21 / RocksDB 7.7.2 compatibility
baseline; dependency/toolchain upgrades and vulnerability review remain necessary
before treating the explorer deployment as production-hardened.
