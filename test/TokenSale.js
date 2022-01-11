const { ethers } = require('hardhat')

describe('TokenSale', () => {
    let vestingVault
    let token
    let signers
    let TokenSale

    beforeEach(async () => {
        signers = await ethers.getSigners()

        const Token = await ethers.getContractFactory('ERC20Mock')
        token = await Token.deploy('Token', 'T', '1000')
        await token.deployed()

        const VestingVault = await ethers.getContractFactory('VestingVault')
        vestingVault = await VestingVault.deploy(token.address)
        await vestingVault.deployed()
    })
})