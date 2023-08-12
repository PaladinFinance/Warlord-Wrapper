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
import { IWarlordMinter } from "../typechain/interfaces/IWarlordMinter";
import { IWarlordMinter__factory } from "../typechain/factories/interfaces/IWarlordMinter__factory";
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
    WAR_ZAP,
    WAR_MINTER
} from "./utils/constants"

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

let wrapperFactory: ContractFactory

const UNIT = ethers.utils.parseEther('1')

describe('Wrapped stkWAR contract tests - wrapping methods', () => {
    let admin: SignerWithAddress

    let wrapper: WrappedStakedWar

    let staker: IWarlordStaker

    let zap: IWarlordZap
    let minter: IWarlordMinter

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
    const initial_zap_amount3 = ethers.utils.parseEther('2000')

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
        minter = IWarlordMinter__factory.connect(WAR_MINTER, provider);

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
        await cvx.connect(admin).transfer(user3.address, initial_zap_amount3)

        await cvx.connect(user1).approve(zap.address, initial_zap_amount1)
        await cvx.connect(user2).approve(zap.address, initial_zap_amount2)
        await cvx.connect(user3).approve(zap.address, initial_zap_amount3)

        await zap.connect(user1).zap(cvx.address, initial_zap_amount1, user1.address)
        await zap.connect(user2).zap(cvx.address, initial_zap_amount2, user2.address)
        await zap.connect(user3).zap(cvx.address, initial_zap_amount3, user3.address)

        await stkWar.connect(user1).approve(wrapper.address, ethers.constants.MaxUint256)
        await stkWar.connect(user2).approve(wrapper.address, ethers.constants.MaxUint256)
        await stkWar.connect(user3).approve(wrapper.address, ethers.constants.MaxUint256)

    });

    it(' should be deployed & have correct parameters', async () => {
        expect(wrapper.address).to.properAddress

        expect(await wrapper.owner()).to.be.eq(admin.address)

        expect(await wrapper.war()).to.be.eq(war.address)
        expect(await wrapper.stkWar()).to.be.eq(stkWar.address)

    });

    describe('wrap', async () => {

        const wrap_amount = ethers.utils.parseEther('250')

        it(' should wrap the stkWAR (& emit the correct Event)', async () => {

            const prev_stkWar_balance = await stkWar.balanceOf(user1.address)
            const prev_wstkWar_balance = await wrapper.balanceOf(user1.address)

            const prev_totalSupply = await wrapper.totalSupply()

            const wrap_tx = await wrapper.connect(user1).wrap(wrap_amount, user1.address)

            expect(await stkWar.balanceOf(user1.address)).to.be.eq(prev_stkWar_balance.sub(wrap_amount))
            expect(await wrapper.balanceOf(user1.address)).to.be.eq(prev_wstkWar_balance.add(wrap_amount))

            expect(await wrapper.totalSupply()).to.be.eq(prev_totalSupply.add(wrap_amount))
            
            await expect(wrap_tx).to.emit(wrapper, "Wrapped")
                .withArgs(user1.address, user1.address, wrap_amount);

        });

        it(' should wrap the whole stkWAR balance if given MAX_UINT256', async () => {

            const prev_stkWar_balance = await stkWar.balanceOf(user1.address)
            const prev_wstkWar_balance = await wrapper.balanceOf(user1.address)

            const prev_totalSupply = await wrapper.totalSupply()

            const wrap_tx = await wrapper.connect(user1).wrap(ethers.constants.MaxUint256, user1.address)

            expect(await stkWar.balanceOf(user1.address)).to.be.eq(0)
            expect(await wrapper.balanceOf(user1.address)).to.be.eq(prev_wstkWar_balance.add(prev_stkWar_balance))

            expect(await wrapper.totalSupply()).to.be.eq(prev_totalSupply.add(prev_stkWar_balance))
            
            await expect(wrap_tx).to.emit(wrapper, "Wrapped")
                .withArgs(user1.address, user1.address, prev_stkWar_balance);

        });

        it(' should wrap and send to the given receiver', async () => {

            const prev_stkWar_balance = await stkWar.balanceOf(user1.address)
            const prev_stkWar_balance2 = await stkWar.balanceOf(user2.address)
            const prev_wstkWar_balance = await wrapper.balanceOf(user1.address)
            const prev_wstkWar_balance2 = await wrapper.balanceOf(user2.address)

            const prev_totalSupply = await wrapper.totalSupply()

            const wrap_tx = await wrapper.connect(user1).wrap(wrap_amount, user2.address)

            expect(await stkWar.balanceOf(user1.address)).to.be.eq(prev_stkWar_balance.sub(wrap_amount))
            expect(await stkWar.balanceOf(user2.address)).to.be.eq(prev_stkWar_balance2)
            expect(await wrapper.balanceOf(user1.address)).to.be.eq(prev_wstkWar_balance)
            expect(await wrapper.balanceOf(user2.address)).to.be.eq(prev_wstkWar_balance2.add(wrap_amount))

            expect(await wrapper.totalSupply()).to.be.eq(prev_totalSupply.add(wrap_amount))
            
            await expect(wrap_tx).to.emit(wrapper, "Wrapped")
                .withArgs(user1.address, user2.address, wrap_amount);

        });

        it(' should update reward states after depositing', async () => {

            await wrapper.connect(user1).wrap(wrap_amount, user1.address)

            await advanceTime(86400 * 2)

            await wrapper.connect(user1).wrap(ethers.utils.parseEther('75'), user1.address)

            expect(
                (await wrapper.getUserRewardState(weth.address, user1.address)).lastRewardPerToken
            ).to.be.eq(await wrapper.rewardStates(weth.address))
            expect(
                (await wrapper.getUserRewardState(war.address, user1.address)).lastRewardPerToken
            ).to.be.eq(await wrapper.rewardStates(war.address))

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                wrapper.connect(user1).wrap(wrap_amount, ethers.constants.AddressZero)
            ).to.be.revertedWith('ZeroAddress')

        });

        it(' should fail if given null amount', async () => {

            await expect(
                wrapper.connect(user1).wrap(0, user1.address)
            ).to.be.revertedWith('NullAmount')

        });

    });

    describe('wrapWar', async () => {

        const wrap_amount = ethers.utils.parseEther('250')

        beforeEach(async () => {
            
            await cvx.connect(admin).transfer(user1.address, initial_zap_amount1)
            await cvx.connect(user1).approve(minter.address, initial_zap_amount1)

            await minter.connect(user1).mint(cvx.address, initial_zap_amount1)

            await war.connect(user1).approve(wrapper.address, ethers.constants.MaxUint256)
        
        });

        it(' should wrap the WAR & stake it into stkWAR (& emit the correct Event)', async () => {

            const prev_war_balance = await war.balanceOf(user1.address)
            const prev_wrapper_stkWar_balance = await stkWar.balanceOf(wrapper.address)
            const prev_wstkWar_balance = await wrapper.balanceOf(user1.address)

            const prev_totalSupply = await wrapper.totalSupply()

            const wrap_tx = await wrapper.connect(user1).wrapWar(wrap_amount, user1.address)

            expect(await war.balanceOf(user1.address)).to.be.eq(prev_war_balance.sub(wrap_amount))
            expect(await stkWar.balanceOf(wrapper.address)).to.be.eq(prev_wrapper_stkWar_balance.add(wrap_amount))
            expect(await wrapper.balanceOf(user1.address)).to.be.eq(prev_wstkWar_balance.add(wrap_amount))

            expect(await wrapper.totalSupply()).to.be.eq(prev_totalSupply.add(wrap_amount))
            
            await expect(wrap_tx).to.emit(wrapper, "WrappedWar")
                .withArgs(user1.address, user1.address, wrap_amount);

        });

        it(' should wrap the whole stkWAR balance if given MAX_UINT256', async () => {

            const prev_war_balance = await war.balanceOf(user1.address)
            const prev_wrapper_stkWar_balance = await stkWar.balanceOf(wrapper.address)
            const prev_wstkWar_balance = await wrapper.balanceOf(user1.address)

            const prev_totalSupply = await wrapper.totalSupply()

            const wrap_tx = await wrapper.connect(user1).wrapWar(ethers.constants.MaxUint256, user1.address)

            expect(await war.balanceOf(user1.address)).to.be.eq(0)
            expect(await stkWar.balanceOf(wrapper.address)).to.be.eq(prev_wrapper_stkWar_balance.add(prev_war_balance))
            expect(await wrapper.balanceOf(user1.address)).to.be.eq(prev_wstkWar_balance.add(prev_war_balance))

            expect(await wrapper.totalSupply()).to.be.eq(prev_totalSupply.add(prev_war_balance))
            
            await expect(wrap_tx).to.emit(wrapper, "WrappedWar")
                .withArgs(user1.address, user1.address, prev_war_balance);

        });

        it(' should wrap and send to the given receiver', async () => {

            const prev_war_balance = await war.balanceOf(user1.address)
            const prev_war_balance2 = await war.balanceOf(user2.address)
            const prev_wrapper_stkWar_balance = await stkWar.balanceOf(wrapper.address)
            const prev_wstkWar_balance = await wrapper.balanceOf(user1.address)
            const prev_wstkWar_balance2 = await wrapper.balanceOf(user2.address)

            const prev_totalSupply = await wrapper.totalSupply()

            const wrap_tx = await wrapper.connect(user1).wrapWar(wrap_amount, user2.address)

            expect(await war.balanceOf(user1.address)).to.be.eq(prev_war_balance.sub(wrap_amount))
            expect(await war.balanceOf(user2.address)).to.be.eq(prev_war_balance2)
            expect(await stkWar.balanceOf(wrapper.address)).to.be.eq(prev_wrapper_stkWar_balance.add(wrap_amount))
            expect(await wrapper.balanceOf(user1.address)).to.be.eq(prev_wstkWar_balance)
            expect(await wrapper.balanceOf(user2.address)).to.be.eq(prev_wstkWar_balance2.add(wrap_amount))

            expect(await wrapper.totalSupply()).to.be.eq(prev_totalSupply.add(wrap_amount))
            
            await expect(wrap_tx).to.emit(wrapper, "WrappedWar")
                .withArgs(user1.address, user2.address, wrap_amount);

        });

        it(' should update reward states after depositing', async () => {

            await wrapper.connect(user1).wrapWar(wrap_amount, user1.address)

            await advanceTime(86400 * 2)

            await wrapper.connect(user1).wrapWar(ethers.utils.parseEther('75'), user1.address)

            expect(
                (await wrapper.getUserRewardState(weth.address, user1.address)).lastRewardPerToken
            ).to.be.eq(await wrapper.rewardStates(weth.address))
            expect(
                (await wrapper.getUserRewardState(war.address, user1.address)).lastRewardPerToken
            ).to.be.eq(await wrapper.rewardStates(war.address))

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                wrapper.connect(user1).wrapWar(wrap_amount, ethers.constants.AddressZero)
            ).to.be.revertedWith('ZeroAddress')

        });

        it(' should fail if given null amount', async () => {

            await expect(
                wrapper.connect(user1).wrapWar(0, user1.address)
            ).to.be.revertedWith('NullAmount')

        });

    });

    describe('unwrap', async () => {

        const wrap_amount = ethers.utils.parseEther('750')
        const unwrap_amount = ethers.utils.parseEther('250')

        beforeEach(async () => {
            
            await wrapper.connect(user1).wrap(wrap_amount, user1.address)

            await advanceTime(86400 * 3)
        
        });

        it(' should unwrap the stkWAR correctly (& emit the correct Event)', async () => {

            const prev_stkWar_balance = await stkWar.balanceOf(user1.address)
            const prev_wstkWar_balance = await wrapper.balanceOf(user1.address)

            const prev_totalSupply = await wrapper.totalSupply()

            const unwrap_tx = await wrapper.connect(user1).unwrap(unwrap_amount, user1.address)

            expect(await stkWar.balanceOf(user1.address)).to.be.eq(prev_stkWar_balance.add(unwrap_amount))
            expect(await wrapper.balanceOf(user1.address)).to.be.eq(prev_wstkWar_balance.sub(unwrap_amount))

            expect(await wrapper.totalSupply()).to.be.eq(prev_totalSupply.sub(unwrap_amount))
            
            await expect(unwrap_tx).to.emit(wrapper, "Unwrapped")
                .withArgs(user1.address, user1.address, unwrap_amount);

        });

        it(' should unwrap the full balance if given MAX_UINT256', async () => {

            const prev_stkWar_balance = await stkWar.balanceOf(user1.address)
            const prev_wstkWar_balance = await wrapper.balanceOf(user1.address)

            const prev_totalSupply = await wrapper.totalSupply()

            const unwrap_tx = await wrapper.connect(user1).unwrap(ethers.constants.MaxUint256, user1.address)

            expect(await stkWar.balanceOf(user1.address)).to.be.eq(prev_stkWar_balance.add(prev_wstkWar_balance))
            expect(await wrapper.balanceOf(user1.address)).to.be.eq(0)

            expect(await wrapper.totalSupply()).to.be.eq(prev_totalSupply.sub(prev_wstkWar_balance))
            
            await expect(unwrap_tx).to.emit(wrapper, "Unwrapped")
                .withArgs(user1.address, user1.address, prev_wstkWar_balance);

        });

        it(' should unwrap and send the stkWAR to the correct receiver', async () => {

            const prev_stkWar_balance = await stkWar.balanceOf(user1.address)
            const prev_stkWar_balance2 = await stkWar.balanceOf(user2.address)
            const prev_wstkWar_balance = await wrapper.balanceOf(user1.address)
            const prev_wstkWar_balance2 = await wrapper.balanceOf(user2.address)

            const prev_totalSupply = await wrapper.totalSupply()

            const unwrap_tx = await wrapper.connect(user1).unwrap(unwrap_amount, user2.address)

            expect(await stkWar.balanceOf(user1.address)).to.be.eq(prev_stkWar_balance)
            expect(await stkWar.balanceOf(user2.address)).to.be.eq(prev_stkWar_balance2.add(unwrap_amount))
            expect(await wrapper.balanceOf(user1.address)).to.be.eq(prev_wstkWar_balance.sub(unwrap_amount))
            expect(await wrapper.balanceOf(user2.address)).to.be.eq(prev_wstkWar_balance2)

            expect(await wrapper.totalSupply()).to.be.eq(prev_totalSupply.sub(unwrap_amount))
            
            await expect(unwrap_tx).to.emit(wrapper, "Unwrapped")
                .withArgs(user1.address, user2.address, unwrap_amount);

        });

        it(' should update reward states after unwrapping', async () => {

            await wrapper.connect(user1).unwrap(unwrap_amount, user1.address)

            expect(
                (await wrapper.getUserRewardState(weth.address, user1.address)).lastRewardPerToken
            ).to.be.eq(await wrapper.rewardStates(weth.address))
            expect(
                (await wrapper.getUserRewardState(war.address, user1.address)).lastRewardPerToken
            ).to.be.eq(await wrapper.rewardStates(war.address))

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                wrapper.connect(user1).unwrap(wrap_amount, ethers.constants.AddressZero)
            ).to.be.revertedWith('ZeroAddress')

        });

        it(' should fail if given null amount', async () => {

            await expect(
                wrapper.connect(user1).unwrap(0, user1.address)
            ).to.be.revertedWith('NullAmount')

        });

    });

});