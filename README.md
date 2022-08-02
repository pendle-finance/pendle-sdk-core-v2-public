# pendle-sdk-core-v2

## How to test

Clone [`.env.example`](.env.example) to a new `.env` file and edit it to match
your environment.

To set up the right environment (in case the prerequisites are not being done,
e.g. adding liquidity to pools), run all tests below with the following script:

```sh
yarn test:all
```

By default, write function tests are disabled. To enable them, uncomment the
`INCLUDE_WRITE` field in `.env`. After unskipping the write function tests, fund
the account with USDC and PENDLE tokens, add liquidity for the markers if needed.
Do note that this will involve real funds.

### Notes

Most of the test is to make sure that the SDK is working as expected (calling
the correct functions, using the correct parameters, calculating the correct
number).

SDK tests are not meant to test the actual functionality of the contracts.

### Limitations

- Tests for SDK vePendle are currently not implemented.
- All tests must run sequentially and not in parallel. Most of the tests require
  sending transactions, so running them in parallel will cause the transactions
  to fail due to nonce errors.
