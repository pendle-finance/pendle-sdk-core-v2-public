// https://github.com/TrueFiEng/Waffle/blob/acf6381f24a5b5a6cac69d5a9d57343df98593f1/waffle-jest/src/matchers/bigNumber.ts
/* eslint-disable */
import { BigNumber, BigNumberish } from 'ethers';

// NOTE: Jest does not currently support overriding matchers while calling
// original implementation, therefore we have to name our matchers something
// different: https://github.com/facebook/jest/issues/6243

const SMALL_NUMBER_PRECISION = 1_000_000;

try {
    expect.extend({
        toEqBN(received: BigNumberish, value: BigNumberish, eps: number = 0) {
            const matchExact = eps == 0;
            eps = Math.trunc(eps * SMALL_NUMBER_PRECISION);
            const offset = BigNumber.from(value).mul(eps).div(SMALL_NUMBER_PRECISION).abs();
            const lowerBound = BigNumber.from(value).sub(offset);
            const upperBound = BigNumber.from(value).add(offset);
            const pass = BigNumber.from(received).gte(lowerBound) && BigNumber.from(received).lte(upperBound);
            const message = () =>
                this.utils.matcherHint('toEqBN', undefined, undefined, {
                    comment: `${!pass ? '' : 'not '}(${this.utils.printReceived('received')} ${
                        matchExact ? '==' : '≃'
                    } ${this.utils.printExpected('expected')}${matchExact ? '' : ` with eps = ${eps}`})`,
                }) +
                '\n\n' +
                `Received: ${this.utils.printReceived(String(received))}\n` +
                `Expected: ${this.utils.printExpected(String(value))}` +
                (matchExact ? '' : `\nLower bound: ${String(lowerBound)}\nUpper bound: ${String(upperBound)}`);
            return { pass, message };
        },
        toBeGtBN(received: BigNumberish, value: BigNumberish) {
            const pass = BigNumber.from(received).gt(value);
            const message = () =>
                this.utils.matcherHint('toBeGtBN', undefined, undefined, {
                    comment: `${!pass ? '' : 'not '}(${this.utils.printReceived(
                        'received'
                    )} > ${this.utils.printExpected('expected')})`,
                }) +
                '\n\n' +
                `Received: ${this.utils.printReceived(String(received))}\n` +
                `Expected: ${this.utils.printExpected(String(value))}`;
            return { pass, message };
        },
        toBeLtBN(received: BigNumberish, value: BigNumberish) {
            const pass = BigNumber.from(received).lt(value);
            const message = () =>
                this.utils.matcherHint('toBeLtBN', undefined, undefined, {
                    comment: `${!pass ? '' : 'not '}(${this.utils.printReceived(
                        'received'
                    )} < ${this.utils.printExpected('expected')})`,
                }) +
                '\n\n' +
                `Received: ${this.utils.printReceived(String(received))}\n` +
                `Expected: ${this.utils.printExpected(String(value))}`;
            return { pass, message };
        },
        toBeGteBN(received: BigNumberish, value: BigNumberish) {
            const pass = BigNumber.from(received).gte(value);
            const message = () =>
                this.utils.matcherHint('toBeGteBN', undefined, undefined, {
                    comment: `${!pass ? '' : 'not '}(${this.utils.printReceived(
                        'received'
                    )} >= ${this.utils.printExpected('expected')})`,
                }) +
                '\n\n' +
                `Received: ${this.utils.printReceived(String(received))}\n` +
                `Expected: ${this.utils.printExpected(String(value))}`;
            return { pass, message };
        },
        toBeLteBN(received: BigNumberish, value: BigNumberish) {
            const pass = BigNumber.from(received).lte(value);
            const message = () =>
                this.utils.matcherHint('toBeLteBN', undefined, undefined, {
                    comment: `${!pass ? '' : 'not '}(${this.utils.printReceived(
                        'received'
                    )} <= ${this.utils.printExpected('expected')})`,
                }) +
                '\n\n' +
                `Received: ${this.utils.printReceived(String(received))}\n` +
                `Expected: ${this.utils.printExpected(String(value))}`;
            return { pass, message };
        },

        toHaveDifferenceBN(
            actual: [before: BigNumberish, after: BigNumberish] | { before: BigNumberish; after: BigNumberish },
            diff: BigNumberish,
            eps: number = 0
        ) {
            if (typeof actual !== 'object') throw new TypeError('Invalid actual value for `toHaveDifferenceBN`');
            const before = BigNumber.from(Array.isArray(actual) ? actual[0] : actual.before);
            const after = BigNumber.from(Array.isArray(actual) ? actual[1] : actual.after);
            if (before == undefined) throw new TypeError('Invalid `before` value for `toHaveDifferenceBN`');
            if (after == undefined) throw new TypeError('Invalid `after` value for `toHaveDifferenceBN`');
            const actualDiff = after.sub(before);
            const matchExact = eps === 0;
            const options = {
                comment: matchExact ? '(Exact match)' : `(Match with eps = ${eps})`,
                promise: this.promise,
                isNot: this.isNot,
            };
            eps = Math.trunc((eps ?? 0) * SMALL_NUMBER_PRECISION);
            const offset = BigNumber.from(diff).mul(eps).div(SMALL_NUMBER_PRECISION).abs();
            const lowerBound = BigNumber.from(diff).sub(offset);
            const upperBound = BigNumber.from(diff).add(offset);
            const pass = actualDiff.gte(lowerBound) && actualDiff.lte(upperBound);
            const message = () =>
                this.utils.matcherHint('toHaveDifferenceBN', undefined, undefined, options) +
                '\n\n' +
                `Expected the difference ${pass ? `not to be` : 'to be'} ${
                    matchExact ? 'exact' : 'around'
                }\n  ${this.utils.printExpected(String(diff))} ${
                    matchExact ? '' : `  (lower bound = ${lowerBound}, upper bound = ${upperBound})`
                }\n\n` +
                `Received ${this.utils.printReceived({
                    before: String(before),
                    after: String(after),
                })}, with difference of\n  ${this.utils.printReceived(String(actualDiff))}`;
            return { pass, message };
        },
    });
} catch (e) {
    // We need to catch the error in case we are running in a non-jest environment
}

interface CustomMatchers<R = unknown> {
    toEqBN(value: BigNumberish, slippage?: number): R;
    toBeGtBN(value: BigNumberish): R;
    toBeLtBN(value: BigNumberish): R;
    toBeGteBN(value: BigNumberish): R;
    toBeLteBN(value: BigNumberish): R;
    toHaveDifferenceBN(diff: BigNumberish, eps?: number): R;
}

declare global {
    namespace jest {
        interface Expect extends CustomMatchers {}
        interface Matchers<R> extends CustomMatchers<R> {}
        interface InverseAsymmetricMatchers extends CustomMatchers {}
    }
}
