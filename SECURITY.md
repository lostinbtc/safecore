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

Password protection is optional. Without it, the seed recipe is stored in
plaintext locally and in backups. Debugging is disabled in the published prerelease.
Screenshot blocking defaults on; the local Android settings control can allow
captures after confirmation. Neither screenshot blocking nor hidden balances is
a substitute for encryption. Uninstalling may
erase the only local copy; use an independent recovery backup first.

The prerelease APK uses a development signing identity, not a production release
key. Check release hashes and the signing-certificate fingerprint before install.
Do not uninstall a funded wallet merely to bypass an Android signature mismatch.
Review dependencies and upstream security updates before public server deployment.

Maintainers: keep operational values in ignored local files; review the staged
tree and artifact contents before every push. Ignore rules do not scrub existing
Git history. A secret scan is a useful check, not proof that no secret exists.

`.gitleaks.toml` narrowly allows known public upstream test vectors, on-chain
data and shared defaults in the byte-identical ethers bundle. Exceptions match
both an exact file path and an exact value; entire test directories are not
excluded. They are not credentials for the deployed infrastructure. Review any
change to those exceptions rather than suppressing a new finding blindly.
