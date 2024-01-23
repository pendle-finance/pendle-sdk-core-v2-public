import BigNumber from 'bignumber.js';
import { BigNumber as BN, ethers } from 'ethers';
import { Address, NATIVE_ADDRESS_0x00, Router, decimalFactor, toAddress } from '../src';
import * as pendleSDK from '../src';

// TODO export classes
import { DEFAULT_EPSILON, EPSILON_FOR_AGGREGATOR, INF, SLIPPAGE_TYPE2 } from './util/constants';
import { BLOCK_CONFIRMATION, currentConfig, networkConnectionWithChainId, signer } from './util/testEnv';
import { evm_revert, evm_snapshot, increaseNativeBalance, print, setERC20Balance } from './util/testHelper';
import * as tokenHelper from './util/tokenHelper';
import * as testHelper from './util/testHelper';
import { CsvWriter } from './util/CsvWriter';

const { TOKENS_TO_TEST, MARKETS_TO_TEST, ETH_AMOUNTS_TO_TEST } =
    process.env.ROUTING_FULL_TEST === '1'
        ? {
              TOKENS_TO_TEST: [
                  currentConfig.tokens.USDC,
                  currentConfig.tokens.WETH,
                  toAddress('0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'), // wstETH
              ],
              MARKETS_TO_TEST: currentConfig.markets,
              ETH_AMOUNTS_TO_TEST: [4.9, 10, 30, 100],
          }
        : {
              TOKENS_TO_TEST: [currentConfig.tokens.USDC],
              MARKETS_TO_TEST: [currentConfig.markets[0]!].filter(
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                  (m) => m != undefined
              ),
              ETH_AMOUNTS_TO_TEST: [4.9],
          };

// get token price by swap 1 ETH for token by kyber swap
async function getTokenPriceEth(address: Address): Promise<BigNumber> {
    const kyber = currentConfig.aggregatorHelper;
    const tokenDecimals = await tokenHelper.getERC20Decimals(address);
    const ethDecimals = 18;
    const amount = decimalFactor(ethDecimals);

    const result = await kyber.makeCall({ token: NATIVE_ADDRESS_0x00, amount }, address, 0.2);
    if (result === undefined) throw new Error('Cannot get price for token ' + address);
    const price = new BigNumber(1)
        .dividedBy(result.outputAmount.toString())
        .multipliedBy(decimalFactor(tokenDecimals).toString());
    return price;
}

const zapInData = new CsvWriter([
    'id',
    'market',
    'ethAmount',
    'token',
    'tokenAmount',
    'tokenMintSy',
    'gasUsed',
    'netLpOut',
    'estimatedEthOut',
    'actualReceived',
    'selected',
] as const);

const zapOutData = new CsvWriter([
    'id',
    'market',
    'ethAmount',
    'token',
    'lpAmountToRemove',
    'tokenRedeemSy',
    'gasUsed',
    'netTokenOut',
    'estimatedEthOut',
    'actualReceived',
    'selected',
] as const);

