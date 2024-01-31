import { BaseRouter } from './BaseRouter';
import { BaseRouterConfig } from './types';
import { getContractAddresses } from '../../common';
import { KyberSwapAggregatorHelper } from './aggregatorHelper';

export type RouterConfig = BaseRouterConfig;

export class Router extends BaseRouter {
    /**
     * Create a Router object for a given config.
     * @remarks
     * The address of {@link Router} is obtained from the `config`.
     * @param config
     * @returns
     */
    static getRouter(config: RouterConfig): BaseRouter {
        return new Router(getContractAddresses(config.chainId).ROUTER, config);
    }

    static getRouterWithKyberAggregator(config: Omit<RouterConfig, 'aggregatorHelper'>): BaseRouter {
        const routerAddress = getContractAddresses(config.chainId).ROUTER;
        const provider = (config.provider ?? config.signer?.provider)!;
        const aggregatorHelper = new KyberSwapAggregatorHelper(routerAddress, {
            chainId: config.chainId,
        });
        return new Router(routerAddress, {
            ...config,
            provider: provider,
            signer: config.signer,
            aggregatorHelper: aggregatorHelper,
        });
    }
}
