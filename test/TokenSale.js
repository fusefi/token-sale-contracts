const { expect } = require('chai')
const { ethers } = require('hardhat')

const { latest, advanceTimeAndBlock } = require('./utilities/time')

const { BigNumber } = ethers

const SECONDS_IN_DAYS = 86400

describe('TokenSale', () => {
  let vestingVault
  let token
  let signers
  let TokenSale

  beforeEach(async () => {
    signers = await ethers.getSigners()

    const Token = await ethers.getContractFactory('ERC20Mock')
    token = await Token.deploy('Token', 'T', '100000000')
    await token.deployed()

    const VestingVault = await ethers.getContractFactory('VestingVault12')
    vestingVault = await VestingVault.deploy(token.address)
    await vestingVault.deployed()

    TokenSale = await ethers.getContractFactory('TokenSale')
  })

  describe('vesting', () => {
    let tokenSale
    let percent
    let purchaseAmount
    let tokenPerWei
    let firstVestingDurationInDays
    let secondVestingDurationInDays

    beforeEach(async () => {
      const startTime = (await latest()) + 1 * SECONDS_IN_DAYS
      const saleDuration = 2 * SECONDS_IN_DAYS

      percent = '10'
      tokenPerWei = '200'
      firstVestingDurationInDays = 30
      secondVestingDurationInDays = 60
      purchaseAmount = BigNumber.from(2)

      tokenSale = await TokenSale.deploy(
        vestingVault.address,
        token.address,
        startTime,
        saleDuration,
        firstVestingDurationInDays,
        secondVestingDurationInDays,
        tokenPerWei,
        '1000000',
        percent,
      )

      await vestingVault.changeMultiSig(tokenSale.address)

      await token.transfer(tokenSale.address, '100000000')
    })

    it('can buy tokens by sending FUSE to contract', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS + 1)

      await signers[1].sendTransaction({
        to: tokenSale.address,
        value: purchaseAmount,
      })

      const vestings = await vestingVault.getActiveGrants(signers[1].address)
      expect(vestings[0]).to.be.equal(0)
      expect(vestings[1]).to.be.equal(1)
    })

    it('can buy tokens by calling #purchaseTokens', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS + 1)

      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount,
      })

      const vestings = await vestingVault.getActiveGrants(signers[1].address)
      expect(vestings[0]).to.be.equal(0)
      expect(vestings[1]).to.be.equal(1)
    })

    it('sets correct vesting amounts based on percent', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS + 1)

      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount,
      })

      const vestings = await vestingVault.getActiveGrants(signers[1].address)

      const totalAmount = tokenPerWei * purchaseAmount // 400

      const firstVesting = await vestingVault.tokenGrants(vestings[0])
      expect(firstVesting.amount).to.be.eq((totalAmount * percent) / 100) // 40

      const secondVesting = await vestingVault.tokenGrants(vestings[1])
      expect(secondVesting.amount).to.be.eq(
        (totalAmount * (100 - percent)) / 100,
      ) // 360
    })

    it('sets correct vesting times', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS + 1)

      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount,
      })

      const vestings = await vestingVault.getActiveGrants(signers[1].address)

      const latestTimestamp = await latest()

      const firstVesting = await vestingVault.tokenGrants(vestings[0])
      expect(firstVesting.startTime).to.be.eq(latestTimestamp)
      expect(firstVesting.vestingDuration).to.be.equal(
        firstVestingDurationInDays,
      )

      const secondVesting = await vestingVault.tokenGrants(vestings[1])
      expect(secondVesting.startTime).to.be.eq(
        latestTimestamp + firstVestingDurationInDays * SECONDS_IN_DAYS,
      )
      expect(secondVesting.vestingDuration).to.be.eq(
        secondVestingDurationInDays,
      )
    })

    it('can fully claim their vesting for both schedules', async () => {
      await advanceTimeAndBlock(SECONDS_IN_DAYS + 1)

      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount,
      })

      // 400

      const vestings = await vestingVault.getActiveGrants(signers[1].address)

      // day 1

      await advanceTimeAndBlock(SECONDS_IN_DAYS)

      await vestingVault.connect(signers[1]).claimVestedTokens(vestings[0])

      expect(await token.balanceOf(signers[1].address)).to.be.eq('1')

      // day 2

      await advanceTimeAndBlock(SECONDS_IN_DAYS)

      await vestingVault.connect(signers[1]).claimVestedTokens(vestings[0])

      expect(await token.balanceOf(signers[1].address)).to.be.eq('2')

      // ... day 30 first vesting done

      await advanceTimeAndBlock(28 * SECONDS_IN_DAYS)

      await vestingVault.connect(signers[1]).claimVestedTokens(vestings[0])

      expect(await token.balanceOf(signers[1].address)).to.be.eq('40')

      // day 31

      await advanceTimeAndBlock(SECONDS_IN_DAYS)

      await vestingVault.connect(signers[1]).claimVestedTokens(vestings[1])

      expect(await token.balanceOf(signers[1].address)).to.be.eq('46')

      // day 32

      await advanceTimeAndBlock(SECONDS_IN_DAYS)

      await vestingVault.connect(signers[1]).claimVestedTokens(vestings[1])

      expect(await token.balanceOf(signers[1].address)).to.be.eq('52')

      // ... day 90 second vesting done

      await advanceTimeAndBlock(58 * SECONDS_IN_DAYS)

      await vestingVault.connect(signers[1]).claimVestedTokens(vestings[1])

      expect(await token.balanceOf(signers[1].address)).to.be.eq('400')
    })

    it('can not purchase after sale has ended', async () => {
      await advanceTimeAndBlock(3 * SECONDS_IN_DAYS)

      await expect(
        tokenSale.purchaseTokens(signers[1].address, {
          value: purchaseAmount,
        }),
      ).to.be.revertedWith('token sale has ended')
    })
  })

  describe('non vesting', () => {
    let tokenSale
    let percent
    let purchaseAmount
    let tokenPerWei
    let firstVestingDurationInDays
    let secondVestingDurationInDays

    beforeEach(async () => {
      const startTime = (await latest()) + SECONDS_IN_DAYS
      const saleDuration = 2 * SECONDS_IN_DAYS

      percent = '10'
      tokenPerWei = '200'
      firstVestingDurationInDays = 0
      secondVestingDurationInDays = 0
      purchaseAmount = BigNumber.from(2)

      tokenSale = await TokenSale.deploy(
        vestingVault.address,
        token.address,
        startTime,
        saleDuration,
        firstVestingDurationInDays,
        secondVestingDurationInDays,
        tokenPerWei,
        '1000000',
        percent,
      )

      await vestingVault.changeMultiSig(tokenSale.address)

      await token.transfer(tokenSale.address, '100000000')

      await advanceTimeAndBlock(SECONDS_IN_DAYS)
    })

    it('can buy tokens by sending FUSE to contract and receive full amounnt', async () => {
      await signers[1].sendTransaction({
        to: tokenSale.address,
        value: purchaseAmount,
      })

      expect(await token.balanceOf(signers[1].address)).to.be.eq('400')
    })

    it('can buy tokens by calling #purchaseTokens and receive full amount', async () => {
      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount,
      })

      expect(await token.balanceOf(signers[1].address)).to.be.eq('400')
    })

    describe('withdrawTokens', () => {
      describe('unauthorized', () => {
        it('can not withdraw remaining tokens before sale end', async () => {
          await expect(
            tokenSale.connect(signers[1]).withdrawTokens(),
          ).to.be.revertedWith('Ownable: caller is not the owner')
        })

        it('can withdraw remaining tokens after sale has ended', async () => {
          await advanceTimeAndBlock(SECONDS_IN_DAYS * 2)

          await expect(
            tokenSale.connect(signers[1]).withdrawTokens(),
          ).to.be.revertedWith('Ownable: caller is not the owner')
        })
      })

      describe('owner', () => {
        it('can not withdraw remaining tokens before sale end', async () => {
          await expect(tokenSale.withdrawTokens()).to.be.revertedWith(
            'sale is open',
          )
        })

        it('can withdraw remaining tokens after sale has ended', async () => {
          await advanceTimeAndBlock(SECONDS_IN_DAYS * 2)

          await tokenSale.withdrawTokens()

          expect(await token.balanceOf(signers[0].address)).to.be.eq(
            '100000000',
          )
        })
      })
    })

    describe('withdrawFuse', () => {
      describe('unauthorized', () => {
        it('can not withdraw remaining FUSE before sale end', async () => {
          await expect(
            tokenSale.connect(signers[1]).withdrawFuse(),
          ).to.be.revertedWith('Ownable: caller is not the owner')
        })

        it('can withdraw remaining FUSE after sale has ended', async () => {
          await tokenSale.purchaseTokens(signers[0].address, {
            value: purchaseAmount,
          })

          await advanceTimeAndBlock(SECONDS_IN_DAYS * 2)

          await expect(
            tokenSale.connect(signers[1]).withdrawFuse(),
          ).to.be.revertedWith('Ownable: caller is not the owner')
        })
      })

      describe('owner', () => {
        it('can not withdraw remaining FUSE before sale end', async () => {
          await expect(tokenSale.withdrawFuse()).to.be.revertedWith(
            'sale is open',
          )
        })

        it('can withdraw remaining FUSE after sale has ended', async () => {
          await tokenSale.purchaseTokens(signers[0].address, {
            value: purchaseAmount,
          })

          await advanceTimeAndBlock(SECONDS_IN_DAYS * 2)

          await expect(tokenSale.withdrawFuse()).not.to.reverted
        })
      })
    })
  })
})
