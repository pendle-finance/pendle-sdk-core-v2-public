/* eslint-disable no-console */
import * as dotenv from 'dotenv';
import * as pendleSDK from '../../src';
import fs from 'fs/promises';
import path from 'path';
import * as pendleBackend from '../util/pendleBackend';
import { ZappableTokenList } from '../util/zappableTokens/types';
import { getLookupFilePath } from '../util/zappableTokens/filePath';

function parseChainId(value: string | undefined): pendleSDK.ChainId {
    const valueNum = parseInt(value!);
    return pendleSDK.assertDefined(Object.values(pendleSDK.CHAIN_ID_MAPPING).find((chainId) => chainId == valueNum));
}

async function main() {
    dotenv.config();

    const chainId = parseChainId(process.env.ACTIVE_CHAIN_ID);
    const outFile = process.env.ZAPPABLE_TOKEN_OUT_FILE ?? getLookupFilePath(chainId);

    console.log(`Getting data zappable token on chain ${chainId} from Pendle backend`);
    const existingData: ZappableTokenList = await fs
        .readFile(outFile, { encoding: 'utf-8' })
        .then((str) => JSON.parse(str) as ZappableTokenList)
        .catch(() => []);

    const existingTokenAddresses = new Set(existingData.map(({ address }) => address));

    const data = await pendleBackend.fetchAllAsset(chainId);
    const newData = data
        .filter((token) => token.zappable)
        // Filter out native, because it is already included in the test
        .filter((token) => !pendleSDK.isNativeToken(pendleSDK.toAddress(token.address)))
        .filter((token) => !existingTokenAddresses.has(pendleSDK.toAddress(token.address)))
        .map((token) => ({
            name: token.proName,
            decimals: token.decimals,
            address: pendleSDK.toAddress(token.address),
        }));

    const combinedData: ZappableTokenList<false> = [...existingData, ...newData];

    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, JSON.stringify(combinedData, undefined, 2), { encoding: 'utf-8' });
    console.log(`Output to file ${outFile} with the following new tokens`);
    console.log(newData);
}

main()
    .then(() => process.exit(0))
    .catch((reason: unknown) => {
        console.error(reason);
        process.exit(1);
    });
