import * as Route from '../../Route';
import * as common from '../../../../../common';
import * as iters from 'itertools';
import * as errors from '../../../../../errors';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import { BaseRouter } from '../../../BaseRouter';
import { createWithPrice, createWithError } from './common';

export async function createFromAllRawTokenOut(
    router: BaseRouter,
    rawToken: common.Address,
    routes: Iterable<Route.PartialRoute<'netOutGetter'>>
) {
    // ETH: ... -> SY -> ETH
    // sGLP: ... -> SY -> sGLP -> ETH
    const allOut = await Promise.allSettled(iters.imap(routes, (route) => Route.getNetOut(route)));
    const nonFailedRouteOut = allOut.flatMap((routeResult) => {
        if (routeResult.status === 'rejected') return [];
        return routeResult.value;
    });
    if (nonFailedRouteOut.length === 0) {
        throw new errors.PendleSdkError('All route failed');
    }
    const maxOut = iters.reduce(nonFailedRouteOut, (u, v) => (u.gt(v) ? u : v));
    if (maxOut == undefined) {
        return createWithError(new errors.PendleSdkError('All route failed'));
    }
    try {
        const equivAmountInNative = await router.tokenAmountConverter(
            router,
            { token: rawToken, amount: maxOut },
            common.NATIVE_ADDRESS_0x00
        );
        const theoreticalPrice = offchainMath.FixedX18.divDown(equivAmountInNative.toBigInt(), maxOut.toBigInt());
        return createWithPrice(theoreticalPrice);
    } catch (e: unknown) {
        return createWithPrice(offchainMath.FixedX18.ONE);
    }
}
