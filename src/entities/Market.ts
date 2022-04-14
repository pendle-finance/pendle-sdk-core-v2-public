import type { PendleRouterStaticUpg } from '@pendle/core-v2/typechain-types';
import type { MarketParametersStruct, PendleMarket } from '@pendle/core-v2/typechain-types/PendleMarket';
import type { Address, NetworkConnection, TokenAmount } from './types';
import { BigNumber as BN, Contract } from 'ethers';
import { OT } from './OT';
import { SCY } from './SCY';
import { dummyABI, dummyAccountingAssetAddress } from '../dummy';

export type MarketInfo = {
    ot: Address;
    scy: Address;
    marketParam: MarketParametersStruct;
    currentImpliedYield: BN;
    currentExchangeRate: BN;
};

export type UserMarketInfo = {
    marketAddress: Address;
    lpBalance: BN;
    otBalance: TokenAmount;
    scyBalance: TokenAmount;
    assetBalance: TokenAmount;
};

export class Market {
    public address: Address;
    public contract: PendleMarket;
    public chainId: number;

    protected networkConnection: NetworkConnection;

    public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, dummyABI, _networkConnection.provider) as PendleMarket;
    }

    async getMarketInfo(): Promise<MarketInfo> {
        // TODO: Finalize where to get router static data
        const routerStatic = new Contract(
            '0xRouter',
            dummyABI,
            this.networkConnection.provider
        ) as PendleRouterStaticUpg;
        const [ot, scy, marketParam, currentImpliedYield] = await Promise.all([
            this.contract.callStatic.OT(),
            this.contract.callStatic.SCY(),
            this.contract.callStatic.readState(),
            routerStatic.callStatic.getOtImpliedYield(this.address),
        ]);
        const otContract = new OT(ot, this.networkConnection, this.chainId).contract;
        const otDecimalFactor = await otContract.callStatic.decimals();
        const [currentExchangeRate] = await routerStatic.callStatic.swapOtForScyStatic(
            this.address,
            BN.from(10).pow(otDecimalFactor)
        );
        return { ot, scy, marketParam, currentImpliedYield, currentExchangeRate };
    }

    async getUserMarketInfo(user: Address): Promise<UserMarketInfo> {
        const marketAddress = this.address;
        const [lpBalance, otAddress, scyAddress] = await Promise.all([
            this.contract.callStatic.balanceOf(user),
            this.contract.callStatic.OT(),
            this.contract.callStatic.SCY(),
        ]);
        const ot = new OT(otAddress, this.networkConnection, this.chainId);
        const scy = new SCY(scyAddress, this.networkConnection, this.chainId);
        const [otAmount, scyAmount, scyIndex] = await Promise.all([
            ot.contract.callStatic.balanceOf(user),
            scy.contract.callStatic.balanceOf(user),
            // TODO: Maybe refactor this to use a corresponding method in SCY class
            scy.contract.callStatic.scyIndexCurrent(),
        ]);
        const otBalance = { token: otAddress, amount: otAmount };
        const scyBalance = { token: scyAddress, amount: scyAmount };
        const assetBalance = { token: dummyAccountingAssetAddress, amount: scyAmount.mul(scyIndex) };
        return { marketAddress, lpBalance, otBalance, scyBalance, assetBalance };
    }
}
