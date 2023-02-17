import { BulkSeller } from '@pendle/core-v2/typechain-types';
import BigNumber from 'bignumber.js';
import { BigNumber as BN, ethers, providers } from 'ethers';
import {
    Address,
    BulkSellerABI,
    KyberHelper,
    NATIVE_ADDRESS_0x00,
    Router,
    createContractObject,
    decimalFactor,
    isSameAddress,
    toAddress,
} from '../src';

// TODO export classes
import { GasFeeEstimator } from '../src/entities/Router/GasFeeEstimator';
import {
    BALANCE_OF_STORAGE_SLOT,
    DEFAULT_EPSILON,
    EPSILON_FOR_AGGREGATOR,
    INF,
    SLIPPAGE_TYPE2,
} from './util/constants';
import { BLOCK_CONFIRMATION, currentConfig, describeWrite, networkConnectionWithChainId, signer } from './util/testEnv';
import {
    approveHelper,
    approveInfHelper,
    evm_revert,
    evm_snapshot,
    getERC20Decimals,
    getERC20Name,
    getUserBalances,
    increaseNativeBalance,
    setERC20Balance,
} from './util/testHelper';
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
              MARKETS_TO_TEST: [currentConfig.markets[6]!].filter((m) => m !== undefined),
              ETH_AMOUNTS_TO_TEST: [4.9],
          };

// get token price by swap 1 ETH for token by kyber swap
async function getTokenPriceEth(address: Address): Promise<BigNumber> {
    const kyber = new KyberHelper(NATIVE_ADDRESS_0x00, networkConnectionWithChainId);
    const tokenDecimals = await getERC20Decimals(address);
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
    'estimateEthOut',
    'actualReceived',
    'usedBulkSeller',
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
    'estimateEthOut',
    'actualReceived',
    'usedBulkSeller',
    'selected',
] as const);

class ConstantGasFeeEstimator extends GasFeeEstimator {
    constructor(readonly constGasFee: BN, readonly provider: providers.Provider) {
        super(provider);
    }

    override async getGasFee(): Promise<BN> {
        return this.constGasFee;
    }
}

