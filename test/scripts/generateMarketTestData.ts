import * as dotenv from 'dotenv';
import * as pendleSDK from '../../src';
import fs from 'fs/promises';
import path from 'path';
import * as providerUrls from '../util/providerUrls';
import * as ethers from 'ethers';
import { TokenData, MarketData } from '../util/marketData/types';
import { getLookupFilePath } from '../util/marketData/filePath';

function parseAddress(value: string | undefined): pendleSDK.Address {
    if (typeof value !== 'string') throw new TypeError();
    return pendleSDK.toAddress(value);
}

function parseChainId(value: string | undefined): pendleSDK.ChainId {
    const valueNum = parseInt(value!);
    return pendleSDK.assertDefined(Object.values(pendleSDK.CHAIN_ID_MAPPING).find((chainId) => chainId == valueNum));
}

async function main() {
    dotenv.config();

    const marketAddress = parseAddress(process.env.MARKET_ADDRESS);
    const chainId = parseChainId(process.env.ACTIVE_CHAIN_ID);
    const outFile = process.env.MARKET_TEST_DATA_OUT_FILE ?? getLookupFilePath(marketAddress, chainId);

    console.log(`Getting data for market ${marketAddress} on chain ${chainId}`);
    const fileExisted = await fs.access(outFile, fs.constants.F_OK).then(
        () => true,
        () => false
    );
    if (fileExisted && !process.env.FORCE) {
        console.log(`File ${outFile} already exist. Halt.`);
        return;
    }

    const provider = new ethers.providers.JsonRpcProvider(providerUrls.lookup(chainId));
    const multicall = pendleSDK.Multicall.create({ chainId, provider });

    const marketEntity = new pendleSDK.MarketEntity(marketAddress, {
        chainId,
        provider,
        multicall,
    });
    const marketInfo = await marketEntity.getMarketInfo();
    const ptEntity = new pendleSDK.PtEntity(marketInfo.pt, { provider, chainId });
    const syEntity = new pendleSDK.SyEntity(marketInfo.sy, { provider, chainId });
    const [ytAddress, rewardTokenAddresses, tokensInAddresses, tokensOutAddresses] = await Promise.all([
        ptEntity.yt(),
        marketEntity.getRewardTokens(),
        syEntity.getTokensIn(),
        syEntity.getTokensOut(),
    ]);
    const getTokenData = async (token: pendleSDK.Address): Promise<TokenData<false>> => {
        const erc20Entity = pendleSDK.createERC20(token, { provider, chainId });
        const [name, decimals] = await Promise.all([erc20Entity.name(), erc20Entity.decimals()]);
        return { name, decimals, address: token };
    };
    const [rewardTokens, tokensIn, tokensOut] = await Promise.all([
        Promise.all(rewardTokenAddresses.map(getTokenData)),
        Promise.all(tokensInAddresses.map(getTokenData)),
        Promise.all(tokensOutAddresses.map(getTokenData)),
    ]);
    const marketData = {
        marketAddress,
        expiry_ms: marketInfo.expiry.getTime(),
        ptAddress: ptEntity.address,
        syAddress: syEntity.address,
        ytAddress,
        rewardTokens,
        tokensIn,
        tokensOut,
    } satisfies MarketData<false>;

    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, JSON.stringify(marketData, undefined, 2), { encoding: 'utf-8' });
    console.log(`Output to file ${outFile}`);
    console.log(marketData);
}

main()
    .then(() => process.exit(0))
    .catch((reason: unknown) => {
        console.error(reason);
        process.exit(1);
    });
