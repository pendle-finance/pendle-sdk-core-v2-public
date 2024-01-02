import * as pendleSDK from '../../src';
import * as testEnv from '../util/testEnv';
import * as ethers from 'ethers';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import * as testHelper from '../util/testHelper';

export const placingOrderToken =
    testEnv.currentConfig.market.tokensIn.find((value) => value.useAsPlacingOrderToken === true) ??
    testEnv.currentConfig.market.tokensIn[0];

export function createMockLimitOrderMatcher() {
    const voidLimitOrderMatcher = pendleSDK.VoidLimitOrderMatcher.create();
    return {
        swapPtForSy: jest.fn(voidLimitOrderMatcher.swapPtForSy.bind(voidLimitOrderMatcher)),
        swapSyForPt: jest.fn(voidLimitOrderMatcher.swapSyForPt.bind(voidLimitOrderMatcher)),
        swapYtForSy: jest.fn(voidLimitOrderMatcher.swapYtForSy.bind(voidLimitOrderMatcher)),
        swapSyForYt: jest.fn(voidLimitOrderMatcher.swapSyForYt.bind(voidLimitOrderMatcher)),
        swapTokenForPt: jest.fn(voidLimitOrderMatcher.swapTokenForPt.bind(voidLimitOrderMatcher)),
        swapTokenForYt: jest.fn(voidLimitOrderMatcher.swapTokenForYt.bind(voidLimitOrderMatcher)),
    } satisfies pendleSDK.limitOrder.LimitOrderMatcher;
}

export const mockLimitOrderMatcher = createMockLimitOrderMatcher();

export function createLimitOrderTestHelper() {
    // TODO make these one configurable
    const orderMaker = ethers.Wallet.createRandom().connect(testEnv.provider);
    const orderReceiver = ethers.Wallet.createRandom().address;

    const limitRouter = pendleSDK.PendleLimitRouter.getPendleLimitRouter({
        chainId: testEnv.currentConfig.chainId,
        signer: orderMaker,
        version: '1',
    });

    beforeAll(async () => {
        await testHelper.increaseNativeBalance(orderMaker.address);
    });

    async function makeOrder(params: {
        orderType: pendleSDK.limitOrder.OrderType;
        makingAmount: pendleSDK.BN;
        lnImpliedRate: offchainMath.FixedX18;
        token?: pendleSDK.Address;
        YT?: pendleSDK.Address;
        partialMakingAmount?: pendleSDK.BN;
        prefillBalance?: boolean;
    }): Promise<pendleSDK.limitOrder.FillOrderParamsStruct> {
        const {
            orderType,
            makingAmount,
            lnImpliedRate,
            token = placingOrderToken.address,
            YT = testEnv.currentConfig.market.ytAddress,
            partialMakingAmount = makingAmount,
            prefillBalance = true,
        } = params;
        const order = pendleSDK.limitOrder.OrderStruct.create({
            salt: pendleSDK.limitOrder.randomSalt(),
            expiry: ethers.constants.MaxUint256,
            nonce: 0,
            orderType,
            token,
            YT,
            maker: orderMaker.address,
            receiver: orderReceiver,
            makingAmount,
            lnImpliedRate,
            failSafeRate: 0,
            permit: '0x',
        });
        const data = limitRouter.generateTypedDataForSigning(order);
        const signature = await orderMaker._signTypedData(...data);

        if (prefillBalance) {
            const inputToken = await (async () => {
                switch (orderType) {
                    case pendleSDK.limitOrder.OrderType.PT_FOR_TOKEN:
                        // TODO get this faster?
                        return new pendleSDK.YtEntity(YT, testEnv.networkConnectionWithChainId).PT();
                    case pendleSDK.limitOrder.OrderType.YT_FOR_TOKEN:
                        return YT;
                    case pendleSDK.limitOrder.OrderType.TOKEN_FOR_PT:
                    case pendleSDK.limitOrder.OrderType.TOKEN_FOR_YT:
                        return token;
                }
            })();
            await testHelper.incERC20Balance(inputToken, pendleSDK.toAddress(orderMaker.address), partialMakingAmount);
        }
        return pendleSDK.limitOrder.FillOrderParamsStruct.create({
            order,
            signature,
            makingAmount: partialMakingAmount,
        });
    }

    return {
        orderMaker,
        orderReceiver,
        limitRouter,
        makeOrder,
    };
}
