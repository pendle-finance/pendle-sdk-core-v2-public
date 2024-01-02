import { AxiosError } from 'axios';
import {
    SyEntity,
    PendleContractError,
    Address,
    KyberSwapAggregatorHelper,
    NATIVE_ADDRESS_0xEE,
    toAddress,
    KyberSwapAggregatorHelperRequestError,
    KyberSwapAggergatorHelperRequestErrorCode,
    KyberSwapAggregatorHelperAxiosError,
    OneInchAggregatorHelperAxiosError,
} from '../src';
import { currentConfig, networkConnectionWithChainId, signer } from './util/testEnv';
import * as testHelper from './util/testHelper';

describe('Custom error', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();
    const { syAddress } = currentConfig.market;
    const sy = new SyEntity(syAddress, networkConnectionWithChainId);
    const errorMessage = PendleContractError.errorMessageHandler['SYZeroDeposit']();
    const slippage = 0.1;
    let tokenIn: Address;

    beforeAll(async () => {
        tokenIn = await sy.getTokensIn().then((tokens) => tokens[0]);
    });

    it('catch Entity error', async () => {
        await expect(sy.deposit(tokenIn, 0, slippage)).rejects.toThrow(errorMessage);
    });

    it('catch contract call static', async () => {
        await expect(sy.contract.callStatic.deposit(signer.address, tokenIn, 0, 0)).rejects.toThrow(errorMessage);
    });

    it('catch estimate gas', async () => {
        await expect(sy.contract.estimateGas.deposit(signer.address, tokenIn, 0, 0)).rejects.toThrow(
            `Gas estimation error: ${errorMessage}`
        );
    });

    it('catch estimate gas without custom error', async () => {
        await expect(
            sy.contract.estimateGas.transferFrom(currentConfig.market.marketAddress, signer.address, 1)
        ).rejects.toThrow('Gas estimation error: ERC20: insufficient allowance');
    });

    it('catch contract call', async () => {
        await expect(sy.contract.functions.deposit(signer.address, tokenIn, 0, 0)).rejects.toThrow(errorMessage);
    });

    it('catch multicall error', async () => {
        await expect(
            currentConfig.multicall.wrap(sy.contract).callStatic.deposit(signer.address, tokenIn, 0, 0)
        ).rejects.toThrow(errorMessage);
    });
});

describe('KyberSwapAggregatorHelperRequestError', () => {
    const kyberAggregatorHelper = KyberSwapAggregatorHelper.getKyberSwapAggregatorHelper({
        chainId: 1,
    });

    const DUMMY_TOKEN = toAddress('0x' + '69'.repeat(20));

    it('Token not found', async () => {
        try {
            await kyberAggregatorHelper.makeCall({ token: DUMMY_TOKEN, amount: 10 }, NATIVE_ADDRESS_0xEE, 0.2 / 100);
            throw new Error('Not KyberSwap error');
        } catch (_e: unknown) {
            expect(_e).toBeInstanceOf(KyberSwapAggregatorHelperRequestError);
            const e = _e as KyberSwapAggregatorHelperRequestError;
            expect(e.code).toBe(KyberSwapAggergatorHelperRequestErrorCode.TOKEN_NOT_FOUND);

            // The value in the snapshot is generated
            // eslint-disable-next-line quotes
            expect(e.message).toMatchInlineSnapshot(`"KyberSwap request error: token not found"`);
        }
    });
});

describe('WrappedAxiosError', () => {
    const testAxiosError = new AxiosError(
        'Test Axios Error',
        '696',
        {},
        {},
        {
            data: {
                error: 'axios error data',
            },
            status: 696,
            statusText: '696',
            headers: {},
            config: {},
        }
    );
    it('Kyber Axios Error', async () => {
        try {
            throw new KyberSwapAggregatorHelperAxiosError(testAxiosError);
        } catch (_e: unknown) {
            expect(_e).toBeInstanceOf(KyberSwapAggregatorHelperAxiosError);
            const e = _e as KyberSwapAggregatorHelperAxiosError;
            expect(e.message).toBe(
                'Wrapped axios error: KyberSwap aggregator axios error: Test Axios Error.\nResponse: {"error":"axios error data"}.'
            );
        }
    });
    it('1Inch Axios Error', async () => {
        try {
            throw new OneInchAggregatorHelperAxiosError(testAxiosError);
        } catch (_e: unknown) {
            expect(_e).toBeInstanceOf(OneInchAggregatorHelperAxiosError);
            const e = _e as KyberSwapAggregatorHelperAxiosError;
            expect(e.message).toBe(
                'Wrapped axios error: 1inch aggregator axios error: Test Axios Error.\nResponse: {"error":"axios error data"}.'
            );
        }
    });
});