testHelper.describeIf(currentConfig.chainId === pendleSDK.CHAIN_ID_MAPPING.ARBITRUM)('Routing', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();
    const router = Router.getRouter(currentConfig.routerConfig);
    const signerAddress = networkConnectionWithChainId.signerAddress;

    afterAll(async () => {
        await Promise.all([
            zapInData.dumpToFile('addLiquiditySingleToken.csv'),
            zapOutData.dumpToFile('removeLiquiditySingleToken.csv'),
        ]);
    });

    const marketData = MARKETS_TO_TEST.map(
        (market) =>
            [`${market.market} - ${market.name} - ${new Date(market.expiry * 1000).toDateString()}`, market] as const
    );

    describe.each(marketData)('Market: %s', (_, market) => {
        describe.each(TOKENS_TO_TEST)('Token: %s', (token) => {
            let tokenPrice: BigNumber;
            let tokenDecimal: number;
            let snapshot: string;

            beforeAll(async () => {
                tokenDecimal = await tokenHelper.getERC20Decimals(token);
                await increaseNativeBalance(signerAddress);

                await tokenHelper.approve(token, router.address, 0);
                await tokenHelper.approveInf(token, router.address);
                await tokenHelper.approveInf(market.market, router.address);

                const balance = INF.div(10);

                await setERC20Balance(token, signerAddress, balance);
                snapshot = await evm_snapshot();
            });

            beforeEach(async () => {
                tokenPrice = await getTokenPriceEth(token);
            });

            afterEach(async () => {
                await evm_revert(snapshot);
            });

            describe.each(ETH_AMOUNTS_TO_TEST)('Amount: %s ETH', (ethAmount) => {
                it('#addLiquiditySingleToken then #removeLiquiditySingleToken', async () => {
                    const tokenAmountToTest = BN.from(
                        new BigNumber(ethAmount)
                            .dividedBy(tokenPrice)
                            .multipliedBy(decimalFactor(tokenDecimal).toString())
                            .toFixed(0)
                    );
                    await testcase(market, token, ethAmount, tokenAmountToTest);
                });
            });
        });
    });

    let testId = 0;
    async function testcase(
        market: (typeof MARKETS_TO_TEST)[number],
        token: Address,
        ethAmount: number,
        tokenAmountToTest: BN
    ) {
        const currentTestId = testId++;
        async function addLiquidityPhase(): Promise<{ netLpOut: BN }> {
            const tokenAmount = tokenAmountToTest;
            const [lpBalanceBefore, tokenBalanceBefore] = await tokenHelper.getUserBalances(signerAddress, [
                market.market,
                token,
            ]);

            if (tokenBalanceBefore.lt(tokenAmount)) {
                throw new Error(
                    `Not enough balance, expected: ${tokenAmount.toString()}, got: ${tokenBalanceBefore.toString()}`
                );
            }

            const metaMethod = await router.addLiquiditySingleToken(market.market, token, tokenAmount, SLIPPAGE_TYPE2, {
                method: 'meta-method',
            });
            const _tx = await metaMethod
                .connect(signer)
                .send()
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const [lpBalanceAfter, tokenBalanceAfter] = await tokenHelper.getUserBalances(signerAddress, [
                market.market,
                token,
            ]);

            const exactOut = lpBalanceAfter.sub(lpBalanceBefore);
            expect(exactOut).toEqBN(metaMethod.data.netLpOut, EPSILON_FOR_AGGREGATOR);
            expect(tokenBalanceBefore.sub(tokenBalanceAfter)).toEqBN(tokenAmount, DEFAULT_EPSILON);

            const routes = [
                ...('loRoutingResult' in metaMethod.data ? metaMethod.data.loRoutingResult.allRoutes : []),
                ...('tokenMintSySelectionRoutingResult' in metaMethod.data
                    ? metaMethod.data.tokenMintSySelectionRoutingResult.allRoutes
                    : []),
            ];
            const gasFee = await router.gasFeeEstimator.getGasFee();

            for (const route of routes) {
                const selected = route === metaMethod.data.route;
                const gasUsedBN = await pendleSDK.Route.estimateGasUsed(route).catch(() => ethers.constants.MaxUint256);
                const gasUsedStr = gasUsedBN.eq(INF) ? 'null' : gasUsedBN.toString();
                const netOut = await pendleSDK.Route.getNetOut(route).catch(() => BN.from(-1));
                const estimatedEthOut = await pendleSDK.Route.estimateNetOutInNative(route).catch(() => BN.from(-1));
                const actualReceived = estimatedEthOut.sub(gasUsedBN.mul(gasFee));
                const tokenName = await tokenHelper.getERC20Name(token);
                const tokenMintSyName = await tokenHelper.getERC20Name(
                    await pendleSDK.Route.getSYIOTokenAmount(route).then(({ token }) => token)
                );
                const actualAmountInEth = await router.tokenAmountConverter(
                    router,
                    { token, amount: tokenAmount },
                    pendleSDK.NATIVE_ADDRESS_0x00
                );
                const debugInfo = await pendleSDK.Route.gatherDebugInfo(route);
                print({ debugInfo });

                zapInData.addRow({
                    id: currentTestId,
                    market: market.market,
                    ethAmount: actualAmountInEth,
                    token: tokenName,
                    tokenAmount: tokenAmount.toString(),
                    tokenMintSy: tokenMintSyName,
                    gasUsed: gasUsedStr,
                    netLpOut: netOut,
                    estimatedEthOut,
                    actualReceived,
                    selected: selected,
                });
            }
            return { netLpOut: lpBalanceAfter.sub(lpBalanceBefore) };
        }

        async function removeLiquidityPhase(lpAmountToRemove: BN) {
            const [lpBalanceBefore, tokenBalanceBefore] = await tokenHelper.getUserBalances(signerAddress, [
                market.market,
                token,
            ]);
            if (lpBalanceBefore.lt(lpAmountToRemove)) {
                throw new Error(
                    `Not enough balance, expected: ${lpAmountToRemove.toString()}, got: ${lpBalanceBefore.toString()}`
                );
            }

            const metaMethod = await router.removeLiquiditySingleToken(
                market.market,
                lpAmountToRemove,
                token,
                SLIPPAGE_TYPE2,
                {
                    method: 'meta-method',
                }
            );

            const _tx = await metaMethod
                .connect(signer)
                .send()
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const [lpBalanceAfter, tokenBalanceAfter] = await tokenHelper.getUserBalances(signerAddress, [
                market.market,
                token,
            ]);

            const exactOut = lpBalanceBefore.sub(lpBalanceAfter);
            expect(exactOut).toEqBN(lpAmountToRemove, EPSILON_FOR_AGGREGATOR);
            expect(tokenBalanceAfter.sub(tokenBalanceBefore)).toEqBN(
                await pendleSDK.Route.getNetOut(metaMethod.data.route),
                DEFAULT_EPSILON
            );

            const routes = [
                ...('tokenMintSySelectionRoutingResult' in metaMethod.data
                    ? metaMethod.data.tokenRedeemSySelectionRoutingResult.allRoutes
                    : []),
            ];

            const gasFee = await router.gasFeeEstimator.getGasFee();

            for (const route of routes) {
                const selected = route === metaMethod.data.route;
                const gasUsedBN = await pendleSDK.Route.estimateGasUsed(route).catch(() => ethers.constants.MaxUint256);
                const gasUsedStr = gasUsedBN.eq(INF) ? 'null' : gasUsedBN.toString();
                const netOut = await pendleSDK.Route.getNetOut(route).catch(() => BN.from(-1));
                const estimatedEthOut = await pendleSDK.Route.estimateNetOutInNative(route).catch(() => BN.from(-1));
                const actualReceived = estimatedEthOut.sub(gasUsedBN.mul(gasFee));
                const tokenName = await tokenHelper.getERC20Name(token);
                const tokenRedeemSy = await tokenHelper.getERC20Name(
                    await pendleSDK.Route.getSYIOTokenAmount(route).then(({ token }) => token)
                );
                const debugInfo = await pendleSDK.Route.gatherDebugInfo(route);
                print({ debugInfo });

                zapOutData.addRow({
                    id: currentTestId,
                    market: market.market,
                    ethAmount: ethAmount,
                    token: tokenName,
                    lpAmountToRemove: lpAmountToRemove.toString(),
                    tokenRedeemSy,
                    gasUsed: gasUsedStr,
                    netTokenOut: netOut,
                    estimatedEthOut,
                    actualReceived,
                    selected,
                });
            }
        }

        const { netLpOut } = await addLiquidityPhase();
        await removeLiquidityPhase(netLpOut);
    }
});

function nullOrToString<T extends null | undefined | { toString(): string }>(value: T): string {
    if (value != undefined) return value.toString();
    return 'null';
}

function formatEthAmount(amount: string) {
    if (amount == 'null') return amount;
    return ethers.utils.formatEther(amount);
}

function _nullOrToEthAmount<T extends null | undefined | { toString(): string }>(value: T): string {
    const str = nullOrToString(value);
    return formatEthAmount(str);
}
