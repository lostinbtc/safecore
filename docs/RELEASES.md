# APK prereleases

Before installing, read the [wallet risks and liability disclaimer](../RISK_NOTICE.md).
Funds may be permanently lost. New release descriptions include the full notice;
this does not retroactively modify existing published releases.

Download an APK only from this repository's Releases page. Compare its SHA-256
with the release checksum and inspect its signing-certificate fingerprint with
Android's `apksigner verify --print-certs`. Hashes detect changed bytes; they are
not an independent security audit or proof that source is safe.

## Test.19

Adds Litecoin (LTC) receiving, sending, private-key sweeps, live price estimates
and offline JSON/WIF/TXT/CSV recovery. Coin lists consistently show Pepecoin,
Litecoin, Shibacoin, then Whippet. Existing backups, coin addresses and protection
settings are preserved. LTC uses its own size-based fees, dust limits and maturity
rules, not the other coins' flat fee.

LTC receiving uses legacy BIP44 addresses. Sending accepts standard legacy,
SegWit and Taproot destinations; MWEB privacy addresses and other wallets'
BIP49/BIP84 account discovery are not supported. Two external WSS endpoints
passed read-only chain checks, but share an operator; this is not an uptime
guarantee. Price requests contain no wallet identifiers and cannot authorize sends.

Android versionCode 19 / versionName `0.1.0-test.19`, with debugging disabled
and the existing development signing identity. Independent derivation/signature
tests, disposable JSON recovery, browser regressions and all 14 Android security
test executions passed locally. Real LTC receive/send testing remains pending;
this is a development prerelease, not an independent audit.

Keep separate recovery backups. Test.18 remains available; never uninstall or
clear wallet data to bypass a signing or installation error.

## Test.18

Adds Shibacoin (SHIC) receiving, sending, private-key sweeps and offline recovery.
Coin lists now show Pepecoin, Shibacoin, then Whippet. SHIC price estimates from
CoinGecko are included in the USDT wallet value; stale or unavailable quotes do
not affect coin balances or sending. The offline recovery tool remains offline.

Existing PEP/WHT addresses, backups, storage protection and authentication choices
are preserved. Old SafeCore backups also derive SHIC addresses without migration.
SHIC uses an external Electrum server with chain-identity verification. The public
price request contains no wallet addresses or balances.

Android versionCode 18 / versionName `0.1.0-test.18`, with debugging disabled and
the existing development signing identity for in-place updates. Local testing
includes disposable backup round trips, independent address/signature checks,
browser regressions and Android security tests. The tester also reported confirmed
incoming and outgoing SHIC transfers. These checks are not an independent audit.

Keep a separate recovery backup before updating. Test.17 remains available;
do not uninstall or clear wallet data to bypass installation errors.

## Test.17

Android versionCode 17 / versionName `0.1.0-test.17`, using the same development
signing identity for in-place updates. This release adds device-encrypted Android
wallet storage, installation-wide device authentication with first-wallet defaults,
and offline recovery for both Pepecoin and Whippet. Existing authentication choices
are preserved. The Settings control sits below Appearance. Release checks now
verify the actual APK signature, approved certificate and manifest safety settings.
Temporary storage diagnostics are removed; app/WebView debugging stays disabled.

Keep independent recovery backups. Device-bound storage cannot be copied between
phones; recovery phrases and exported JSON remain portable. Removing the phone's
screen lock can invalidate an authentication-protected key: disable that setting
first. This is still a development prerelease, not independently audited.

## Test.16

This update uses Android versionCode 16 and versionName `0.1.0-test.16`, promoting
the locally tested `test.16-local.6` iteration without skipping a release number.
The verified APK is published separately through the tagged-release workflow;
a source pull request alone does not make a new APK available.

This iteration adds compact wallet/navigation screens, collapsible wallet controls,
streamlined restore entry, system-theme defaults with a manual override, balance
privacy, local screenshot controls and custom secure Electrum connections. Address
discovery publishes verified batches, and large Whippet amounts retain exact integer
precision. Komodo recovery remains Pepecoin-only. See the wallet guide for current
behavior and the security notes before using live funds.

## Previously published prereleases

