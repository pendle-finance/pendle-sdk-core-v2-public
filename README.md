Given the variety of assets Pendle now supports, along with their nuances, the
Pendle SDK project may not be the optimal solution for integration. As a
result, we have publicly archived this repository in favor of our new backend
for generating contract calldata, accessible
[here](https://api-v2.pendle.finance/sdk/). This backend incorporates most of
the functionalities utilized by our dApp, including the recent Limit Order
protocol, and provides enhanced ease of use compared to the SDK.

We encourage migration to our backend to ensure access to the latest updates!

---

# Pendle SDK v2

## Installation

```console
yarn add @pendle/sdk-v2
npm install @pendle/sdk-v2
```

## Playground and example

Here is the link to Pendle SDK-v2 playground, containing an example on how to add liquidity: [playground]. The playground can be used for quick testing, as well as for **bug report**.

Features:

- Local network fork.
- `impersonateAccount` for account impersonation.
- Human-readable ethers.js `BigNumber` when printing to console.
- Automatically revert after running.
- Test account with filled balances.

## Documentation

- [Pendle documentation](https://docs.pendle.finance/home)
- [Pendle SDK guides](https://pendle.notion.site/Pendle-SDK-v2-0763533cb4b5427c847f0c015baf3fd2)
  - [Guide source code](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/)
- [API reference](https://pendle-finance.github.io/pendle-sdk-core-v2-public/index.html)

[playground]: https://stackblitz.com/edit/stackblitz-starters-qslfae?file=README.md
