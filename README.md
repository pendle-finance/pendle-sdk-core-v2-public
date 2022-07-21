# pendle-sdk-core-v2

## How to test

Clone [`.env.example`](.env.example) to a new `.env` file and edit it to match
your environment.

By default, write function tests are disabled. To enable them, uncomment the
`INCLUDE_WRITE` field in `.env`. After unskipping the write function tests, fund
the account with USDC and PENDLE tokens. Run the tests in the following order
(do note that this will involve real funds):

1. [SCY](test/SCY.spec.ts)
2. [YT](test/YT.spec.ts)
3. [PT](test/PT.spec.ts)
4. [YieldContractFactory](test/YieldContractFactory.spec.ts)
5. [SDK](test/SDK.spec.ts)
6. [Market](test/Market.spec.ts)
7. [MarketFactory](test/MarketFactory.spec.ts)
8. [Router](test/Router.spec.ts) (Might take some time to complete)
9. [VePendle](test/VePendle.spec.ts)
10. [VotingController](test/VotingController.spec.ts)
