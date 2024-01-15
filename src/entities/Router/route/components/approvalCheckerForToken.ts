import * as Route from '../Route';
import * as common from '../../../../common';
import { BaseRouter } from '../../BaseRouter';
import * as routeHelper from '../helper';
import * as iters from 'itertools';
import { createERC20 } from '../../../erc20';

export function createApprovedSignerAddressGetter(
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
): Route.ApprovedSignerAddressGetter {
    const { spenderAddress = router.address, lazy = false } = params;

    const tokenAmounts = [..._tokenAmounts];
    const erc20TokensWithAmount = iters.map(tokenAmounts, ({ amount, token }) => ({
        erc20: createERC20(token, router.entityConfig),
        amount,
    }));
    const name = [
        'approvalChecker',
        `tokens: ${tokenAmounts.map(common.rawTokenAmountToString).join(';')}`,
        `spender: ${spenderAddress}`,
    ].join('\n');

    const getApprovedSignerAddress = async () => {
        const signerAddress = await router.getSignerAddress();
        if (signerAddress === undefined) return undefined;
        const approvedStatus = await Promise.all(
            erc20TokensWithAmount.map(async ({ erc20, amount }) => {
                const [userBalance, spenderAllowance] = await Promise.all([
                    erc20.balanceOf(signerAddress),
                    erc20.allowance(signerAddress, spenderAddress),
                ]);
                return spenderAllowance.gte(amount) && userBalance.gte(amount);
            })
        );
        const allApproved = approvedStatus.every((val) => val);
        return allApproved ? signerAddress : undefined;
    };

    const debugInfo = {
        spenderAddress,
        tokenAmounts,
        lazy,
    };

    if (lazy) {
        return routeHelper.createMinimalRouteComponent(router, name, [], getApprovedSignerAddress, { debugInfo });
    } else {
        const approvedSignerAddressPromise = getApprovedSignerAddress();
        return routeHelper.createMinimalRouteComponent(router, name, [], () => approvedSignerAddressPromise, {
            debugInfo,
        });
    }
}
