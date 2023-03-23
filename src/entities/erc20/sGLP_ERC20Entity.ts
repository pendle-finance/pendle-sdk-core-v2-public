import { ERC20Entity, ERC20EntityConfig } from './ERC20Entity';
import { MulticallStaticParams } from '../../contracts';
import { Address, bnMin, BN } from '../../common';

export type GLP_ERC20EntityConfig = ERC20EntityConfig & {
    fsGLP: ERC20Entity;
};

/**
 * A custom class for sGLP token on Arbitrum to have a custom
 * {@link GLP_ERC20Entity#balanceOf}.
 *
 * @see {@link GLP_ERC20Entity#balanceOf} for more details.
 */
export class sGLP_ERC20Entity extends ERC20Entity {
    readonly fsGLP: ERC20Entity;
    constructor(address: Address, params: GLP_ERC20EntityConfig) {
        super(address, params);
        this.fsGLP = params.fsGLP;
    }

    /**
     * Get the balance of an user, given the account.
     *
     * @remarks
     * There are 3 related contracts:
     * - fsGLP: the normal fee + staked GLP
     *
     * - sGLP: the interface we use to interact with fsGLP, since it has two
     * separated variables to account for users' balance, which is the
     * depositBalances (as the shares of reward farming), and balanceOf (the
     * normal ERC20). Each transfer call on sGLP will reduce both
     * depositBalances and balanceOf on fsGLP of users, so it works
     *
     * - vGLP: the vested GLP contract to deposit your GLP to farm esGMX. On
     * stake, vGLP only use fsGLP.transferFrom
     *
     * Heres where things got weird, fsGLP.transferFrom only decrease the erc20
     * balance of the user, not the depositBalances. And then, sGLP contract,
     * though behave correctly on transfer call, return only the
     * depositBalances on its balanceOf call.
     *
     * So if an user mints fsGLP and vest all of them, his sGLP.balanceOf still
     * show the amount of GLP I minted.
     *
     *
     * @param account - the account address of the user
     * @param params - the additional parameters for read method.
     * @returns the smaller of `sGLP.balanceOf(account)` and `fsGLP.balanceOf(account)`.
     */
    override async balanceOf(account: Address, params?: MulticallStaticParams): Promise<BN> {
        const [sGLPBalance, fsGLPBalance] = await Promise.all([
            super.balanceOf(account, params),
            this.fsGLP.balanceOf(account, params),
        ]);
        return bnMin(sGLPBalance, fsGLPBalance);
    }
}
