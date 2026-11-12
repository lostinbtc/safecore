# Security and prerelease status

SafeCore is development software. It has not had an independent security audit.
Use expendable amounts, retain offline recovery backups, and verify a known
receiving address after restore. No guarantee of fund safety is made.

Read the [wallet risks and liability disclaimer](RISK_NOTICE.md). The same notice
appears on first use and remains available in **Settings → Information**.

Do not post recovery words, private keys, passwords, backup JSON, RPC credentials,
certificate private keys, signing keys or wallet storage in issues or screenshots.
Use GitHub's private vulnerability reporting if enabled. If it is unavailable,
request a private contact channel without disclosing exploit details publicly.

The wallet trusts its configured chain services for reported chain state. TLS and
genesis checks do not turn it into a full-node/SPV verifier. Public endpoints and
client network requests are visible to users/operators; they are not secrets.
Self-hosting reduces third-party dependence but requires secure node, RPC, TLS,
indexer, operating-system and backup administration.

Users can select per-coin Electrum servers in Settings. Only `wss://` endpoints
with normal certificate validation are accepted; credentials, query strings and
fragments are rejected. Probes check the coin genesis, chain height and relay fee
without sending wallet address queries or transactions. A successful probe is not
proof of honest chain data or guaranteed broadcast support. Changing connections
invalidates pending transaction reviews and restarts live discovery. Failed custom
connections do not silently fall back. The content policy permits arbitrary secure
WebSocket hosts for this feature; remote scripts remain disallowed.

The SHIC integration uses an external Shibacoin Electrum WSS server,
with certificate validation and a pinned mainnet genesis. SHIC price estimates
use CoinGecko's public price endpoint; the provider sees IP addresses but the
request contains no wallet identifiers, balances or recovery material. Quotes
are display-only, expire, and cannot authorize a transaction. The offline
recovery tool still makes no network requests.

The Litecoin integration also uses an external, genesis-pinned WSS server
and shares the public CoinGecko request with SHIC. LTC has separate fee/dust and
maturity rules; the PEP/WHT/SHIC flat fee must never be used for LTC. Only legacy
wallet keys are signed. Litecoin previous-transaction IDs exclude witness/MWEB
extension data by Core's definition; only hash-bound transparent outputs are used.
This does not implement or validate private MWEB transfers. Existing encrypted
storage and device-authentication boundaries remain unchanged.

Password protection is optional. In this source version, Android encrypts all saved
wallet records using AES-256-GCM and a non-exportable Android Keystore key, even
without a wallet password starting in test.17. Browsers still store password-free recipes in plaintext, and
unprotected exports remain plaintext on every platform. Public caches/preferences
are not encrypted. The optional **Use device authentication** setting re-encrypts
the store with an authentication-required Keystore key. Both enabling and disabling
require OS authentication. First-wallet creation or restore defaults to enabling
it when a secure phone screen lock exists; cancellation stops setup before saving
the wallet. Existing installations and later opt-outs are preserved. Without a
screen lock, device encryption remains available without authentication.
With it off, encryption alone does not block someone
using an unlocked app. With it on, returning from the background requires a fresh
OS prompt; the old WebView is destroyed to discard its in-memory wallet state.
Reveal, export and send confirmation also request fresh OS authentication.
The timed Keystore authorization lasts 60 seconds; cryptographic operations can
require another prompt after that interval. This is not hardware transaction
signing or protection against a compromised running process. Hardware backing
depends on the device; no hardware-wallet claim is made. Removing the phone screen
lock can invalidate the key; keep separate recovery backups and disable this
setting before removing the phone lock. Cancellation never disables protection.
Debugging is disabled in the published prerelease.
Screenshot blocking defaults on; the local Android settings control can allow
captures after confirmation. Neither screenshot blocking nor hidden balances is
a substitute for encryption. Uninstalling may
erase the only local copy; use an independent recovery backup first.

The prerelease APK uses a development signing identity, not a production release
key. Check release hashes and the signing-certificate fingerprint before install.
Do not uninstall a funded wallet merely to bypass an Android signature mismatch.
Review dependencies and upstream security updates before public server deployment.

The local release-verification change checks the APK signature against the public
certificate pin in `release/signing-policy.json`, plus actual package/version,
Android debuggable/test-only flags, backup restrictions and cleartext policy.
Publication must pass this check before any release API call; manifest claims alone
are insufficient. Missing tools or failed checks stop publication. This does not
replace independent review, protect against a compromised approved signing key,
or establish reproducible native builds. Temporary storage diagnostic codes and
logging have been removed; Android/WebView debugging remains disabled.
No production key has been created or rotated by this change. See
[release signing and migration](docs/RELEASES.md#signing-key-custody-and-migration)
before selecting a production identity.

Maintainers: keep operational values in ignored local files; review the staged
tree and artifact contents before every push. Ignore rules do not scrub existing
Git history. A secret scan is a useful check, not proof that no secret exists.

`.gitleaks.toml` narrowly allows known public upstream test vectors, on-chain
data and shared defaults in the byte-identical ethers bundle. Exceptions match
both an exact file path and an exact value; entire test directories are not
excluded. They are not credentials for the deployed infrastructure. Review any
change to those exceptions rather than suppressing a new finding blindly.
