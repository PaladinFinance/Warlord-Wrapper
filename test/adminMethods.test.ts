const hre = require("hardhat");
import { ethers } from "hardhat";
import chai from "chai";
import { BigNumber } from "ethers";
import { solidity } from "ethereum-waffle";
import { WrappedStakedWar } from "../typechain/WrappedStakedWar";
import { IERC20 } from "../typechain/oz/interfaces/IERC20";
import { IERC20__factory } from "../typechain/factories/oz/interfaces/IERC20__factory";
import { IWarlordZap } from "../typechain/interfaces/IWarlordZap";
import { IWarlordZap__factory } from "../typechain/factories/interfaces/IWarlordZap__factory";
import { IWarlordStaker } from "../typechain/interfaces/IWarlordStaker";
import { IWarlordStaker__factory } from "../typechain/factories/interfaces/IWarlordStaker__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";

import {
    getERC20,
    advanceTime,
    resetFork
} from "./utils/utils";

import {
    START_AMOUNT,
    BASE_HOLDER,
    CVX,
    WETH,
    WAR,
    STK_WAR,
    WAR_STAKER,
    WAR_ZAP
} from "./utils/constants"

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

let wrapperFactory: ContractFactory

const UNIT = ethers.utils.parseEther('1')

describe('Wrapped stkWAR contract tests - admin methods', () => {
    let admin: SignerWithAddress

    let wrapper: WrappedStakedWar

    let staker: IWarlordStaker

    let zap: IWarlordZap

    let war: IERC20
    let stkWar: IERC20
    let weth: IERC20
    let cvx: IERC20
    
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress

    const initial_zap_amount = ethers.utils.parseEther('5000')

    before(async () => {
        await resetFork();

        [admin, user1, user2, user3] = await ethers.getSigners();

        wrapperFactory = await ethers.getContractFactory("WrappedStakedWar");

        war = IERC20__factory.connect(WAR, provider);
        stkWar = IERC20__factory.connect(STK_WAR, provider);
        weth = IERC20__factory.connect(WETH, provider);
        cvx = IERC20__factory.connect(CVX, provider);

        staker = IWarlordStaker__factory.connect(WAR_STAKER, provider);

        zap = IWarlordZap__factory.connect(WAR_ZAP, provider);

        await getERC20(admin, BASE_HOLDER, cvx, admin.address, START_AMOUNT);

    });

    beforeEach(async () => {

        wrapper = (await wrapperFactory.connect(admin).deploy(
            war.address,
            stkWar.address,
        )) as WrappedStakedWar;
        await wrapper.deployed();

    });

    it(' should be deployed & have correct parameters', async () => {
        expect(wrapper.address).to.properAddress

        expect(await wrapper.owner()).to.be.eq(admin.address)

        expect(await wrapper.war()).to.be.eq(war.address)
        expect(await wrapper.stkWar()).to.be.eq(stkWar.address)

        expect(await wrapper.totalSupply()).to.be.eq(0)

        expect(await wrapper.getRewardTokens()).to.be.empty

    });

    describe('addRewardToken', async () => {

        it(' should list the token correctly (& emit correct Event)', async () => {

            expect(await wrapper.getRewardTokens()).not.to.contain(weth.address)

            const set_tx = await wrapper.connect(admin).addRewardToken(weth.address)

            expect(await wrapper.getRewardTokens()).to.contain(weth.address)

            await expect(set_tx).to.emit(wrapper, "RewardTokenAdded")
            .withArgs(weth.address);

        });

        it(' should allow to list more tokens', async () => {

            await wrapper.connect(admin).addRewardToken(weth.address)

            expect(await wrapper.getRewardTokens()).to.be.deep.eq([weth.address])

            const set_tx = await wrapper.connect(admin).addRewardToken(war.address)

            expect(await wrapper.getRewardTokens()).to.be.deep.eq([weth.address, war.address])

            await expect(set_tx).to.emit(wrapper, "RewardTokenAdded")
            .withArgs(war.address);

        });

        it(' should fail if already listed', async () => {

            await wrapper.connect(admin).addRewardToken(weth.address)

            await expect(
                wrapper.connect(admin).addRewardToken(weth.address)
            ).to.be.revertedWith('AlreadyListed')

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                wrapper.connect(admin).addRewardToken(ethers.constants.AddressZero)
            ).to.be.revertedWith('ZeroAddress')

        });

        it(' should only be callable for owner', async () => {

            await expect(
                wrapper.connect(user1).addRewardToken(weth.address)
            ).to.be.revertedWith('Ownable: caller is not the owner')

        });

    });

    describe('setUserAllowedClaimer', async () => {

        it(' should set the correct claimer (& emit correct Event)', async () => {

            const set_tx = await wrapper.connect(admin).setUserAllowedClaimer(user1.address, user2.address)

            expect(await wrapper.allowedClaimer(user1.address)).to.be.eq(user2.address)

            await expect(set_tx).to.emit(wrapper, "SetUserAllowedClaimer")
            .withArgs(user1.address, user2.address);

        });

        it(' should update the claimer correctly', async () => {

            await wrapper.connect(admin).setUserAllowedClaimer(user1.address, user2.address)

            expect(await wrapper.allowedClaimer(user1.address)).to.be.eq(user2.address)

            const set_tx = await wrapper.connect(admin).setUserAllowedClaimer(user1.address, user3.address)

            expect(await wrapper.allowedClaimer(user1.address)).to.be.eq(user3.address)

            await expect(set_tx).to.emit(wrapper, "SetUserAllowedClaimer")
            .withArgs(user1.address, user3.address);

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                wrapper.connect(admin).setUserAllowedClaimer(user1.address, ethers.constants.AddressZero)
            ).to.be.revertedWith('ZeroAddress')

            await expect(
                wrapper.connect(admin).setUserAllowedClaimer(ethers.constants.AddressZero, user2.address)
            ).to.be.revertedWith('ZeroAddress')

        });

        it(' should only be callable for owner', async () => {

            await expect(
                wrapper.connect(user1).setUserAllowedClaimer(user2.address, user1.address)
            ).to.be.revertedWith('Ownable: caller is not the owner')

        });

    });

});