import { zip } from './helper';

export type BatchMessageEntry<ParamType> = {
    params: ParamType;
    resolver: Resolver<unknown>;
    rejector: Rejector;
};

type Resolver<ReturnType> = (result: ReturnType | PromiseLike<ReturnType>) => void;
type Rejector = (error: unknown) => void;

export type BatchExecutionSuccess<T = unknown> = { type: 'success'; data: T };
export type BatchExecutionFailed = { type: 'failed'; error: unknown };
export type BatchExecutionResult<T = unknown> = BatchExecutionSuccess<T> | BatchExecutionFailed;

export abstract class Batcher<ParamType = unknown> {
    abstract getMessageQueue(): BatchMessageEntry<ParamType>[];
    abstract freeQueue(queue: BatchMessageEntry<ParamType>[]): void;
    abstract batchExecute(messages: ParamType[]): Promise<BatchExecutionResult[]>;

    execute<ReturnType = unknown>(params: ParamType): Promise<ReturnType> {
        const promise = new Promise<ReturnType>((resolver, rejector) => {
            const queue = this.getMessageQueue();
            queue.push({ params, resolver: resolver as Resolver<unknown>, rejector });
            if (queue.length === 1) {
                setTimeout(() => {
                    this.processQueue(queue);
                }, 0);
            }
        });

        return promise;
    }

    processQueue(messages: BatchMessageEntry<ParamType>[]) {
        this.freeQueue(messages);
        const params = messages.map((message) => message.params);
        void this.batchExecute(params)
            .then((results) => {
                for (const [message, result] of zip(messages, results)) {
                    if (result.type === 'success') message.resolver(result.data);
                    else message.rejector(result.error);
                }
            })
            .catch((error: unknown) => {
                messages.forEach(({ rejector }) => rejector(error));
            });
    }
}

export abstract class StaticStorageBatcher<ParamType = unknown> extends Batcher<ParamType> {
    protected queue: BatchMessageEntry<ParamType>[] = [];

    override getMessageQueue(): BatchMessageEntry<ParamType>[] {
        return this.queue;
    }

    override freeQueue(queue: BatchMessageEntry<ParamType>[]) {
        const isTheCurrentQueue = this.queue === queue;
        if (isTheCurrentQueue) this.queue = [];
    }
}
