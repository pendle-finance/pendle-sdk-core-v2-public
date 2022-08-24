import { ethers } from 'ethers';
import { ERC20_ENTITIES } from './testHelper';
import { BLOCK_CONFIRMATION, currentConfig, networkConnection } from './testUtils';

const INF = ethers.constants.MaxUint256;
async function main() {
    for (let entity of Object.values(ERC20_ENTITIES)) {
        console.log('approving ' + (await entity.name()));
        let allowance = await entity.allowance(await networkConnection.signer!.getAddress(), currentConfig.router);
        if (allowance.lt(INF.div(2))) {
            console.log('approving ');
            await entity.approve(currentConfig.router, INF).then((tx) => tx.wait(BLOCK_CONFIRMATION));
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
