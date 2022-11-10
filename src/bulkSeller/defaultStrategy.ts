import { BulkSellerUsageStrategy } from './BulkSellerUsageBaseStrategy';
import { NeverUseBulkSellerUsageStrategy } from './DummyBulkSellerUsageStrategy';
import { WrappedContract, RouterStatic } from '../contracts';

let GLOBAL_BULK_SELLER_USAGE_STRATEGY_GETTER: (
    routerStatic: WrappedContract<RouterStatic>
) => BulkSellerUsageStrategy = (routerStatic) => new NeverUseBulkSellerUsageStrategy(routerStatic);

export const getGlobalBulkSellerUsageStrategyGetter = (routerStatic: WrappedContract<RouterStatic>) =>
    GLOBAL_BULK_SELLER_USAGE_STRATEGY_GETTER(routerStatic);
export const setGlobalBulkSellerUsageStrategyGetter = (
    newStrategyGetter: (routerStatic: WrappedContract<RouterStatic>) => BulkSellerUsageStrategy
) => (GLOBAL_BULK_SELLER_USAGE_STRATEGY_GETTER = newStrategyGetter);
