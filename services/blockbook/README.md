## SafeCore Pepecoin fork notice

Notice updated: **2026-11-07**.

This is a modified fork of [Blockbook](https://github.com/trezor/blockbook),
originally created by SatoshiLabs / Trezor and its contributors. The included
changes add Pepecoin parser/RPC support, mainnet/testnet coin configurations,
and a container build/deployment path. It is not an unmodified upstream release
or a statement of endorsement by the upstream authors. The fork remains under
[GNU AGPL-3.0](COPYING); original copyright and license notices are retained.

For this checkout, use the [included Dockerfile](Dockerfile) and
[SafeCore setup instructions](../../docs/SELF_HOSTING.md), with dependency versions
recorded in [go.mod](go.mod), [go.sum](go.sum) and the Dockerfile. The upstream
documentation below is retained for reference; its `make`/Debian packaging path
references a `build/` tooling directory that is not included in this checkout.

### Pepecoin Service deployment source

On 2026-11-07, the 241 selected runtime source, asset, module and license files
checked against the source bundled in the running Pepecoin Service Blockbook
container matched this repository byte-for-byte. This was a source comparison,
not a reproducible-binary or security audit.

[Dockerfile.deployed](Dockerfile.deployed) preserves the build recipe from that
running container (Go 1.21 / Debian Bullseye / RocksDB v7.7.2). The default
[Dockerfile](Dockerfile) uses Bookworm and limits parallel build jobs; it is not
the exact deployed recipe. To select the archived recipe, build from this directory
with `docker build -f Dockerfile.deployed -t pepecoin-blockbook-deployed .`.
Production RPC credentials and data are intentionally excluded; configure your
own node using the [safe deployment templates](../../docs/SELF_HOSTING.md).

Operators of modified network services must prominently offer users free access
to the corresponding source of the deployed version, including modifications and
required build/install scripts. An upstream link or private checkout alone does
not fulfill that source offer. See [AGPL section 13](COPYING).

---

[![Go Report Card](https://goreportcard.com/badge/trezor/blockbook)](https://goreportcard.com/report/trezor/blockbook)

# Blockbook

**Blockbook** is a back-end service for Trezor Suite. The main features of **Blockbook** are:

-   index of addresses and address balances of the connected block chain
-   fast index search
-   simple blockchain explorer
-   websocket, API and legacy Bitcore Insight compatible socket.io interfaces
-   support of multiple coins (Bitcoin and Ethereum type) with easy extensibility to other coins
-   scripts for easy creation of debian packages for backend and blockbook

## Build and installation instructions

Officially supported platform is **Debian Linux** and **AMD64** architecture.

Memory and disk requirements for initial synchronization of **Bitcoin mainnet** are around 32 GB RAM and over 180 GB of disk space. After initial synchronization, fully synchronized instance uses about 10 GB RAM.
Other coins should have lower requirements, depending on the size of their block chain. Note that fast SSD disks are highly
recommended.

User installation guide is [here](<https://wiki.trezor.io/User_manual:Running_a_local_instance_of_Trezor_Wallet_backend_(Blockbook)>).

Developer build guide is [here](docs/build.md).

Contribution guide is [here](CONTRIBUTING.md).

## Implemented coins

Blockbook currently supports over 30 coins. The Trezor team implemented

-   Bitcoin, Bitcoin Cash, Zcash, Dash, Litecoin, Bitcoin Gold, Ethereum, Ethereum Classic, Dogecoin, Namecoin, Vertcoin, DigiByte, Liquid

the rest of coins were implemented by the community.

Testnets for some coins are also supported, for example:

-   Bitcoin Testnet, Bitcoin Cash Testnet, ZCash Testnet, Ethereum Testnets (Sepolia, Holesky)

List of all implemented coins is in [the registry of ports](docs/ports.md).

## Common issues when running Blockbook or implementing additional coins

#### Out of memory when doing initial synchronization

How to reduce memory footprint of the initial sync:

-   disable rocksdb cache by parameter `-dbcache=0`, the default size is 500MB
-   run blockbook with parameter `-workers=1`. This disables bulk import mode, which caches a lot of data in memory (not in rocksdb cache). It will run about twice as slowly but especially for smaller blockchains it is no problem at all.

Please add your experience to this [issue](https://github.com/trezor/blockbook/issues/43).

#### Error `internalState: database is in inconsistent state and cannot be used`

Blockbook was killed during the initial import, most commonly by OOM killer.
By default, Blockbook performs the initial import in bulk import mode, which for performance reasons does not store all data immediately to the database. If Blockbook is killed during this phase, the database is left in an inconsistent state.

See above how to reduce the memory footprint, delete the database files and run the import again.

Check [this](https://github.com/trezor/blockbook/issues/89) or [this](https://github.com/trezor/blockbook/issues/147) issue for more info.

#### Running on Ubuntu

[This issue](https://github.com/trezor/blockbook/issues/45) discusses how to run Blockbook on Ubuntu. If you have some additional experience with Blockbook on Ubuntu, please add it to [this issue](https://github.com/trezor/blockbook/issues/45).

#### My coin implementation is reporting parse errors when importing blockchain

Your coin's block/transaction data may not be compatible with `BitcoinParser` `ParseBlock`/`ParseTx`, which is used by default. In that case, implement your coin in a similar way we used in case of [zcash](https://github.com/trezor/blockbook/tree/master/bchain/coins/zec) and some other coins. The principle is not to parse the block/transaction data in Blockbook but instead to get parsed transactions as json from the backend.

## Data storage in RocksDB

Blockbook stores data the key-value store RocksDB. Database format is described [here](docs/rocksdb.md).

## API

Blockbook API is described [here](docs/api.md).