The test.15 prerelease is SafeCore 0.1.0-test.15, Android 8.0+ (API 26), with
`safeCoreDebugTools=false`. USB/WebView debugging and screenshots are disabled.
It starts without saved wallets on a fresh installation. It contains no desktop
database, recovery material, RPC credentials or signing private key.

Version 0.1.0-test.15 adds opt-in legacy Komodo recovery for Pepecoin only.
Enable it per wallet in Security, then use Receive → Pepecoin → Sweep private
key → Komodo Sweep. The destination wallet's backup must be verified first;
the old phrase is processed locally and is never saved. Legacy derivation is
isolated from SafeCore HD recovery. Review the derived source address, receiving
address and fee before confirming. This sweeps the reviewed spendable PEP from
one derived legacy address, not other assets or HD accounts. Do not reuse the old
seed; retain its backup until any other assets are recovered. See the wallet
guide for exact supported phrase formats and expiry/cleanup behavior.

Activity now reconciles send attempts against all fetched address history before
limiting the displayed history to 30 entries, so older confirmed sends do not
reappear as outstanding after a refresh or reload. Existing test.14 send-refresh
behavior, ordinary-send limits, wallet storage and signing identity are unchanged.
Earlier prereleases remain available from this public repository's Releases page.

Version 0.1.0-test.14 tracks new ordinary sends until their first confirmation,
then freshly checks the input addresses, wallet change address and any wallet-owned
recipient. A focused refresh supersedes slower scans without allowing their late
results to overwrite it. Changed balances still require a fresh matching read
after four seconds. Public tracking metadata survives restart; background/lock
stops checks, and reopening first completes normal discovery. No transaction is
automatically rebroadcast. Older send records without this metadata continue to
use normal wallet refresh. The test.13 APK remains available as a separate release.

Version 0.1.0-test.13 adds full 200-address discovery on wallet load/unlock and
manual Rescan, sliding-window monitoring, Electrum status notifications, and the
blue lower-right Overview Rescan control. Receive now supports one-key WIF sweeps
with QR scanning, complete source-input validation, per-byte fees with a 25%
cushion, explicit fee review, staged submission progress and a first-confirmation
receipt screen. Pinned receiving-address preferences continue to select index 0.
Sweeps otherwise use the next verified unused receiving address.

Ordinary-send fees and limits are unchanged. Sweeps must fit one standard
transaction; oversized sources are rejected, never partially swept. Full Rescan
can delay balance publication and Send readiness while it completes. Discovery
does not extend beyond receiving index 199. See the wallet guide for these limits.

Version 0.1.0-test.12 includes polling optimization and Android URL
guards from PR #1. Each scan checks Electrum address status and reuses unchanged
live rows; restored disk-cache rows still require live fetches. Previous
transactions needed for spending are fetched concurrently. Polling and balance
stabilization remain 4 seconds. Wallet storage, derivation and debugging settings
are unchanged.

Version 0.1.0-test.11 fixes recovery-word keyboard focus: a delayed caret-selection
event no longer removes the suggestion selected with ArrowDown. Tests force that
event order and exercise repeated ArrowDown/Enter selections. The 4-second polling
and stability settings from test.10 are unchanged, as are wallet storage,
derivation, phrase validation and the debug setting.

Version 0.1.0-test.10 reduces foreground polling from 20 to 4 seconds and the
changed-balance stability wait from 25 to 4 seconds, retaining a fresh matching
server query before publication. Initial restore balances remain immediate.
Changed balances normally appear within roughly 8 seconds of server visibility,
plus request time, when reports stay consistent. The original base APK remains
available under 0.1.0-test.9.

This sideload APK uses the existing local development signing identity. It is
not production release signing. Android requires a matching package/signature
for an in-place update; never uninstall a funded wallet to bypass a mismatch.
Your own build generally has a different signing key. Back up first.

## Maintainer publication process

1. Build from the reviewed source tree with debugging disabled; run wallet tests,
   Android lint and `python3 whippet/tests/android_bundle.py` on that exact APK.
2. Run `python3 scripts/verify-apk.py PATH_TO_APK` with `ANDROID_HOME` set.
   It checks the actual signature, pinned certificate, package/version, SDK range,
   Android debugging/test-only flags, disabled backups/cleartext, and SHA-256.
   Signing keys stay outside Git and GitHub Actions.
