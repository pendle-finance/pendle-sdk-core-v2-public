import * as common from '../../../common';

export const randomSalt = (): common.BN => common.BN.from(common.randomBigInt(32));
