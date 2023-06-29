import { Provider } from '../../contracts';
import { BN, ethersConstants } from '../../common';

export class GasFeeEstimator {
    static readonly DEFAULT_CACHE_TIMEOUT_ms = 10 * 1000;

    private lastUpdatedTimestamp_ms = 0;
    private cacheGasFee: Promise<BN> = Promise.resolve(ethersConstants.Zero);

    constructor(
        readonly provider: Provider,
        readonly cacheTimeout_ms: number = GasFeeEstimator.DEFAULT_CACHE_TIMEOUT_ms
    ) {}

    async getGasFee(): Promise<BN> {
        const now_ms = Date.now();
        if (this.lastUpdatedTimestamp_ms + this.cacheTimeout_ms < now_ms) {
            this.cacheGasFee = this.getGasFeeImpl();
            this.lastUpdatedTimestamp_ms = Date.now();
        }
        return this.cacheGasFee;
    }

    private async getGasFeeImpl(): Promise<BN> {
        return this.provider.getGasPrice();
    }
}