describeWrite('Routing', () => {
    const router = Router.getRouter({
        ...networkConnectionWithChainId,
        gasFeeEstimator: new ConstantGasFeeEstimator(
            BN.from(10).pow(/* gwei decimal = */ 9).mul(25),
            networkConnectionWithChainId.provider
        ),
    });
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
                tokenDecimal = await getERC20Decimals(token);
                await increaseNativeBalance(signerAddress);

                await approveHelper(token, router.address, 0);
                await approveInfHelper(token, router.address);
                await approveInfHelper(market.market, router.address);

                const balance = INF.div(10);
                const slotInfo = BALANCE_OF_STORAGE_SLOT[token];

                if (slotInfo !== undefined) {
                    await setERC20Balance(token, signerAddress, balance, slotInfo[0], slotInfo[1]);
                }
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
        market: typeof MARKETS_TO_TEST[number],
        token: Address,
        ethAmount: number,
        tokenAmountToTest: BN
    ) {
        const currentTestId = testId++;
        async function addLiquidityPhase(): Promise<{ netLpOut: BN }> {
            const tokenAmount = tokenAmountToTest;
            const [lpBalanceBefore, tokenBalanceBefore] = await getUserBalances(signerAddress, [market.market, token]);

            if (tokenBalanceBefore.lt(tokenAmount)) {
                throw new Error(
                    `Not enough balance, expected: ${tokenAmount.toString()}, got: ${tokenBalanceBefore.toString()}`
                );
            }

            const metaMethod = await router.addLiquiditySingleToken(market.market, token, tokenAmount, SLIPPAGE_TYPE2, {
                method: 'meta-method',
            });
            const tx = await metaMethod
                .connect(signer)
                .send()
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const [lpBalanceAfter, tokenBalanceAfter] = await getUserBalances(signerAddress, [market.market, token]);

            const usedBulkSeller = !isSameAddress(await metaMethod.data.route.getUsedBulk(), NATIVE_ADDRESS_0x00);

            if (usedBulkSeller) {
                // check if bulkseller is used by checking log
                const bulkSellerContract = createContractObject<BulkSeller>(NATIVE_ADDRESS_0x00, BulkSellerABI, {
                    provider: networkConnectionWithChainId.provider,
                });

                const filter = bulkSellerContract.filters.SwapExactTokenForSy();
                const events = tx.logs.filter((log) =>
                    isSameAddress(toAddress(log.topics[0]), toAddress(filter.topics![0] as string))
                );

                expect(events.length).toBeGreaterThan(0);
            }

            const exactOut = lpBalanceAfter.sub(lpBalanceBefore);
            expect(exactOut).toEqBN(metaMethod.data.netLpOut, EPSILON_FOR_AGGREGATOR);
            expect(tokenBalanceBefore.sub(tokenBalanceAfter)).toEqBN(tokenAmount, DEFAULT_EPSILON);

            const routes = [...metaMethod.data.route.context.routes];

            for (const route of routes) {
                const selected =
                    route.tokenMintSy == metaMethod.data.route.tokenMintSy &&
                    route.withBulkSeller == metaMethod.data.route.withBulkSeller;
                const usedBulkSeller = !isSameAddress(await route.getUsedBulk(), NATIVE_ADDRESS_0x00);
                const gasUsedBN = await route.getGasUsed();
                const gasUsedStr = gasUsedBN.eq(INF) ? 'null' : gasUsedBN.toString();
                const netOut = await route.getNetOut().then(nullOrToEthAmount);
                const actualReceived = await route.estimateActualReceivedInEth().then(nullOrToEthAmount);
                const estimateEthOut = await route.estimateNetOutInEth().then(nullOrToEthAmount);
                const tokenName = await getERC20Name(token);
                const tokenMintSyName = await getERC20Name(route.tokenMintSy);
                const actualAmountInEth = await route.estimateSourceTokenAmountInEth().then(nullOrToEthAmount);

                zapInData.addRow({
                    id: currentTestId,
                    market: market.market,
                    ethAmount: actualAmountInEth,
                    token: tokenName,
                    tokenAmount: tokenAmount.toString(),
                    tokenMintSy: tokenMintSyName,
                    gasUsed: gasUsedStr,
                    netLpOut: netOut,
                    estimateEthOut: estimateEthOut,
                    actualReceived: actualReceived,
                    usedBulkSeller: usedBulkSeller,
                    selected: selected,
                });
            }
            return { netLpOut: lpBalanceAfter.sub(lpBalanceBefore) };
        }

        async function removeLiquidityPhase(lpAmountToRemove: BN) {
            const [lpBalanceBefore, tokenBalanceBefore] = await getUserBalances(signerAddress, [market.market, token]);
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

            const tx = await metaMethod
                .connect(signer)
                .send()
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const [lpBalanceAfter, tokenBalanceAfter] = await getUserBalances(signerAddress, [market.market, token]);
            const usedBulkSeller = !isSameAddress(await metaMethod.data.route.getUsedBulk(), NATIVE_ADDRESS_0x00);

            if (usedBulkSeller) {
                // check if bulkseller is used by checking log
                const bulkSellerContract = createContractObject<BulkSeller>(NATIVE_ADDRESS_0x00, BulkSellerABI, {
                    provider: networkConnectionWithChainId.provider,
                });

                const filter = bulkSellerContract.filters.SwapExactSyForToken();
                const events = tx.logs.filter((log) =>
                    isSameAddress(toAddress(log.topics[0]), toAddress(filter.topics![0] as string))
                );

                expect(events.length).toBeGreaterThan(0);
            }

            const exactOut = lpBalanceBefore.sub(lpBalanceAfter);
            expect(exactOut).toEqBN(lpAmountToRemove, EPSILON_FOR_AGGREGATOR);
            expect(tokenBalanceAfter.sub(tokenBalanceBefore)).toEqBN(
                (await metaMethod.data.route.getNetOut())!,
                DEFAULT_EPSILON
            );

            const routes = [...metaMethod.data.route.context.routes];

            for (const route of routes) {
                const selected =
                    route.tokenRedeemSy == metaMethod.data.route.tokenRedeemSy &&
                    route.withBulkSeller == metaMethod.data.route.withBulkSeller;
                const usedBulkSeller = !isSameAddress(await route.getUsedBulk(), NATIVE_ADDRESS_0x00);
                const gasUsedBN = await route.getGasUsed();
                const gasUsedStr = gasUsedBN.eq(INF) ? 'null' : gasUsedBN.toString();
                const netOut = await route.getNetOut().then(nullOrToEthAmount);
                const actualReceived = await route.estimateActualReceivedInEth().then(nullOrToEthAmount);
                const estimateEthOut = await route.estimateNetOutInEth().then(nullOrToEthAmount);
                const tokenName = await getERC20Name(token);
                const tokenRedeemSy = await getERC20Name(route.tokenRedeemSy);

                zapOutData.addRow({
                    id: currentTestId,
                    market: market.market,
                    ethAmount: ethAmount,
                    token: tokenName,
                    lpAmountToRemove: lpAmountToRemove.toString(),
                    tokenRedeemSy,
                    gasUsed: gasUsedStr,
                    netTokenOut: netOut,
                    estimateEthOut: estimateEthOut,
                    actualReceived: actualReceived,
                    usedBulkSeller: usedBulkSeller,
                    selected: selected,
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

function nullOrToEthAmount<T extends null | undefined | { toString(): string }>(value: T): string {
    const str = nullOrToString(value);
    return formatEthAmount(str);
}
