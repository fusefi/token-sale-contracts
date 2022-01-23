const { expect } = require('chai')
const { parseEther } = require('ethers/lib/utils')
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
    token = await Token.deploy('Token', 'T', parseEther('1000000'))
    await token.deployed()

    const VestingVault = await ethers.getContractFactory('VestingVault12')
    vestingVault = await VestingVault.deploy(token.address)
    await vestingVault.deployed()

    TokenSale = await ethers.getContractFactory('TokenSale')
  })

  describe('setPurchaseLimit', () => {
    let tokenSale
    let purchaseAmount
    let tokenPerWei
    let firstVestingDurationInDays
    let secondVestingDurationInDays

    beforeEach(async () => {
      const startTime = (await latest()) + 1 * SECONDS_IN_DAYS
      const saleDuration = 2 * SECONDS_IN_DAYS

      tokenPerWei = '200'
      firstVestingDurationInDays = 30
      secondVestingDurationInDays = 60
      purchaseAmount = BigNumber.from(2)

      tokenSale = await TokenSale.deploy(
        vestingVault.address,
        token.address,
        [firstVestingDurationInDays, 10],
        [secondVestingDurationInDays, 90],
        startTime,
        saleDuration,
        tokenPerWei,
        parseEther('1000000')
      )

      await vestingVault.changeMultiSig(tokenSale.address)

      await token.transfer(tokenSale.address, parseEther('1000000'))
    })

    it('only owner can update purchase limit', async () => {
      expect(await tokenSale.purchaseLimit()).to.be.eq(parseEther('3000'))

      await expect(
        tokenSale.connect(signers[1]).setPurchaseLimit(parseEther('5000'))
      ).to.be.revertedWith('Ownable: caller is not the owner')

      await tokenSale.setPurchaseLimit(parseEther('5000'))

      expect(await tokenSale.purchaseLimit()).to.be.eq(parseEther('5000'))
    })
  })

  describe('double vesting', () => {
    let tokenSale
    let purchaseAmount
    let tokenPerWei
    let firstVestingDurationInDays
    let secondVestingDurationInDays

    beforeEach(async () => {
      const startTime = (await latest()) + 1 * SECONDS_IN_DAYS
      const saleDuration = 2 * SECONDS_IN_DAYS

      tokenPerWei = '200'
      firstVestingDurationInDays = 30
      secondVestingDurationInDays = 60
      purchaseAmount = BigNumber.from(2)

      tokenSale = await TokenSale.deploy(
        vestingVault.address,
        token.address,
        [firstVestingDurationInDays, 10],
        [secondVestingDurationInDays, 90],
        startTime,
        saleDuration,
        tokenPerWei,
        parseEther('1000000')
      )

      await vestingVault.changeMultiSig(tokenSale.address)

      await token.transfer(tokenSale.address, parseEther('1000000'))
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

      const firstVesting = await vestingVault.tokenGrants(vestings[0])
      expect(firstVesting.amount).to.be.eq(40) // 40

      const secondVesting = await vestingVault.tokenGrants(vestings[1])
      expect(secondVesting.amount).to.be.eq(360) // 360
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

    it('can not purchase more than purchase limit', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS)

      await expect(
        tokenSale.purchaseTokens(signers[1].address, {
          value: parseEther('3001'),
        }),
      ).to.be.revertedWith('sender has reached purchase limit')

      await tokenSale.purchaseTokens(signers[1].address, {
        value: parseEther('1000'),
      })

      await tokenSale.purchaseTokens(signers[1].address, {
        value: parseEther('1000'),
      })

      await tokenSale.purchaseTokens(signers[1].address, {
        value: parseEther('1000'),
      })

      await expect(
        tokenSale.purchaseTokens(signers[1].address, {
          value: parseEther('1'),
        }),
      ).to.be.revertedWith('sender has reached purchase limit')
    })

    it('owner can withdraw FUSE from contract', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS)

      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount
      })

      expect(await ethers.provider.getBalance(tokenSale.address)).to.eq(purchaseAmount)

      await expect(
        tokenSale.connect(signers[1]).withdrawFuse()
      ).to.be.revertedWith('Ownable: caller is not the owner')

      await tokenSale.withdrawFuse()

      expect(await ethers.provider.getBalance(tokenSale.address)).to.eq(0)
    })

    it('owner can withdraw Tokens from contract', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS)

      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount
      })

      expect(await token.balanceOf(tokenSale.address)).to.equal('999999999999999999999600')

      await expect(
        tokenSale.connect(signers[1]).withdrawTokens()
      ).to.be.revertedWith('Ownable: caller is not the owner')

      await tokenSale.withdrawTokens()

      expect(await token.balanceOf(tokenSale.address)).to.eq(0)
    })
    
  })

  describe('single vesting', () => {
    let tokenSale
    let purchaseAmount
    let tokenPerWei
    let firstVestingDurationInDays

    beforeEach(async () => {
      const startTime = (await latest()) + 1 * SECONDS_IN_DAYS
      const saleDuration = 2 * SECONDS_IN_DAYS

      tokenPerWei = '200'
      firstVestingDurationInDays = 30
      purchaseAmount = BigNumber.from(2)

      tokenSale = await TokenSale.deploy(
        vestingVault.address,
        token.address,
        [firstVestingDurationInDays, 100],
        [0, 0],
        startTime,
        saleDuration,
        tokenPerWei,
        parseEther('1000000')
      )

      await vestingVault.changeMultiSig(tokenSale.address)

      await token.transfer(tokenSale.address, parseEther('1000000'))
    })

    it('can buy tokens by sending FUSE to contract', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS + 1)

      await signers[1].sendTransaction({
        to: tokenSale.address,
        value: purchaseAmount,
      })

      const vestings = await vestingVault.getActiveGrants(signers[1].address)
      expect(vestings[0]).to.be.equal(0)
    })

    it('can buy tokens by calling #purchaseTokens', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS + 1)

      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount,
      })

      const vestings = await vestingVault.getActiveGrants(signers[1].address)
      expect(vestings[0]).to.be.equal(0)
    })

    it('sets correct vesting amounts based on percent', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS + 1)

      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount,
      })

      const vestings = await vestingVault.getActiveGrants(signers[1].address)

      const firstVesting = await vestingVault.tokenGrants(vestings[0])
      expect(firstVesting.amount).to.be.eq(400) // 400
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

      expect(await token.balanceOf(signers[1].address)).to.be.eq('13')

      // day 2

      await advanceTimeAndBlock(SECONDS_IN_DAYS)

      await vestingVault.connect(signers[1]).claimVestedTokens(vestings[0])

      expect(await token.balanceOf(signers[1].address)).to.be.eq('26')

      // ... day 30 first vesting done

      await advanceTimeAndBlock(28 * SECONDS_IN_DAYS)

      await vestingVault.connect(signers[1]).claimVestedTokens(vestings[0])

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

    it('can not purchase more than purchase limit', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS)

      await expect(
        tokenSale.purchaseTokens(signers[1].address, {
          value: parseEther('3001'),
        }),
      ).to.be.revertedWith('sender has reached purchase limit')

      await tokenSale.purchaseTokens(signers[1].address, {
        value: parseEther('1000'),
      })

      await tokenSale.purchaseTokens(signers[1].address, {
        value: parseEther('1000'),
      })

      await tokenSale.purchaseTokens(signers[1].address, {
        value: parseEther('1000'),
      })

      await expect(
        tokenSale.purchaseTokens(signers[1].address, {
          value: parseEther('1'),
        }),
      ).to.be.revertedWith('sender has reached purchase limit')
    })

    it('owner can withdraw FUSE from contract', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS)

      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount
      })

      expect(await ethers.provider.getBalance(tokenSale.address)).to.eq(purchaseAmount)

      await expect(
        tokenSale.connect(signers[1]).withdrawFuse()
      ).to.be.revertedWith('Ownable: caller is not the owner')

      await tokenSale.withdrawFuse()

      expect(await ethers.provider.getBalance(tokenSale.address)).to.eq(0)
    })

    it('owner can withdraw Tokens from contract', async () => {
      await advanceTimeAndBlock(1 * SECONDS_IN_DAYS)

      await tokenSale.purchaseTokens(signers[1].address, {
        value: purchaseAmount
      })

      expect(await token.balanceOf(tokenSale.address)).to.equal('999999999999999999999600')

      await expect(
        tokenSale.connect(signers[1]).withdrawTokens()
      ).to.be.revertedWith('Ownable: caller is not the owner')

      await tokenSale.withdrawTokens()

      expect(await token.balanceOf(tokenSale.address)).to.eq(0)
    })
  })
})
