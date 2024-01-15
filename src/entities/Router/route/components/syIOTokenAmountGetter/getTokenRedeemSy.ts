import * as Route from '../../Route';
import * as routeHelper from '../../helper';
import * as common from '../../../../../common';
import * as routerTypes from '../../../types';
import * as aggregatorHelper from '../../../aggregatorHelper';
import { SyEntity } from '../../../../SyEntity';
import { BaseRouter } from '../../../BaseRouter';

const BASE_DEPENDENCIES = ['approvedSignerAddressGetter', 'intermediateSyAmountGetter'] as const;
type BaseDependencies = (typeof BASE_DEPENDENCIES)[number];

export function createTokenRedeemSyGetter<AdditionalRC extends Route.ComponentName = never>(
    router: BaseRouter,
    tokenRedeemSy: common.Address,
    syEntity: SyEntity,
    params: routerTypes.FixedRouterMetaMethodExtraParams<'meta-method'> & { additionalDependencies?: AdditionalRC[] },
    getActualTokenRedeemSyWhenSignerApproved: (params: {
        signerAddress: common.Address;
        tokenRedeemSy: common.Address;
        syEntity: SyEntity;
        amountSyToRedeem: common.BN;
        tokenOutput: routerTypes.TokenOutput;
        route: Route.PartialRoute<BaseDependencies | AdditionalRC>;
    }) => Promise<common.BigNumberish>
): Route.SYIOTokenAmountGetter<BaseDependencies | AdditionalRC> {
    const debugInfo = {
        tokenRedeemSy,
        syAddress: syEntity.address,
    };
    return routeHelper.createMinimalRouteComponent(
        router,
        `syIOTokenAmountGetter.getTokenRedeemSy.${tokenRedeemSy}`,
        [...BASE_DEPENDENCIES, ...(params.additionalDependencies ?? [])],
        async (route) => {
            const [approvedSigner, amountSyToRedeem] = await Promise.all([
                Route.getApprovedSignerAddress(route),
                Route.getIntermediateSyAmount(route),
            ]);
            if (approvedSigner === undefined) {
                const amountTokenRedeemed = await syEntity.previewRedeem(tokenRedeemSy, amountSyToRedeem, params);
                return { token: tokenRedeemSy, amount: amountTokenRedeemed };
            }
            const dummyTokenOutput: routerTypes.TokenOutput = {
                minTokenOut: 0,
                pendleSwap: common.NATIVE_ADDRESS_0x00,
                swapData: aggregatorHelper.EMPTY_SWAP_DATA,
                tokenOut: tokenRedeemSy,
                tokenRedeemSy: tokenRedeemSy,
            };
            const amount = await getActualTokenRedeemSyWhenSignerApproved({
                signerAddress: approvedSigner,
                tokenRedeemSy,
                syEntity,
                amountSyToRedeem,
                tokenOutput: dummyTokenOutput,
                route,
            }).then((res) => common.BN.from(res));
            return { token: tokenRedeemSy, amount };
        },
        { debugInfo }
    );
}
