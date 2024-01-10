import * as Route from '../../Route';
import * as routeHelper from '../../helper';
import * as common from '../../../../../common';
import * as offchainMath from '@pendle/core-v2-offchain-math';

export function createWithPrice(price: offchainMath.FixedX18): Route.NetOutInNativeEstimator<'netOutGetter'> {
    return routeHelper.createMinimalRouteComponent(
        `netOutInNativeEstimator.withPrice${price.toString()}`,
        ['netOutGetter'],
        async (route) => {
            const netOut = await Route.getNetOut(route);
            return common.BN.from(offchainMath.FixedX18.mulDown(netOut.toBigInt(), price));
        }
    );
}

export function createWithError(errorToThrow: unknown): Route.NetOutInNativeEstimator<'netOutGetter'> {
    return routeHelper.createMinimalRouteComponent('netOutInNativeEstimator.withError', [], async () => {
        throw errorToThrow;
    });
}
