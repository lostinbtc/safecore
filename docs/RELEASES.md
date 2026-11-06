# APK prereleases

Download an APK only from this repository's Releases page. Compare its SHA-256
with the release checksum and inspect its signing-certificate fingerprint with
Android's `apksigner verify --print-certs`. Hashes detect changed bytes; they are
not an independent security audit or proof that source is safe.

This prerelease build is SafeCore 0.1.0-test.14, Android 8.0+ (API 26), with
`safeCoreDebugTools=false`. USB/WebView debugging and screenshots are disabled.
It starts without saved wallets on a fresh installation. It contains no desktop
database, recovery material, RPC credentials or signing private key.

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

Version 0.1.0-test.12 includes Chromatic's polling optimization and Android URL
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
2. Verify the Android manifest, signature, version, certificate fingerprint and
   SHA-256 locally. Signing keys stay outside Git and GitHub Actions.
3. Store the APK in an isolated `release-artifacts/<tag>` branch, not the `main`
   source history. Record the immutable artifact commit and hash in
   `release/manifest.json`. That transport branch contains only the deliberately
   public APK. It is not wallet storage and is not used to run code.
4. Submit source plus manifest through a pull request targeting protected `main`.
   After required checks pass and the PR is merged, tag the merged source commit.
   The release workflow fetches the pinned artifact commit, verifies hash and exact bundled
   source, and attaches APK/checksum to a GitHub prerelease using its short-lived
   repository token. It never receives the signing key.
5. Verify the published download hash independently. Source archives correspond
   to the tagged source commit. Do not overwrite a published version's APK;
   increment the application version and create a new tag for changed builds.

The artifact transport branch makes locally signed publication possible without
putting a personal GitHub API token or Android signing key on the runner.
The workflow has repository-content write permission only for release publication;
the ordinary test workflow is read-only. Neither workflow deploys servers or
installs the app on a phone. Review workflow changes like any privileged code.

If Actions is disabled, enable it for this repository or upload the verified APK
and checksum manually through the Releases interface. An upload is not complete
until the release asset is visible and its downloaded checksum matches.
