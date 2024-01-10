import * as Route from '../../Route';
import * as routeHelper from '../../helper';
import { TokenInputStructBuilder, createTokenInputStructBuilder } from '../helper/tokenInputStructBuilder';
import * as routerTypes from '../../../types';
import { SyEntity } from '../../../../SyEntity';
import { BaseRouter } from '../../../BaseRouter';

export function createMintedSyAmountGetter(
    router: BaseRouter,
    syEntity: SyEntity,
    params: routerTypes.FixedRouterMetaMethodExtraParams<'meta-method'> & {
        tokenInputStructBuilder?: TokenInputStructBuilder;
    }
): Route.IntermediateSyAmountGetter<
    'approvedSignerAddressGetter' | 'aggregatorResultGetter' | 'syIOTokenAmountGetter'
> {
    const { tokenInputStructBuilder = createTokenInputStructBuilder(router) } = params;
    return routeHelper.addCacheForComponent({
        call: async (route) => {
            const [signerAddress] = await Promise.all([Route.getApprovedSignerAddress(route)]);
            if (signerAddress === undefined) {
                const tokenMintSyAmount = await Route.getSYIOTokenAmount(route);
                return syEntity.previewDeposit(tokenMintSyAmount.token, tokenMintSyAmount.amount, params.forCallStatic);
            } else {
                const tokenInput = await tokenInputStructBuilder.call(route);

                // TODO use new RouterV3 multicall
                return router.contract.callStatic.mintSyFromToken(
                    signerAddress,
                    syEntity.address,
                    0,
                    tokenInput,
                    routeHelper.txOverridesValueFromTokenInput(tokenInput)
                );
            }
        },
        description: async (route) => {
            return [
                'intermediateSyGetter',
                'fromTokenMintSy',
                ...(await Promise.all([
                    route.approvedSignerAddressGetter.description(route),
                    route.aggregatorResultGetter.description(route),
                    route.syIOTokenAmountGetter.description(route),
                ])),
            ];
        },
    });
}
