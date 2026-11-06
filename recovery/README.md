# Offline Whippet recovery tool

Generate or recover Whippet addresses and their matching private keys entirely
inside your browser. The folder is self-contained: it needs no server, package
installation, blockchain connection, or internet access.

## Run offline

1. Download this repository as a ZIP and extract it.
2. Open `recovery/index.html` in a current Chrome, Edge, or Firefox browser.
3. Generate a new phrase, enter an existing English BIP39 phrase, or choose
   **Import wallet JSON**.
4. Select an address count and derive the keys. The default is **200**, with a
   supported range of **1–1,000**.

Keep the whole `recovery` folder together, including `assets`. All JavaScript,
the English word list, and the cryptographic dependency are included locally.
The content security policy blocks network connections. The tool does not query
balances, sign payments, submit transactions, or use browser storage.

Word suggestions appear as you type. Choose a word, use the arrow keys to
select one, or press Tab/Enter to complete it. Suggestions do not silently
replace recovery words. Large derivations show progress and can be cancelled.

## Import and export

**Import wallet JSON** accepts:

- SafeCore/Whippet unprotected backups (`corevault-unprotected-v1`).
- SafeCore/Whippet encrypted backups (`pepecoin-whippet-encrypted-v1`). Enter
  the wallet password in the local prompt; decryption stays in the browser.
- Original generator backups (`whippet-seed-v1`).

Native backups without a saved generator address list use the address count
selected on the page. Existing BIP39 passphrases are preserved exactly; the
optional BIP39 passphrase and the encrypted backup's wallet password are
different recovery inputs.

| Export | Contents |
| --- | --- |
| Private JSON | Wallet-compatible recovery recipe plus every displayed address, public key and WIF private key |
| Keys TXT | One WIF private key per line |
| Addresses + keys TXT | Address number, derivation path, address and matching WIF key |
| Addresses + keys CSV | Address number, path, address, public key and WIF key |

All exports from this tool are **unencrypted**, including exports made after
unlocking an encrypted backup. JSON retains the phrase and optional passphrase;
TXT and CSV contain the individual keys. Save the recovery material before
clearing or refreshing the page. Neither the page nor the browser stores a
recovery copy for you.

The JSON uses SafeCore's unprotected envelope and recovery recipe, with a
`whippetGenerator` section that preserves the full verified generator bundle.
The wallet can import the recipe; this tool also verifies every saved key
against it. This format was tested through the wallet's actual import and
encrypted-export screens with all 1,000 Whippet addresses matching afterward.

## Recovery recipe

- Standard: English BIP39 seed, optional exact BIP39 passphrase, BIP32 children.
- Whippet path: `m/0'/3'/index'`, starting at index 0.
- P2PKH version: 73 (`0x49`); script version: 22 (`0x16`).
- WIF version: 158 (`0x9e`), with compressed public keys.

The first displayed address uses index 0. Preserve the path and passphrase when
recovering in another tool. Individual WIF keys can be imported into Whippet
Core; Core `wallet.dat` files are not JSON backups and are not imported here.

## Make a standalone ZIP

With Python 3, run from the repository root:

```sh
python3 recovery/package.py /tmp/whippet-recovery.zip
```

Extract the ZIP and open `whippet-recovery/index.html`. Packaging uses a fixed
allowlist and includes no wallet data, credentials, test outputs or other
repository components.

## Verify the recovery and backup formats

With Node.js 18 or newer:

```sh
node recovery/tests.cjs
```

The checks use a published BIP39 test vector. They cover the 200/1,000 address
bounds, exact key pairs, wallet-compatible JSON, encrypted wallet import,
wrong-password rejection, TXT/CSV exports and cancellation. No funded wallet
or network connection is used.

The included ethers.js 5.7.2 dependency retains its
[MIT license](assets/ethers.LICENSE). See the repository's
[third-party notices](../THIRD_PARTY_NOTICES.md) for the other components and
first-party licensing status.
