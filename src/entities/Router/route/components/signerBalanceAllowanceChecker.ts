import * as Route from '../Route';
import * as common from '../../../../common';
import { BaseRouter } from '../../BaseRouter';
import * as routeHelper from '../helper';
import * as iters from 'itertools';
import { createERC20 } from '../../../erc20';

export function createSignerBalanceAllowanceChecker(
    router: BaseRouter,
    _tokenAmounts: Iterable<common.RawTokenAmount>,
    params: {
        spenderAddress?: common.Address;
        /**
         * Set to `true` to NOT eagerly get the result on background.
         *
         * Default to `false`.
         */
        lazy?: boolean;
    } = {}
): Route.SignerBalanceAllowanceChecker {
    const { spenderAddress = router.address, lazy = false } = params;

    const tokenAmounts = [..._tokenAmounts];
    const erc20TokensWithAmount = iters.map(tokenAmounts, ({ amount, token }) => ({
        erc20: createERC20(token, router.entityConfig),
        amount,
    }));
    const name = [
        'signerBalanceAllowanceChecker',
        `tokens:${tokenAmounts.map(common.rawTokenAmountToString).join(';')}`,
        `spender:${spenderAddress}`,
    ].join('.');

    const getBalanceAndAllowanceData = async () => {
        const signerAddress = await router.getSignerAddress();
        if (signerAddress === undefined) return undefined;
        const balancesPromise = Promise.all(erc20TokensWithAmount.map(({ erc20 }) => erc20.balanceOf(signerAddress)));
        const allowancesPromise = Promise.all(
            erc20TokensWithAmount.map(({ erc20 }) => erc20.allowance(signerAddress, spenderAddress))
        );
        const [balances, allowances] = await Promise.all([balancesPromise, allowancesPromise]);
        return {
            spenderAddress,
            signerAddress,
            tokenAmountsToCheck: tokenAmounts,

            allowances,
            balances,
        };
    };

    const debugInfo = {
        spenderAddress,
        tokenAmounts,
        lazy,
    };

    if (lazy) {
        return routeHelper.createMinimalRouteComponent(router, name, [], getBalanceAndAllowanceData, { debugInfo });
    } else {
        const approvedSignerAddressPromise = getBalanceAndAllowanceData();
        return routeHelper.createMinimalRouteComponent(router, name, [], () => approvedSignerAddressPromise, {
            debugInfo,
        });
    }
}