3. Store the APK in an isolated `release-artifacts/<tag>` branch, not the `main`
   source history. Record the immutable artifact commit and hash in
   `release/manifest.json`. That transport branch contains only the deliberately
   distributable APK. It is not wallet storage and is not used to run code.
4. Submit source plus manifest through a pull request targeting protected `main`.
   After required checks pass and the PR is merged, tag the merged source commit.
   The release workflow fetches the pinned artifact commit, verifies hash and exact bundled
   source, independently verifies the signed APK against `release/signing-policy.json`,
   and attaches APK/checksum to a GitHub prerelease using its short-lived
   repository token. It never receives the signing key.
5. Verify the published download hash independently. Source archives correspond
   to the tagged source commit. Do not overwrite a published version's APK;
   increment the application version and create a new tag for changed builds.

The artifact transport branch makes locally signed publication possible without
putting a personal GitHub API token or Android signing key on the runner.
Checkout uses the short-lived repository token without persisting credentials.
The publisher authenticates its separate artifact fetch with the same token,
scoped to that GitHub HTTPS subprocess. Both public and private repositories are
supported; private release downloads require repository access.
The workflow has repository-content write permission only for release publication;
the ordinary test workflow is read-only. Neither workflow deploys servers or
installs the app on a phone. Review workflow changes like any privileged code.

If Actions is disabled, enable it for this repository or upload the verified APK
and checksum manually through the Releases interface. An upload is not complete
until the release asset is visible and its downloaded checksum matches.

## Signing-key custody and migration

The approved certificate is pinned separately from per-release metadata in
`release/signing-policy.json`. Its current channel is **development**, not
production. The file contains only public certificate metadata, never a private
key or password. Changing this trust pin is a security decision, not a routine
version bump. Never change it just to get a failed build through verification.

The verifier requires Android build-tools **35.0.1** and fails closed if they are
missing. The workflow installs that version and does not receive signing keys.
Local iteration builds can be checked without falsely claiming publication approval:

```sh
python3 scripts/verify-apk.py whippet/android/app/build/outputs/apk/liveTest/app-liveTest.apk --local
```

`--local` permits a local suffix and skips matching the already-published APK's
hash; all signer, package, version-code and manifest safety checks still apply.
The publisher never passes this option. App/WebView remote debugging is not
permitted in published builds. An unsigned release build,
QA package, unexpected signer, tampered APK or debugging-enabled APK must not ship.
The asset audit remains a separate mandatory check. These checks do not prove
that the signed native code was reproducibly built or that it is vulnerability-free.

Before creating or adopting a production signing identity:

1. Choose key custody deliberately: an offline signing machine/removable encrypted
   storage, or a managed signing service. Keep the private key out of the source
   tree, artifact branches, shell history, chat, logs and general-purpose CI.
2. Use a dedicated, strong, unique keystore password; keep it separately. Restrict
   filesystem access and keep at least two encrypted offline backups in separate
   places. Test recovery using a copy on an isolated machine. Never paste the key
   or password into a request for assistance.
3. Record and independently verify the **public certificate fingerprint** before
   adopting the key. Preserve the current development identity securely until
   the migration and compatibility plan is proven; do not delete or overwrite it.
4. Test upgrades with unfunded fixture wallets across the supported Android range,
   including encrypted wallet storage, device authentication and JSON recovery.
   A different signer is not automatically an in-place upgrade. Android key
   rotation support varies by version; Android 8 requires particular care.
5. Approve the package identity, signing lineage or explicit backup/restore
   migration, and user instructions before changing policy or publishing.
   Never instruct users to uninstall a funded wallet to bypass a signature error.

No production key is generated, copied, uploaded or rotated by the verification
scripts. The phone's current signing identity is unchanged. Android's official
[app-signing guide](https://developer.android.com/studio/publish/app-signing) and
[apksigner reference](https://developer.android.com/tools/apksigner) describe
certificate continuity and version-dependent rotation options.

Verification tests (no GitHub requests or phone access):

```sh
python3 -m unittest discover -s scripts/tests -v
SAFECORE_APK_INTEGRATION=1 python3 -m unittest scripts.tests.test_apk_security_integration -v
```

The opt-in integration suite needs the SDK tools above, Android 35's platform
and Java `keytool`. It generates and discards its own temporary signing key and
unsigned/signed/tampered APK fixtures; it never uses an operator's signing key.
