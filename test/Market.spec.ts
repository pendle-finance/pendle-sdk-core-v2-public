import { BigNumber } from 'ethers';
import { Market } from '../src';
//  import { getRouterStatic } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, WALLET } from './util/testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe('Market', () => {
    const market = new Market(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);
    const sender = WALLET().wallet;
    it('#constructor', () => {
        expect(market).toBeInstanceOf(Market);
        expect(market.address).toBe(currentConfig.marketAddress);
        expect(market.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it.skip('#contract', async () => {
        const { contract } = market;
        expect(contract).toBeDefined();

        await contract
            .connect(sender)
            .addLiquidity(sender.address, BigNumber.from(10).pow(17), BigNumber.from(10).pow(18), [], {
                gasLimit: 8000000,
            });
        //  await contract.connect(sender).transfer("0x700E66aD6C98d04f7c426060211fd98f12E0F1b6",BigNumber.from(10).pow(17))
        //  await contract.connect(sender).removeLiquidity(sender.address,sender.address,BigNumber.from(10).pow(17),[],{
        //         gasLimit:8000000,
        //  })
        //  const balance =  (await contract.balanceOf(sender.address)).toBigInt();
        //  console.log(balance);
    });

    it('#marketInfo', async () => {
        const marketInfo = await market.getMarketInfo();
        expect(marketInfo.pt).toBe(currentConfig.ptAddress);
        expect(marketInfo.scy).toBe(currentConfig.scyAddress);
    });

    it('userMarketInfo', async () => {
        const userMarketInfo = await market.getUserMarketInfo(sender.address);
        expect(userMarketInfo).toBeDefined();
    });
});
