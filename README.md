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
the account with USDC and PENDLE tokens. Run the tests in the following order
(do note that this will involve real funds):

1. [ERC20](test/ERC20.spec.ts)
2. [SCY](test/SCY.spec.ts)
3. [YT](test/YT.spec.ts)
4. [PT](test/PT.spec.ts)
5. [YieldContractFactory](test/YieldContractFactory.spec.ts)
6. [SDK](test/SDK.spec.ts)
7. [Market](test/Market.spec.ts)
8. [MarketFactory](test/MarketFactory.spec.ts)
9. [Router](test/Router.spec.ts) (Might take some time to complete)
10. [VePendle](test/VePendle.spec.ts)
11. [VotingController](test/VotingController.spec.ts)
