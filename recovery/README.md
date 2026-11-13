# Offline Pepecoin, Whippet, Shibacoin and Litecoin recovery

Generate or recover Pepecoin, Whippet, Shibacoin or Litecoin addresses and their matching private keys entirely
inside your browser. The folder is self-contained: it needs no server, package
installation, blockchain connection, or internet access.

## Run offline

1. Download this repository as a ZIP and extract it.
2. Open `recovery/index.html` in a current Chrome, Edge, or Firefox browser.
3. Choose **Pepecoin**, **Litecoin (LTC)**, **Shibacoin (SHIC)** or **Whippet**, then generate a new phrase, enter an existing English BIP39 phrase, or choose
   **Import wallet JSON**.
4. Select an address count and derive the keys for that asset. The default is **200**, with a
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
- Original Whippet generator backups (`whippet-seed-v1`), Pepecoin bundles (`pepecoin-seed-v1`), and Shibacoin bundles (`shibacoin-seed-v1`).

Native backups without a saved generator address list use the address count
and asset selected on the page. A saved generator bundle selects its own asset
and verifies every saved key; switch assets and derive again to recover the other
coin from the same phrase. Existing BIP39 passphrases are preserved exactly; the
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
`whippetGenerator` (legacy Whippet) or `recoveryGenerator` (Pepecoin/Shibacoin) section that
preserves the full verified generator bundle. Filenames identify the asset.
The wallet can import the recipe; this tool also verifies every saved key
against it. This format was tested through the wallet's actual import and
encrypted-export screens with all 1,000 Whippet addresses matching afterward.

## Recovery recipe

- Standard: English BIP39 seed, optional exact BIP39 passphrase, BIP32 children.
- Pepecoin path: `m/44'/3434'/0'/0/index`, starting at index 0.
- Pepecoin P2PKH version: 56 (`0x38`); script version: 22 (`0x16`).
- Whippet path: `m/0'/3'/index'`, starting at index 0.
- Whippet P2PKH version: 73 (`0x49`); script version: 22 (`0x16`).
- Shibacoin path: `m/44'/4474'/0'/0/index`, starting at index 0.
- Shibacoin P2PKH version: 63 (`0x3f`); script version: 22 (`0x16`).
- Litecoin path: `m/44'/2'/0'/0/index`, starting at index 0 (legacy P2PKH).
- Litecoin P2PKH version: 48 (`0x30`); script version: 50 (`0x32`).
- WIF version: 158 (`0x9e`) for PEP/WHT/SHIC; 176 (`0xb0`) for LTC, with compressed public keys.

Litecoin backups use `litecoin-seed-v1` generator bundles and the existing SafeCore
wallet JSON formats. Older SafeCore recipes without `paths.ltc` derive the fixed
path above. MWEB, BIP49/BIP84 and other accounts/change branches are not scanned.

SHIC is the Shibacoin proof-of-work chain, not the SHIB token. Older SafeCore
backups without a SHIC path use this fixed path; an explicitly different SHIC
path is rejected. Existing PEP/WHT paths and backup format names are preserved.
The offline tool never queries Electrum or price services.

The first displayed address uses index 0. Preserve the path and passphrase when
recovering in another tool. These are SafeCore's receiving paths (account 0);
the tool does not scan other accounts or change branches. Legacy Komodo recovery
uses a different recipe and is not supported here. Individual WIF keys must be
imported into the matching coin's Core wallet; Core `wallet.dat` files are not
JSON backups and are not imported here.

Pepecoin parameters were checked against [Pepecoin Core](https://github.com/pepecoinppc/pepecoin/blob/master/src/chainparams.cpp)
and the [Pepecoin BIP39 reference](https://pepeenthusiast.github.io/bip39-pepecoin/).
The interface and implementation remain local to SafeCore; no reference-site
scripts or network services are loaded.

## Make a standalone ZIP

With Python 3, run from the repository root:

```sh
python3 recovery/package.py /tmp/safecore-recovery.zip
```

Extract the ZIP and open `safecore-recovery/index.html`. Packaging uses a fixed
allowlist and includes no wallet data, credentials, test outputs or other
repository components.

## Verify the recovery and backup formats

With Node.js 18 or newer, install the repository's development dependencies first:

```sh
npm ci
node recovery/tests.cjs
```

The optional interface checks require the repository's development dependencies
and Playwright Chromium (`npm ci`, then `npx playwright install chromium`):

```sh
node recovery/ui-tests.cjs
```

The checks use a published BIP39 test vector for all four assets. They cover the 200/1,000 address
bounds, exact key pairs, wallet-compatible JSON, encrypted wallet import,
wrong-password rejection, TXT/CSV exports and cancellation. No funded wallet
or network connection is used.

The included ethers.js 5.7.2 dependency retains its
[MIT license](assets/ethers.LICENSE). See the repository's
[third-party notices](../THIRD_PARTY_NOTICES.md) for the other components and
first-party licensing status.
