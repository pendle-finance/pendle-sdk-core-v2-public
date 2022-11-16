export {
    /**
     * Rename ethersjs' BigNumber to BN, as we also use bignumber.js
     * for calculation.
     *
     * @see https://docs.ethers.io/v5/api/utils/bignumber/
     */
    BigNumber as BN,
    BigNumberish,
    constants as ethersConstants,
} from 'ethers';
