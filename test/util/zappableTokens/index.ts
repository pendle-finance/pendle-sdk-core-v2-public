import * as pendleSDK from '../../../src';
import * as iters from 'itertools';

import { getLookupFilePath } from './filePath';
import { TokenData, ZappableTokenList } from './types';
import fs from 'fs';

export { getLookupFilePath, ZappableTokenList };

export function lookup(chainId: pendleSDK.ChainId, defaultDisableTesting: boolean): ZappableTokenList {
    const file = getLookupFilePath(chainId);
    const dataStr = fs.readFileSync(file, { encoding: 'utf-8' });
    const withoutDisableTesting = JSON.parse(dataStr) as ZappableTokenList<false>;
    const res = iters.map(withoutDisableTesting, (data) => {
        return { disableTesting: defaultDisableTesting, ...data } satisfies TokenData<true>;
    });
    return res;
}
