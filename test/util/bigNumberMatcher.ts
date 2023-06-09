// https://github.com/TrueFiEng/Waffle/blob/acf6381f24a5b5a6cac69d5a9d57343df98593f1/waffle-jest/src/matchers/bigNumber.ts
/* eslint-disable */
import { BigNumber, BigNumberish } from 'ethers';

// NOTE: Jest does not currently support overriding matchers while calling
// original implementation, therefore we have to name our matchers something
// different: https://github.com/facebook/jest/issues/6243

export const BigNumberMatchers = {
    toEqBN(received: BigNumberish, value: BigNumberish, eps: number = 0) {
        if (eps == 0) {
            const pass = BigNumber.from(received).eq(value);
            return pass
                ? {
                      pass: true,
                      message: () => `Expected "${received}" NOT to be equal ${value}`,
                  }
                : {
                      pass: false,
                      message: () => `Expected "${received}" to be equal ${value}`,
                  };
        }
        eps = Math.trunc(eps * 100);
        const offset = BigNumber.from(value).mul(eps).div(100).abs();
        const lowerBound = BigNumber.from(value).sub(offset);
        const upperBound = BigNumber.from(value).add(offset);
        const pass = BigNumber.from(received).gte(lowerBound) && BigNumber.from(received).lte(upperBound);
        return pass
            ? {
                  pass: true,
                  message: () => `Expected "${received}" NOT to be within ${lowerBound} and ${upperBound}`,
              }
            : {
                  pass: false,
                  message: () => `Expected "${received}" to be within ${lowerBound} and ${upperBound}`,
              };
    },
    toBeGtBN(received: BigNumberish, value: BigNumberish) {
        const pass = BigNumber.from(received).gt(value);
        return pass
            ? {
                  pass: true,
                  message: () => `Expected "${received}" NOT to be greater than ${value}`,
              }
            : {
                  pass: false,
                  message: () => `Expected "${received}" to be greater than ${value}`,
              };
    },
    toBeLtBN(received: BigNumberish, value: BigNumberish) {
        const pass = BigNumber.from(received).lt(value);
        return pass
            ? {
                  pass: true,
                  message: () => `Expected "${received}" NOT to be less than ${value}`,
              }
            : {
                  pass: false,
                  message: () => `Expected "${received}" to be less than ${value}`,
              };
    },
    toBeGteBN(received: BigNumberish, value: BigNumberish) {
        const pass = BigNumber.from(received).gte(value);
        return pass
            ? {
                  pass: true,
                  message: () => `Expected "${received}" NOT to be greater than or equal ${value}`,
              }
            : {
                  pass: false,
                  message: () => `Expected "${received}" to be greater than or equal ${value}`,
              };
    },
    toBeLteBN(received: BigNumberish, value: BigNumberish) {
        const pass = BigNumber.from(received).lte(value);
        return pass
            ? {
                  pass: true,
                  message: () => `Expected "${received}" NOT to be less than or equal ${value}`,
              }
            : {
                  pass: false,
                  message: () => `Expected "${received}" to be less than or equal ${value}`,
              };
    },
};

try {
    expect.extend(BigNumberMatchers);
} catch (e) {
    // We need to catch the error in case we are running in a non-jest environment
}

interface CustomMatchers<R = unknown> {
    toEqBN(value: BigNumberish, slippage?: number): R;
    toBeGtBN(value: BigNumberish): R;
    toBeLtBN(value: BigNumberish): R;
    toBeGteBN(value: BigNumberish): R;
    toBeLteBN(value: BigNumberish): R;
}

declare global {
    namespace jest {
        interface Expect extends CustomMatchers {}
        interface Matchers<R> extends CustomMatchers<R> {}
        interface InverseAsymmetricMatchers extends CustomMatchers {}
    }
}
