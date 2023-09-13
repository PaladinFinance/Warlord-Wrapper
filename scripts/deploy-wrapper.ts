export { };
const hre = require("hardhat");
import { BigNumber } from "ethers";

const ethers = hre.ethers;

const network = hre.network.name;

let constant_path = './utils/constants';

const {
    WAR,
    STK_WAR,
} = require(constant_path);

async function main() {

    const deployer = (await hre.ethers.getSigners())[0];

    const WrappedStakedWar = await ethers.getContractFactory("WrappedStakedWar");

    console.log('Deploying WrappedStakedWar  ...')
    const wstkWAR = await WrappedStakedWar.deploy(
        WAR,
        STK_WAR
    )
    await wstkWAR.deployed()
    console.log('WrappedStakedWar : ', wstkWAR.address)
    console.log()
    
    // Verification of contract

    await hre.run("verify:verify", {
        address: wstkWAR.address,
        constructorArguments: [
            WAR,
            STK_WAR
        ],
    });

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });