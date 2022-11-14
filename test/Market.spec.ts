import { MarketEntity, SyEntity, Multicall, toAddress, getRouterStatic, decimalFactor } from '../src';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    networkConnectionWithChainId,
    signer as sender,
    signerAddress as senderAddress,
} from './util/testEnv';
import { describeWithMulticall } from './util/testHelper';

describe(MarketEntity, () => {
    const currentMarket = currentConfig.market;
    const market = new MarketEntity(currentMarket.market, networkConnectionWithChainId);
    const contract = market.contract;
    const sy = new SyEntity(currentMarket.SY, networkConnectionWithChainId);
    const routerStatic = getRouterStatic(networkConnectionWithChainId);

    it('#constructor', () => {
        expect(market).toBeInstanceOf(MarketEntity);
        expect(market.address).toBe(currentConfig.marketAddress);
        expect(market.chainId).toBe(ACTIVE_CHAIN_ID);
        // expect(market.contract).toBeInstanceOf(Contract);
        // expect(market.pendleMarketContract).toBeInstanceOf(Contract);
        expect(market.contract.address).toBe(currentConfig.marketAddress);
    });

    describeWithMulticall((multicall) => {
        it('#contract', async () => {
            const [totalSupply, tokens, isExpired, _rewardTokens, _state] = await Promise.all([
                contract.totalSupply(),
                contract.readTokens(),
                contract.isExpired(),
                contract.getRewardTokens(),
                contract.readState(),
            ]);

            expect(totalSupply).toBeGteBN(0);
            expect(toAddress(tokens._PT)).toBe(currentMarket.PT);
            expect(toAddress(tokens._YT)).toBe(currentMarket.YT);
            expect(toAddress(tokens._SY)).toBe(currentMarket.SY);
            expect(isExpired).toBe(false);
        });

        it('#marketInfo', async () => {
            const [marketInfo, exchangeRate] = await Promise.all([
                market.getMarketInfo({ multicall }),
                Multicall.wrap(routerStatic, multicall).callStatic.getExchangeRate(market.address),
            ]);

            expect(marketInfo.pt).toBe(currentMarket.PT);
            expect(marketInfo.sy).toBe(currentMarket.SY);

            const eps = multicall ? 0 : 0.01; // if !multicall, requests might be in different block
            expect(marketInfo.exchangeRate).toEqBN(exchangeRate, eps);
        });

        it('#userMarketInfo', async () => {
            const [marketInfo, userMarketInfo, userBalance, syInfo, syExchangeRate] = await Promise.all([
                market.getMarketInfo({ multicall }),
                market.getUserMarketInfo(senderAddress, { multicall }),
                Multicall.wrap(market.contract, multicall).callStatic.balanceOf(sender.address),
                sy.contract.assetInfo(),
                sy.contract.exchangeRate(),
            ]);

            // Verify addresses
            expect(userMarketInfo.market).toBe(currentConfig.marketAddress);
            expect(userMarketInfo.ptBalance.token).toBe(currentMarket.PT);
            expect(userMarketInfo.syBalance.token).toBe(currentMarket.SY);

            // Verify lp balance
            expect(userMarketInfo.lpBalance).toEqBN(userBalance);
            expect(userMarketInfo.ptBalance.amount).toEqBN(
                userBalance.mul(marketInfo.state.totalPt).div(marketInfo.state.totalLp)
            );
            expect(userMarketInfo.syBalance.amount).toEqBN(
                userBalance.mul(marketInfo.state.totalSy).div(marketInfo.state.totalLp)
            );

            // Verify underlying balance
            expect(userMarketInfo.assetBalance.assetType).toBe(syInfo.assetType);
            expect(userMarketInfo.assetBalance.assetAddress).toBe(toAddress(syInfo.assetAddress));
            expect(userMarketInfo.assetBalance.amount).toEqBN(
                userMarketInfo.syBalance.amount.mul(syExchangeRate).div(decimalFactor(18))
            );
        });

        it('#getSY and #getPT', async () => {
            const [sy, pt] = await Promise.all([market.syEntity({ multicall }), market.ptEntity({ multicall })]);
            expect(sy.address).toBe(currentMarket.SY);
            expect(pt.address).toBe(currentMarket.PT);
        });
    });
});
