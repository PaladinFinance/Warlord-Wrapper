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
    AURA_BAL,
    CVX_CRV,
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

describe('Wrapped stkWAR contract tests - erc20 methods', () => {
    let admin: SignerWithAddress

    let wrapper: WrappedStakedWar

    let staker: IWarlordStaker

    let zap: IWarlordZap

    let war: IERC20
    let stkWar: IERC20
    let weth: IERC20
    let cvxCrv: IERC20
    let auraBal: IERC20
    let cvx: IERC20
    
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress

    const initial_zap_amount1 = ethers.utils.parseEther('1500')
    const initial_zap_amount2 = ethers.utils.parseEther('750')

    before(async () => {
        await resetFork();

        [admin, user1, user2, user3] = await ethers.getSigners();

        wrapperFactory = await ethers.getContractFactory("WrappedStakedWar");

        war = IERC20__factory.connect(WAR, provider);
        stkWar = IERC20__factory.connect(STK_WAR, provider);
        weth = IERC20__factory.connect(WETH, provider);
        cvxCrv = IERC20__factory.connect(CVX_CRV, provider);
        auraBal = IERC20__factory.connect(AURA_BAL, provider);
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

        await wrapper.connect(admin).addRewardToken(weth.address)
        await wrapper.connect(admin).addRewardToken(war.address)

        await cvx.connect(admin).transfer(user1.address, initial_zap_amount1)
        await cvx.connect(admin).transfer(user2.address, initial_zap_amount2)
            
        await cvx.connect(user1).approve(zap.address, initial_zap_amount1)
        await cvx.connect(user2).approve(zap.address, initial_zap_amount2)

        await zap.connect(user1).zap(cvx.address, initial_zap_amount1, user1.address)
        await zap.connect(user2).zap(cvx.address, initial_zap_amount2, user2.address)

        await stkWar.connect(user1).approve(wrapper.address, ethers.constants.MaxUint256)
        await stkWar.connect(user2).approve(wrapper.address, ethers.constants.MaxUint256)

        await wrapper.connect(user1).wrap(initial_zap_amount1, user1.address)
        await wrapper.connect(user2).wrap(initial_zap_amount2, user2.address)

    });

    it(' should be deployed & have correct parameters', async () => {
        expect(wrapper.address).to.properAddress

        expect(await wrapper.owner()).to.be.eq(admin.address)

        expect(await wrapper.war()).to.be.eq(war.address)
        expect(await wrapper.stkWar()).to.be.eq(stkWar.address)

    });

    describe('approve', async () => {

        const allowance = ethers.utils.parseEther('150')
        const change_allowance = ethers.utils.parseEther('50')
        const over_allowance = ethers.utils.parseEther('200')

        it(' should update allowance correctly', async () => {

            await wrapper.connect(user1).approve(user2.address, allowance)

            let newAllowance = await wrapper.connect(user1).allowance(user1.address, user2.address)

            expect(newAllowance).to.be.eq(allowance)

        });

        it(' should increase allowance correctly', async () => {

            await wrapper.connect(user1).approve(user2.address, allowance)

            let oldAllowance = await wrapper.connect(user1).allowance(user1.address, user2.address)

            await wrapper.connect(user1).increaseAllowance(user2.address, change_allowance)

            let newAllowance = await wrapper.connect(user1).allowance(user1.address, user2.address)

            expect(newAllowance.sub(oldAllowance)).to.be.eq(change_allowance)

        });

        it(' should decrease allowance correctly', async () => {

            await wrapper.connect(user1).approve(user2.address, allowance)

            let oldAllowance = await wrapper.connect(user1).allowance(user1.address, user2.address)

            await wrapper.connect(user1).decreaseAllowance(user2.address, change_allowance)

            let newAllowance = await wrapper.connect(user1).allowance(user1.address, user2.address)

            expect(oldAllowance.sub(newAllowance)).to.be.eq(change_allowance)

        });

        it(' should emit the correct Event', async () => {

            await expect(wrapper.connect(user1).approve(user2.address, allowance))
                .to.emit(wrapper, 'Approval')
                .withArgs(user1.address, user2.address, allowance);

        });

        it(' should block address Zero approvals', async () => {

            await expect(
                wrapper.connect(user1).approve(ethers.constants.AddressZero, allowance)
            ).to.be.revertedWith('ERC20: approve to the zero address')

        });

        it(' should fail to decrease allwoance under 0', async () => {

            await wrapper.connect(user1).approve(user2.address, allowance)

            await expect(
                wrapper.connect(user1).decreaseAllowance(user2.address, over_allowance)
            ).to.be.revertedWith('ERC20: decreased allowance below zero')

        });

    });

    describe('transfer', async () => {

        const amount = ethers.utils.parseEther('100')

        it(' should transfer the amount', async () => {

            let oldBalance = await wrapper.connect(user2).balanceOf(user2.address)

            await wrapper.connect(user1).transfer(user2.address, amount)

            let newBalance = await wrapper.connect(user2).balanceOf(user2.address)

            expect(amount).to.be.eq(newBalance.sub(oldBalance))

        });

        it(' should emit the correct Event', async () => {

            await expect(wrapper.connect(user1).transfer(user2.address, amount))
                .to.emit(wrapper, 'Transfer')
                .withArgs(user1.address, user2.address, amount);

        });

        it(' should not allow transfer if balance too low', async () => {

            await expect(
                wrapper.connect(user2).transfer(user1.address, ethers.utils.parseEther('1000'))
            ).to.be.revertedWith('ERC20: transfer amount exceeds balance')

        });

        it(' should block transfer to address Zero', async () => {

            await expect(
                wrapper.connect(user1).transfer(ethers.constants.AddressZero, amount)
            ).to.be.revertedWith('ERC20: transfer to the zero address')

        });

    });

    describe('transferFrom', async () => {

        const amount = ethers.utils.parseEther('100')
        const allowance = ethers.utils.parseEther('150')

        it(' should transfer the amount', async () => {

            let oldBalance = await wrapper.connect(user2).balanceOf(user2.address)

            await wrapper.connect(user1).approve(user2.address, allowance)

            await wrapper.connect(user2).transferFrom(user1.address, user2.address, amount)

            let newBalance = await wrapper.connect(user2).balanceOf(user2.address)

            expect(amount).to.be.eq(newBalance.sub(oldBalance))

        });

        it(' should emit the correct Event', async () => {

            await wrapper.connect(user1).approve(user2.address, allowance)

            await expect(wrapper.connect(user2).transferFrom(user1.address, user2.address, amount))
                .to.emit(wrapper, 'Transfer')
                .withArgs(user1.address, user2.address, amount);

        });

        it(' should update the allowance correctly', async () => {

            await wrapper.connect(user1).approve(user2.address, allowance)

            await wrapper.connect(user2).transferFrom(user1.address, user2.address, amount)

            let newAllowance = await wrapper.connect(user1).allowance(user1.address, user2.address)

            expect(allowance.sub(amount)).to.be.eq(newAllowance)

        });

        it(' should not allow transfer if balance too low', async () => {

            await wrapper.connect(user2).approve(user1.address, ethers.utils.parseEther('1000'))

            await expect(
                wrapper.connect(user1).transferFrom(user2.address, user1.address, ethers.utils.parseEther('1000'))
            ).to.be.revertedWith('ERC20: transfer amount exceeds balance')

        });

        it(' should not allow transfer if allowance too low', async () => {

            await wrapper.connect(user1).approve(user2.address, ethers.utils.parseEther('10'))

            await expect(
                wrapper.connect(user2).transferFrom(user1.address, user2.address, amount)
            ).to.be.revertedWith('ERC20: insufficient allowance')

        });

        it(' should not allow transfer if no allowance', async () => {

            await expect(
                wrapper.connect(user2).transferFrom(user1.address, user2.address, amount)
            ).to.be.revertedWith('ERC20: insufficient allowance')

        });

        it(' should block transfer to/from address Zero', async () => {

            await wrapper.connect(user1).approve(user2.address, allowance)

            await expect(
                wrapper.connect(user2).transferFrom(user1.address, ethers.constants.AddressZero, amount)
            ).to.be.revertedWith('ERC20: transfer to the zero address')

            await expect(
                wrapper.connect(user2).transferFrom(ethers.constants.AddressZero, user1.address, amount)
            ).to.be.revertedWith('ERC20: insufficient allowance')

        });


    });

});