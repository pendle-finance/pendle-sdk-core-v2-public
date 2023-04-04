import { ethers } from 'ethers';
import { approveHelper, getAllowance } from '../util/testHelper';
import { currentConfig, networkConnection } from '../util/testEnv';
import { toAddress, toAddresses, areSameAddresses } from '../../src';

const INF = ethers.constants.MaxUint256;
async function main() {
    // Approve all tokens & all sy, pt, yt, lp to the router
    const tokens = [
        Object.values(currentConfig.tokens),
        currentConfig.markets.map((m) => m.SY),
        currentConfig.markets.map((m) => m.PT),
        currentConfig.markets.map((m) => m.YT),
        currentConfig.markets.map((m) => m.market),
    ].flat();

    const signerAddress = toAddress(await networkConnection.signer.getAddress());
    for (const token of toAddresses(tokens)) {
        if (areSameAddresses(token, currentConfig.faucet) || areSameAddresses(token, currentConfig.fundKeeper)) {
            continue;
        }
        const allowance = await getAllowance(token, signerAddress, currentConfig.router);
        if (allowance.lt(INF.div(2))) {
            console.log('approving', token);
            await approveHelper(token, currentConfig.router, INF);
        } else {
            console.log('skip approving', token);
        }
    }
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
