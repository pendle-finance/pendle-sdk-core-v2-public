import { ethers } from 'ethers';
import { isSameAddress } from '../../src/entities/helper';
import { approveHelper, getAllowance } from './testHelper';
import { currentConfig, networkConnection } from './testUtils';

const INF = ethers.constants.MaxUint256;
async function main() {
    // Approve all tokens & all scy, pt, yt, lp to the router
    let tokens = [
        Object.values(currentConfig.tokens),
        currentConfig.markets.map((m) => m.SCY),
        currentConfig.markets.map((m) => m.PT),
        currentConfig.markets.map((m) => m.YT),
        currentConfig.markets.map((m) => m.market),
    ].flat();

    const signerAddress = await networkConnection.signer?.getAddress()!;
    for (let token of tokens) {
        if (isSameAddress(token, currentConfig.faucet) || isSameAddress(token, currentConfig.fundKeeper)) {
            continue;
        }
        let allowance = await getAllowance(token, signerAddress, currentConfig.router);
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
