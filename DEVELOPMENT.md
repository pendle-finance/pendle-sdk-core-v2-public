# Pendle SDK v2 Development

## Dependencies installation

```sh
yarn
```

## Building

```sh
yarn build
```

## Testing

Clone [`.env.example`](.env.example) to a new `.env` file and edit it to match
your environment.

To set up the right environment (in case the prerequisites are not being done,
e.g. adding liquidity to pools), run all tests with the following script:

```sh
yarn test:coverage
```

Before running the test, you might want to funds your account with some test
assets by:

```sh
yarn test:prepare
```

By default, write function tests are disabled. To enable them, uncomment the
`INCLUDE_WRITE` field in `.env`. Do note that this will involve real funds.

### Notes

- Most of the test is to make sure that the SDK is working as expected (calling
the correct functions, using the correct parameters, calculating the correct
number). SDK tests are not meant to test the actual functionality of the contracts.


- When testing for write functions, it is better to use a local RPC (can set it up
with hardhat), so that you won't need real funds and it is faster and more stable
to run test on a local RPC.

### Limitations

- Tests for SDK vePendle are currently not implemented.
- All tests must run sequentially and not in parallel. Most of the tests require
  sending transactions, so running them in parallel will cause the transactions
  to fail due to nonce errors.

## Packages release notes
There are two release branches `main` (for mainnet) and `main-fuji` (for fuji testnet).
The developing branch is `develop`, so before publishing a new package, make sure
to cherry-pick/merge the features from `develop` into the corresponding branch.

The following steps should be done:
1. Checkout the `develop` branch and pull.
2. Checkout the desired release branch and pull.
3. `merge/cherry-pick` features from `develop`
4. `yarn`
5. `yarn publish`
6. `push`