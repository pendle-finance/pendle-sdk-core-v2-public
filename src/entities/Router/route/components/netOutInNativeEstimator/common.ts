import * as Route from '../../Route';
import * as routeHelper from '../../helper';
import * as common from '../../../../../common';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import { BaseRouter } from '../../../BaseRouter';

export function createWithPrice(
    router: BaseRouter,
    price: offchainMath.FixedX18
): Route.NetOutInNativeEstimator<'netOutGetter'> {
    const debugInfo = {
        price: price.toString(),
    };
    return routeHelper.createMinimalRouteComponent(
        router,
        `netOutInNativeEstimator.withPrice${price.toString()}`,
        ['netOutGetter'],
        async (route) => {
            const netOut = await Route.getNetOut(route);
            return common.BN.from(offchainMath.FixedX18.mulDown(netOut.toBigInt(), price));
        },
        { debugInfo }
    );
}

export function createWithError(
    router: BaseRouter,
    errorToThrow: unknown
): Route.NetOutInNativeEstimator<'netOutGetter'> {
    return routeHelper.createMinimalRouteComponent(router, 'netOutInNativeEstimator.withError', [], async () => {
        throw errorToThrow;
    });
}
