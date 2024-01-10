import * as Route from '../../Route';
import * as common from '../../../../../common';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import * as iters from 'itertools';
import * as errors from '../../../../../errors';
import { BaseRouter } from '../../../BaseRouter';
import { createWithPrice, createWithError } from './common';

export async function createRelativeToToken(
    router: BaseRouter,
    routes: Iterable<Route.PartialRoute<'netOutGetter'>>,
    tokenAmount: common.RawTokenAmount
) {
    const getMaxOut = async () => {
        const routeOut = await Promise.all(iters.map(routes, (route) => Route.getNetOut(route).catch(() => []))).then(
            (results) => results.flat()
        );
        return iters.reduce(routeOut, (a, b) => common.bnMax(a, b));
    };
    const [maxOut, equivTokenAmountInNative] = await Promise.allSettled([
        getMaxOut(),
        router.tokenAmountConverter(router, tokenAmount, common.NATIVE_ADDRESS_0x00),
    ]);
    if (maxOut.status === 'rejected') return createWithError(maxOut.reason);
    if (equivTokenAmountInNative.status === 'rejected') return createWithError(equivTokenAmountInNative.reason);
    if (maxOut.value === undefined) return createWithError(new errors.PendleSdkError('All route failed'));
    const theoreticalPrice = offchainMath.FixedX18.divDown(
        equivTokenAmountInNative.value.toBigInt(),
        maxOut.value.toBigInt()
    );
    return createWithPrice(theoreticalPrice);
}
