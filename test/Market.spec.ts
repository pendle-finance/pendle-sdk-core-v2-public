import { MarketEntity, SyEntity, Multicall, toAddress, getRouterStatic, NATIVE_ADDRESS_0x00 } from '../src';
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
    const market = new MarketEntity(currentMarket.marketAddress, networkConnectionWithChainId);
    const contract = market.contract;
    const sy = new SyEntity(currentMarket.syAddress, networkConnectionWithChainId);
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
                contract.readState(NATIVE_ADDRESS_0x00),
            ]);

            expect(totalSupply).toBeGteBN(0);
            expect(toAddress(tokens._PT)).toBe(currentMarket.ptAddress);
            expect(toAddress(tokens._YT)).toBe(currentMarket.ytAddress);
            expect(toAddress(tokens._SY)).toBe(currentMarket.syAddress);
            expect(isExpired).toBe(false);
        });

        it('#marketInfo', async () => {
            const [marketInfo, marketInfoFromCallStatic] = await Promise.all([
                market.getMarketInfo({ multicall }),
                Multicall.wrap(routerStatic, multicall).callStatic.getMarketState(market.address),
            ]);

            expect(marketInfo.pt).toBe(currentMarket.ptAddress);
            expect(marketInfo.sy).toBe(currentMarket.syAddress);
            expect(marketInfo.yt).toBe(currentMarket.ytAddress);

            const eps = multicall ? 0 : 0.01; // if !multicall, requests might be in different block
            expect(marketInfo.marketExchangeRateExcludeFee.rate.value).toEqBN(
                marketInfoFromCallStatic.marketExchangeRateExcludeFee,
                eps
            );
        });

        it('#userMarketInfo', async () => {
            const [marketInfo, userMarketInfo, userBalance, _syInfo, _syExchangeRate] = await Promise.all([
                market.getMarketInfo({ multicall }),
                market.getUserMarketInfo(senderAddress, { multicall }),
                Multicall.wrap(market.contract, multicall).callStatic.balanceOf(sender.address),
                sy.contract.assetInfo(),
                sy.contract.exchangeRate(),
            ]);

            // Verify addresses
            expect(userMarketInfo.ptBalance.token).toBe(currentMarket.ptAddress);
            expect(userMarketInfo.syBalance.token).toBe(currentMarket.syAddress);

            // Verify lp balance
            expect(userMarketInfo.lpBalance.amount).toEqBN(userBalance);
            expect(userMarketInfo.ptBalance.amount).toEqBN(
                userBalance.mul(marketInfo.state.totalPt).div(marketInfo.state.totalLp)
            );
            expect(userMarketInfo.syBalance.amount).toEqBN(
                userBalance.mul(marketInfo.state.totalSy).div(marketInfo.state.totalLp)
            );

            // TODO verify unclaimedRewards
        });

        it('#getSY and #getPT', async () => {
            const [sy, pt] = await Promise.all([market.syEntity({ multicall }), market.ptEntity({ multicall })]);
            expect(sy.address).toBe(currentMarket.syAddress);
            expect(pt.address).toBe(currentMarket.ptAddress);
        });
    });
});
