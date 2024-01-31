import { BaseRouter } from './BaseRouter';
import { BaseRouterConfig } from './types';
import { getContractAddresses } from '../../common';

export type BasicRouterConfig = BaseRouterConfig;

/**
 * @privateRemarks
 * TODO force this class to use a special aggregator helper instead of {@link KyberHelper}.
 * (that is, a aggregator helper that always return none).
 */
export class BasicRouter extends BaseRouter {
    /**
     * Create a Router object for a given config.
     * @remarks
     * The address of {@link Router} is obtained from the `config`.
     * @param config
     * @returns
     */
    static getBasicRouter(config: BasicRouterConfig): BaseRouter {
        return new BasicRouter(getContractAddresses(config.chainId).ROUTER, config);
    }
}
