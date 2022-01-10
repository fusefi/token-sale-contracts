// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./interfaces/ITokenSale.sol";
import "./interfaces/IVestingVault.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TokenSale is Ownable, ITokenSale {
    using SafeMath for uint256;
    using SafeMath for uint16;

    IVestingVault public vestingVault;

    ERC20 public token;

    uint256 public startTime;

    uint256 public saleDuration;

    uint16 public vestingCliff;

    uint16 public vestingDuration;

    uint256 public tokenPerFuse;

    uint256 public totalTokensForSale;

    uint256 public availableTokensForSale;

    uint16 public unlockedPercentAtPurchase;

    event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 fuseAmount, uint256 tokenAmount);

    constructor(
        IVestingVault _vestingVault, 
        ERC20 _token, 
        uint256 _startTime, 
        uint256 _saleDuration,
        uint16 _firstVestingCliff,
        uint16 _firstVestingDuration,
        uint16 _secondVestingCliff,
        uint16 _secondVestingDuration,
        uint256 _tokenPerFuse,
        uint256 _tokensForSale,
        uint16 _unlockedPercentAtPurchase
    ) {
        require(_unlockedPercentAtPurchase > 0 && _unlockedPercentAtPurchase <= 100, "percent should be greater than 0 and less than 100");

        vestingVault = _vestingVault;
        token = _token;
        startTime = _startTime;
        saleDuration = _saleDuration;
        vestingCliff = _vestingCliff;
        vestingDuration = _vestingDuration;
        tokenPerFuse = _tokenPerFuse;
        totalTokensForSale = _tokensForSale;
        availableTokensForSale = _tokensForSale;
        unlockedPercentAtPurchase = _unlockedPercentAtPurchase;
    }

    function calculateTokenAmount(uint256 fuseAmount) public override view returns (uint256) {
        return fuseAmount.mul(tokenPerFuse);
    }

    receive() external payable {
        _purchase(msg.sender);
    }

    function purchaseTokens(address beneficiary) public override {
        _purchase(beneficiary);
    }

    function withdrawTokens() public override onlyOwner {
        require(token.transfer(owner(), token.balanceOf(address(this))), "Failed to send tokens");
    }

    function withdrawFuse() public override onlyOwner {
        (bool sent, ) = payable(owner()).call{value: address(this).balance}("");
        require(sent, "Failed to send FUSE");
    }

    function _purchase(address beneficiary) private {
        require(block.timestamp > startTime, "token sale has not started");
        require(msg.value > 0, "fuse amount should be greater than zero");

        uint256 tokenAmount = calculateTokenAmount(msg.value);
        require(tokenAmount > 0, "token amount should be greater than zero");

        uint256 unlockedAmount = tokenAmount.mul(unlockedPercentAtPurchase).div(100);
        require(unlockedAmount > 0, "unlocked amount should be greater than zero");

        uint256 lockedAmount = tokenAmount.sub(unlockedAmount);

        // create two vestings for user,    
        _createVesting(beneficiary, unlockedAmount, 0);
        _createVesting(beneficiary, lockedAmount, 2592000);

        availableTokensForSale = availableTokensForSale.sub(tokenAmount);

        emit TokenPurchase(msg.sender, beneficiary, msg.value, tokenAmount);
    }

    function _createVesting(address beneficiary, uint256 amount, uint256 vestingStartTime) private {
        vestingVault.addTokenGrant(beneficiary, vestingStartTime, amount, vestingDuration, 0);
    }
}