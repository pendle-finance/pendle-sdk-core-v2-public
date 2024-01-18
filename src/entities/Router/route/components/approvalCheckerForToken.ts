import * as Route from '../Route';
import * as common from '../../../../common';
import { BaseRouter } from '../../BaseRouter';
import * as routeHelper from '../helper';

export function createApprovedSignerAddressGetter(
    router: BaseRouter
): Route.ApprovedSignerAddressGetter<'signerBalanceAllowanceChecker'> {
    return routeHelper.createMinimalRouteComponent(
        router,
        'approvedSignerAddressGetter',
        ['signerBalanceAllowanceChecker'],
        async (route) => {
            const data = await Route.getSignerBalanceAndAllowanceData(route);
            if (data === undefined) return undefined;
            const { tokenAmountsToCheck, balances, allowances } = data;
            const hasApprovedAndEnoughBalance = Array.from(common.zip(tokenAmountsToCheck, balances, allowances)).every(
                ([tokenAmount, balance, allowance]) =>
                    tokenAmount.amount.lte(balance) && tokenAmount.amount.lte(allowance)
            );
            return hasApprovedAndEnoughBalance ? data.signerAddress : undefined;
        }
    );
}
