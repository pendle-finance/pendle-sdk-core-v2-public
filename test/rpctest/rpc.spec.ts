import { BigNumber, Contract, ethers, Signer } from 'ethers';
import { abi as ERC20ABI } from './ERC20.json';
import { networkConnection, WALLET } from '../util/testUtils';
import { config } from 'dotenv';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ERC20 } from './typechain/ERC20';
// import {} from '@nomiclabs/hardhat-ethers/src/internal/type-extensions';
config();
describe.skip('Test rpc', () => {
    const provider = new JsonRpcProvider('https://api.avax.network/ext/bc/C/rpc');
    //  Contract already deploy an avalanche
    let SHRContract: ERC20 = new Contract('0x4Db6c78422A8CdD09d984096F68C705C7B479A58', ERC20ABI, provider) as ERC20;
    //  Success
    it('Test name', async () => {
        console.log(await SHRContract.name());
    });
    //  Fail
    //  it("Test write", async ()=>{
    //     const wallet = new ethers.Wallet(process.env.PRIVATE_KEYS!).connect(provider);

    //     console.log( (await SHRContract.balanceOf(wallet.address)).toNumber());
    //     await SHRContract.connect(wallet).approve("0x009fC53D332F240C5174959d8d41dd895741b7dC",10);
    //     console.log( (await SHRContract.balanceOf(wallet.address)).toNumber());
    //  })
    it('Test play', async () => {});
});
describe('Approve', () => {
    const provider = new JsonRpcProvider('https://api.avax-test.network/ext/bc/C/rpc');
    let ERC20Contract: ERC20 = new Contract('0x2018ecc38fbca2ce3A62f96f9F0D38F0DEE2f99D', ERC20ABI, provider) as ERC20;
    const sender = WALLET().wallet;
    it('Approve', async () => {
        await ERC20Contract.connect(sender).approve(
            '0xb597dE4e247945A4D0e577ef65a32Bd4E459C3A7',
            BigNumber.from(10).pow(20)
        );
    });
});
//  scy 0xb597dE4e247945A4D0e577ef65a32Bd4E459C3A7
//  yt 0x8774E8D4A17f6DbDF93da23189df6026DD77aA34
//  usd 0x2018ecc38fbca2ce3A62f96f9F0D38F0DEE2f99D
// describe('Send', () => {
//     const provider = new JsonRpcProvider('https://api.avax-test.network/ext/bc/C/rpc');
//     let ERC20Contract: ERC20 = new Contract('0xb597dE4e247945A4D0e577ef65a32Bd4E459C3A7', ERC20ABI, provider) as ERC20;
//     const sender = WALLET().wallet;
//     it('Send', async () => {
//         await ERC20Contract.connect(sender).transfer(
//             '0x8774E8D4A17f6DbDF93da23189df6026DD77aA34',
//             BigNumber.from(10).pow(20)
//         );
//     });
// });
