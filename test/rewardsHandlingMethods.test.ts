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

describe('Wrapped stkWAR contract tests - rewards handling methods', () => {
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

    let otherUser: SignerWithAddress

    const initial_zap_amount1 = ethers.utils.parseEther('1500')
    const initial_zap_amount2 = ethers.utils.parseEther('750')
    const initial_zap_amount3 = ethers.utils.parseEther('2000')

    before(async () => {

        [admin, user1, user2, user3, otherUser] = await ethers.getSigners();

        wrapperFactory = await ethers.getContractFactory("WrappedStakedWar");

        war = IERC20__factory.connect(WAR, provider);
        stkWar = IERC20__factory.connect(STK_WAR, provider);
        weth = IERC20__factory.connect(WETH, provider);
        cvxCrv = IERC20__factory.connect(CVX_CRV, provider);
        auraBal = IERC20__factory.connect(AURA_BAL, provider);
        cvx = IERC20__factory.connect(CVX, provider);

        staker = IWarlordStaker__factory.connect(WAR_STAKER, provider);

        zap = IWarlordZap__factory.connect(WAR_ZAP, provider);

    });

    beforeEach(async () => {
        await resetFork();

        await getERC20(admin, BASE_HOLDER, cvx, admin.address, START_AMOUNT);

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

        await wrapper.connect(user1).wrap(initial_zap_amount1, user1.address)
        await wrapper.connect(user2).wrap(initial_zap_amount2, user2.address)
        await wrapper.connect(user3).wrap(initial_zap_amount3, user3.address)

    });

    it(' should be deployed & have correct parameters', async () => {
        expect(wrapper.address).to.properAddress

        expect(await wrapper.owner()).to.be.eq(admin.address)

        expect(await wrapper.war()).to.be.eq(war.address)
        expect(await wrapper.stkWar()).to.be.eq(stkWar.address)

    });

    describe('updateRewardState', async () => {

        beforeEach(async () => {

            await advanceTime(86400 * 3)
        
        });

        it(' should update the rewardPerToken correctly', async () => {

            const prev_reward_per_token = await wrapper.rewardStates(weth.address)
            const prev_reward_balance = await weth.balanceOf(wrapper.address)

            const update_tx = await wrapper.connect(admin).updateRewardState(weth.address)
            const tx_block = (await update_tx).blockNumber

            const new_reward_per_token = await wrapper.rewardStates(weth.address)
            const new_reward_balance = await weth.balanceOf(wrapper.address)

            const expected_reward_per_token_increase = new_reward_balance.sub(prev_reward_balance).mul(UNIT).div(await wrapper.totalSupply())

            expect(new_reward_per_token).to.be.eq(prev_reward_per_token.add(expected_reward_per_token_increase))

            expect(await staker.getUserAccruedRewards(weth.address, wrapper.address, { blockTag: tx_block })).to.be.eq(0)

        });

        it(' should not update the other reward states', async () => {

            const prev_reward_per_token = await wrapper.rewardStates(war.address)
            const prev_reward_balance = await war.balanceOf(wrapper.address)

            await wrapper.connect(admin).updateRewardState(weth.address)

            const new_reward_per_token = await wrapper.rewardStates(war.address)
            const new_reward_balance = await war.balanceOf(wrapper.address)

            expect(new_reward_per_token).to.be.eq(prev_reward_per_token)
            expect(new_reward_balance).to.be.eq(prev_reward_balance)

        });

        it(' should fail if the token as reward', async () => {

            await expect(
                wrapper.connect(user1).updateRewardState(CVX_CRV)
            ).to.be.revertedWith('NotListed')

        });
    
    });

    describe('updateAllRewardState', async () => {

        beforeEach(async () => {

            await advanceTime(86400 * 3)
        
        });

        it(' should update all the reward states for listed tokens correctly', async () => {

            const prev_reward_per_token_weth = await wrapper.rewardStates(weth.address)
            const prev_reward_balance_weth = await weth.balanceOf(wrapper.address)

            const prev_reward_per_token_war = await wrapper.rewardStates(war.address)
            const prev_reward_balance_war = await war.balanceOf(wrapper.address)

            const update_tx = await wrapper.connect(admin).updateAllRewardState()
            const tx_block = (await update_tx).blockNumber

            const new_reward_per_token_weth = await wrapper.rewardStates(weth.address)
            const new_reward_balance_weth = await weth.balanceOf(wrapper.address)

            const new_reward_per_token_war = await wrapper.rewardStates(war.address)
            const new_reward_balance_war = await war.balanceOf(wrapper.address)

            const expected_reward_per_token_increase_weth = new_reward_balance_weth.sub(prev_reward_balance_weth).mul(UNIT).div(await wrapper.totalSupply())
            const expected_reward_per_token_increase_war = new_reward_balance_war.sub(prev_reward_balance_war).mul(UNIT).div(await wrapper.totalSupply())

            expect(new_reward_per_token_weth).to.be.eq(prev_reward_per_token_weth.add(expected_reward_per_token_increase_weth))
            expect(new_reward_per_token_war).to.be.eq(prev_reward_per_token_war.add(expected_reward_per_token_increase_war))

            expect(await staker.getUserAccruedRewards(weth.address, wrapper.address, { blockTag: tx_block })).to.be.eq(0)
            expect(await staker.getUserAccruedRewards(war.address, wrapper.address, { blockTag: tx_block })).to.be.eq(0)

        });

        it(' should not claim the other rewards from the Staker', async () => {

            const prev_balance_auraBal = await auraBal.balanceOf(wrapper.address)
            const prev_balance_cvxCrv = await cvxCrv.balanceOf(wrapper.address)

            await wrapper.connect(admin).updateAllRewardState()

            expect(await auraBal.balanceOf(wrapper.address)).to.be.eq(prev_balance_auraBal)
            expect(await cvxCrv.balanceOf(wrapper.address)).to.be.eq(prev_balance_cvxCrv)

        });
    
    });

    describe('getUserAccruedRewards', async () => {

        beforeEach(async () => {

            await advanceTime(86400 * 3)

            await wrapper.connect(admin).updateRewardState(weth.address)
        
        });

        it(' should return the correct amounts - user 1', async () => {

            const user_state = await wrapper.getUserRewardState(weth.address, user1.address)
            const current_reward_per_token = await wrapper.rewardStates(weth.address)
            const user_balance = await wrapper.balanceOf(user1.address)
            
            const expected_amount = user_state.accruedRewards.add(
                user_balance.mul(current_reward_per_token.sub(user_state.lastRewardPerToken)).div(UNIT)
            )

            expect(await wrapper.getUserAccruedRewards(weth.address, user1.address)).to.be.eq(expected_amount)

        });

        it(' should return the correct amounts - user 2', async () => {

            const user_state = await wrapper.getUserRewardState(weth.address, user2.address)
            const current_reward_per_token = await wrapper.rewardStates(weth.address)
            const user_balance = await wrapper.balanceOf(user2.address)
            
            const expected_amount = user_state.accruedRewards.add(
                user_balance.mul(current_reward_per_token.sub(user_state.lastRewardPerToken)).div(UNIT)
            )

            expect(await wrapper.getUserAccruedRewards(weth.address, user2.address)).to.be.eq(expected_amount)

        });

        it(' should return the correct amounts - all users', async () => {

            const user_state_1 = await wrapper.getUserRewardState(weth.address, user1.address)
            const user_state_2 = await wrapper.getUserRewardState(weth.address, user2.address)
            const user_state_3 = await wrapper.getUserRewardState(weth.address, user3.address)
            const current_reward_per_token = await wrapper.rewardStates(weth.address)
            const user_balance_1 = await wrapper.balanceOf(user1.address)
            const user_balance_2 = await wrapper.balanceOf(user2.address)
            const user_balance_3 = await wrapper.balanceOf(user3.address)
            
            const expected_amount_1 = user_state_1.accruedRewards.add(
                user_balance_1.mul(current_reward_per_token.sub(user_state_1.lastRewardPerToken)).div(UNIT)
            )
            const expected_amount_2 = user_state_2.accruedRewards.add(
                user_balance_2.mul(current_reward_per_token.sub(user_state_2.lastRewardPerToken)).div(UNIT)
            )
            const expected_amount_3 = user_state_3.accruedRewards.add(
                user_balance_3.mul(current_reward_per_token.sub(user_state_3.lastRewardPerToken)).div(UNIT)
            )

            expect(
                expected_amount_1.add(expected_amount_2).add(expected_amount_3)
            ).to.be.eq(await weth.balanceOf(wrapper.address))

        });
    
    });

    describe('getUserTotalClaimableRewards', async () => {

        beforeEach(async () => {

            await advanceTime(86400 * 3)

            await wrapper.connect(admin).updateAllRewardState()
        
        });

        it(' should return the correct amounts', async () => {

            const user_balance = await wrapper.balanceOf(user1.address)

            const user_state_weth = await wrapper.getUserRewardState(weth.address, user1.address)
            const current_reward_per_token_weth = await wrapper.rewardStates(weth.address)
            
            const expected_amount_weth = user_state_weth.accruedRewards.add(
                user_balance.mul(current_reward_per_token_weth.sub(user_state_weth.lastRewardPerToken)).div(UNIT)
            )

            const user_state_war = await wrapper.getUserRewardState(war.address, user1.address)
            const current_reward_per_token_war = await wrapper.rewardStates(war.address)
            
            const expected_amount_war = user_state_war.accruedRewards.add(
                user_balance.mul(current_reward_per_token_war.sub(user_state_war.lastRewardPerToken)).div(UNIT)
            )

            const total_claimables = await wrapper.getUserTotalClaimableRewards(user1.address)

            expect(total_claimables[0].reward).to.be.eq(weth.address)
            expect(total_claimables[0].claimableAmount).to.be.eq(expected_amount_weth)

            expect(total_claimables[1].reward).to.be.eq(war.address)
            expect(total_claimables[1].claimableAmount).to.be.eq(expected_amount_war)

        });
    
    });

    describe('claimRewards', async () => {

        beforeEach(async () => {

            await advanceTime(86400 * 3)

            await wrapper.connect(admin).updateAllRewardState()
        
        });

        it(' should claim all rewards correctly & not claim unlisted rewards', async () => {

            const user_balance = await wrapper.balanceOf(user1.address)

            const prev_user_balance_weth = await weth.balanceOf(user1.address)
            const prev_user_balance_war = await war.balanceOf(user1.address)

            const prev_balance_auraBal = await auraBal.balanceOf(user1.address)
            const prev_balance_cvxCrv = await cvxCrv.balanceOf(user1.address)

            const user_state_weth = await wrapper.getUserRewardState(weth.address, user1.address)
            const user_state_war = await wrapper.getUserRewardState(war.address, user1.address)
            
            const claim_tx = await wrapper.connect(user1).claimRewards(user1.address)

            const current_reward_per_token_weth = await wrapper.rewardStates(weth.address)
            const current_reward_per_token_war = await wrapper.rewardStates(war.address)
            
            const expected_amount_weth = user_state_weth.accruedRewards.add(
                user_balance.mul(current_reward_per_token_weth.sub(user_state_weth.lastRewardPerToken)).div(UNIT)
            )
            const expected_amount_war = user_state_war.accruedRewards.add(
                user_balance.mul(current_reward_per_token_war.sub(user_state_war.lastRewardPerToken)).div(UNIT)
            )

            expect(await weth.balanceOf(user1.address)).to.be.eq(prev_user_balance_weth.add(expected_amount_weth))
            expect(await war.balanceOf(user1.address)).to.be.eq(prev_user_balance_war.add(expected_amount_war))

            expect(await auraBal.balanceOf(user1.address)).to.be.eq(prev_balance_auraBal)
            expect(await cvxCrv.balanceOf(user1.address)).to.be.eq(prev_balance_cvxCrv)
            
            await expect(claim_tx).to.emit(wrapper, "ClaimedRewards")
                .withArgs(weth.address, user1.address, user1.address, expected_amount_weth);
            await expect(claim_tx).to.emit(wrapper, "ClaimedRewards")
                .withArgs(war.address, user1.address, user1.address, expected_amount_war);

        });

        it(' should have updated reward states & claim from Staker', async () => {

            const current_reward_per_token_weth = await wrapper.rewardStates(weth.address)
            const current_reward_per_token_war = await wrapper.rewardStates(war.address)

            const claim_tx = await wrapper.connect(user1).claimRewards(user1.address)
            const tx_block = (await claim_tx).blockNumber

            expect(await wrapper.rewardStates(weth.address)).to.be.gt(current_reward_per_token_weth)
            expect(await wrapper.rewardStates(war.address)).to.be.gt(current_reward_per_token_war)

            expect(await staker.getUserAccruedRewards(weth.address, wrapper.address, { blockTag: tx_block })).to.be.eq(0)
            expect(await staker.getUserAccruedRewards(war.address, wrapper.address, { blockTag: tx_block })).to.be.eq(0)

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                wrapper.connect(user1).claimRewards(ethers.constants.AddressZero)
            ).to.be.revertedWith('ZeroAddress')

        });
    
    });

    describe('claimRewards - part 2', async () => {

        beforeEach(async () => {

            await advanceTime(86400 * 3)

            await wrapper.connect(admin).updateAllRewardState()
        
        });

        it(' should send the rewards to the given receiver correctly', async () => {

            const user_balance = await wrapper.balanceOf(user1.address)

            const prev_user_balance_weth = await weth.balanceOf(user1.address)
            const prev_user_balance_war = await war.balanceOf(user1.address)
            const prev_user_balance_weth_2 = await weth.balanceOf(otherUser.address)
            const prev_user_balance_war_2 = await war.balanceOf(otherUser.address)

            const user_state_weth = await wrapper.getUserRewardState(weth.address, user1.address)
            const user_state_war = await wrapper.getUserRewardState(war.address, user1.address)
            
            const claim_tx = await wrapper.connect(user1).claimRewards(otherUser.address)

            const current_reward_per_token_weth = await wrapper.rewardStates(weth.address)
            const current_reward_per_token_war = await wrapper.rewardStates(war.address)
            
            const expected_amount_weth = user_state_weth.accruedRewards.add(
                user_balance.mul(current_reward_per_token_weth.sub(user_state_weth.lastRewardPerToken)).div(UNIT)
            )
            const expected_amount_war = user_state_war.accruedRewards.add(
                user_balance.mul(current_reward_per_token_war.sub(user_state_war.lastRewardPerToken)).div(UNIT)
            )

            expect(await weth.balanceOf(user1.address)).to.be.eq(prev_user_balance_weth)
            expect(await war.balanceOf(user1.address)).to.be.eq(prev_user_balance_war)
            expect(await weth.balanceOf(otherUser.address)).to.be.eq(prev_user_balance_weth_2.add(expected_amount_weth))
            expect(await war.balanceOf(otherUser.address)).to.be.eq(prev_user_balance_war_2.add(expected_amount_war))
            
            await expect(claim_tx).to.emit(wrapper, "ClaimedRewards")
                .withArgs(weth.address, user1.address, otherUser.address, expected_amount_weth);
            await expect(claim_tx).to.emit(wrapper, "ClaimedRewards")
                .withArgs(war.address, user1.address, otherUser.address, expected_amount_war);

        });

        it(' should not claim anything if nothing to claim for user', async () => {

            const prev_user_balance_weth = await weth.balanceOf(otherUser.address)
            const prev_user_balance_war = await war.balanceOf(otherUser.address)
            
            const claim_tx = await wrapper.connect(otherUser).claimRewards(otherUser.address)
            
            expect(await weth.balanceOf(otherUser.address)).to.be.eq(prev_user_balance_weth)
            expect(await war.balanceOf(otherUser.address)).to.be.eq(prev_user_balance_war)
            
            await expect(claim_tx).not.to.emit(wrapper, "ClaimedRewards")
            await expect(claim_tx).not.to.emit(wrapper, "ClaimedRewards")

        });
    
    });

    describe('claimRewardsForUser', async () => {

        beforeEach(async () => {

            await advanceTime(86400 * 3)

            await wrapper.connect(admin).updateAllRewardState()

            await wrapper.connect(admin).setUserAllowedClaimer(user1.address, user3.address)
        
        });

        it(' should allow caller listed as allowedClaimer to claim', async () => {

            const user_balance = await wrapper.balanceOf(user1.address)

            const prev_user_balance_weth = await weth.balanceOf(user1.address)
            const prev_user_balance_war = await war.balanceOf(user1.address)

            const prev_balance_auraBal = await auraBal.balanceOf(user1.address)
            const prev_balance_cvxCrv = await cvxCrv.balanceOf(user1.address)

            const prev_user_balance_weth_3 = await weth.balanceOf(user3.address)
            const prev_user_balance_war_3 = await war.balanceOf(user3.address)

            const prev_balance_auraBal_3 = await auraBal.balanceOf(user3.address)
            const prev_balance_cvxCrv_3 = await cvxCrv.balanceOf(user3.address)

            const user_state_weth = await wrapper.getUserRewardState(weth.address, user1.address)
            const user_state_war = await wrapper.getUserRewardState(war.address, user1.address)

            const user_state_weth_3 = await wrapper.getUserRewardState(weth.address, user3.address)
            const user_state_war_3 = await wrapper.getUserRewardState(war.address, user3.address)
            
            const claim_tx = await wrapper.connect(user3).claimRewardsForUser(user1.address, user3.address)

            const current_reward_per_token_weth = await wrapper.rewardStates(weth.address)
            const current_reward_per_token_war = await wrapper.rewardStates(war.address)
            
            const expected_amount_weth = user_state_weth.accruedRewards.add(
                user_balance.mul(current_reward_per_token_weth.sub(user_state_weth.lastRewardPerToken)).div(UNIT)
            )
            const expected_amount_war = user_state_war.accruedRewards.add(
                user_balance.mul(current_reward_per_token_war.sub(user_state_war.lastRewardPerToken)).div(UNIT)
            )

            expect(
                (await wrapper.getUserRewardState(weth.address, user3.address)).lastRewardPerToken
            ).to.be.eq(user_state_weth_3.lastRewardPerToken)
            expect(
                (await wrapper.getUserRewardState(war.address, user3.address)).lastRewardPerToken
            ).to.be.eq(user_state_war_3.lastRewardPerToken)

            expect(await weth.balanceOf(user1.address)).to.be.eq(prev_user_balance_weth)
            expect(await war.balanceOf(user1.address)).to.be.eq(prev_user_balance_war)

            expect(await weth.balanceOf(user3.address)).to.be.eq(prev_user_balance_weth_3.add(expected_amount_weth))
            expect(await war.balanceOf(user3.address)).to.be.eq(prev_user_balance_war_3.add(expected_amount_war))

            expect(await auraBal.balanceOf(user1.address)).to.be.eq(prev_balance_auraBal)
            expect(await cvxCrv.balanceOf(user1.address)).to.be.eq(prev_balance_cvxCrv)

            expect(await auraBal.balanceOf(user3.address)).to.be.eq(prev_balance_auraBal_3)
            expect(await cvxCrv.balanceOf(user3.address)).to.be.eq(prev_balance_cvxCrv_3)
            
            await expect(claim_tx).to.emit(wrapper, "ClaimedRewards")
                .withArgs(weth.address, user1.address, user3.address, expected_amount_weth);
            await expect(claim_tx).to.emit(wrapper, "ClaimedRewards")
                .withArgs(war.address, user1.address, user3.address, expected_amount_war);

        });

        it(' should fail if caller is not allowedClaimer', async () => {

            await expect(
                wrapper.connect(user2).claimRewardsForUser(user1.address, user2.address)
            ).to.be.revertedWith('ClaimNotAllowed')

            await expect(
                wrapper.connect(otherUser).claimRewardsForUser(user1.address, otherUser.address)
            ).to.be.revertedWith('ClaimNotAllowed')

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                wrapper.connect(user3).claimRewardsForUser(user1.address, ethers.constants.AddressZero)
            ).to.be.revertedWith('ZeroAddress')

            await expect(
                wrapper.connect(user3).claimRewardsForUser(ethers.constants.AddressZero, user3.address)
            ).to.be.revertedWith('ZeroAddress')

        });
    
    });

});