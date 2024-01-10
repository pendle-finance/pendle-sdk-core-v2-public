import { AggregatorHelper, MakeCallParams, AggregatorResult } from './AggregatorHelper';
import { BatchExecutionResult, StaticStorageBatcher } from '../../../common';

/**
 * Aggregator helper that tries to batch the execution of the calls.
 * @remarks
 * Every {@link BatchAggregatorHelper#makeCall} to this instance will be deferred and then called
 * together so that every calls will end up at the same synchronization point.
 */
export class BatchAggregatorHelper implements AggregatorHelper<true> {
    protected batcher: AggregatorMakeCallBatcher;
    protected constructor(inner: AggregatorHelper<true>) {
        this.batcher = AggregatorMakeCallBatcher.create(inner);
    }

    static create(inner: AggregatorHelper<true>): BatchAggregatorHelper {
        return new BatchAggregatorHelper(inner);
    }

    async makeCall(...params: MakeCallParams): Promise<AggregatorResult> {
        return this.batcher.execute<AggregatorResult>(params);
    }
}

class AggregatorMakeCallBatcher extends StaticStorageBatcher<MakeCallParams> {
    protected constructor(readonly inner: AggregatorHelper<true>) {
        super();
    }

    static create(inner: AggregatorHelper<true>): AggregatorMakeCallBatcher {
        return new AggregatorMakeCallBatcher(inner);
    }

    override async batchExecute(messages: MakeCallParams[]): Promise<BatchExecutionResult<unknown>[]> {
        const results = await Promise.allSettled(messages.map((msg) => this.inner.makeCall(...msg)));
        return results.map((res) => {
            if (res.status === 'rejected') return { type: 'failed', error: res.reason as unknown };
            return { type: 'success', data: res.value };
        });
    }
}
