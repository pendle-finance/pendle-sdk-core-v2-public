import { TokenData } from '../marketData/types';

export { TokenData };

export type ZappableTokenList<WithDisableTesting extends boolean = true> = TokenData<WithDisableTesting>[];
