import * as pendleSDK from '../../../src';

export type TokenData<WithDisableTesting extends boolean = true> = {
    name: string;
    address: pendleSDK.Address;
    decimals: number;
    useAsPlacingOrderToken?: boolean;
} & pendleSDK.If<
    WithDisableTesting,
    { disableTesting: boolean },
    { disableTesting?: boolean } // make optional
>;

export type MarketData<WithDisableTesting extends boolean = true> = {
    marketAddress: pendleSDK.Address;
    expiry_ms: number;
    ptAddress: pendleSDK.Address;
    ytAddress: pendleSDK.Address;
    syAddress: pendleSDK.Address;

    tokensIn: TokenData<WithDisableTesting>[];
    tokensOut: TokenData<WithDisableTesting>[];
    rewardTokens: TokenData<WithDisableTesting>[];
};
