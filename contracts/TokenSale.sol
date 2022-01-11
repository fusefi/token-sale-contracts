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

    uint256 private constant SECONDS_IN_MONTH = 2592000;

    IVestingVault public vestingVault;

    ERC20 public token;

    uint256 public startTime;

    uint256 public saleDuration;

    uint16 public firstVestingDuration;

    uint16 public secondVestingDuration;

    uint256 public tokenPerFuse;

    uint256 public totalTokensForSale;

    uint256 public availableTokensForSale;

    uint16 public unlockPercent;

    event TokenPurchase(
        address indexed purchaser,
        address indexed beneficiary,
        uint256 fuseAmount,
        uint256 tokenAmount
    );

    constructor(
        IVestingVault _vestingVault,
        ERC20 _token,
        uint256 _startTime,
        uint256 _saleDuration,
        uint16 _firstVestingDuration,
        uint16 _secondVestingDuration,
        uint256 _tokenPerFuse,
        uint256 _tokensForSale,
        uint16 _unlockPercent
    ) {
        require(
            address(_vestingVault) != address(0),
            "vault address should not be zero address"
        );
        require(
            address(_token) != address(0),
            "token address should not be zero address"
        );
        require(_tokenPerFuse > 0, "rate should be greater than zero");
        require(
            _tokensForSale > 0,
            "tokens for sale should be greater than zero"
        );
        require(
            _unlockPercent > 0 && _unlockPercent <= 100,
            "percent should be greater than zero and less than 100"
        );

        vestingVault = _vestingVault;
        token = _token;
        startTime = _startTime;
        saleDuration = _saleDuration;
        firstVestingDuration = _firstVestingDuration;
        secondVestingDuration = _secondVestingDuration;
        tokenPerFuse = _tokenPerFuse;
        totalTokensForSale = _tokensForSale;
        availableTokensForSale = _tokensForSale;
        unlockPercent = _unlockPercent;
    }

    receive() external payable {
        _purchase(msg.sender);
    }

    function calculateTokenAmount(uint256 fuseAmount)
        public
        view
        override
        returns (uint256)
    {
        return fuseAmount.mul(tokenPerFuse);
    }

    function purchaseTokens(address beneficiary) public override {
        _purchase(beneficiary);
    }

    function withdrawTokens() public override onlyOwner {
        require(
            token.transfer(owner(), token.balanceOf(address(this))),
            "Failed to send tokens"
        );
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

        if (firstVestingDuration > 0 && secondVestingDuration > 0) {
            uint256 unlockedAmount = tokenAmount.mul(unlockPercent).div(100);
            require(
                unlockedAmount > 0,
                "unlocked amount should be greater than zero"
            );

            uint256 lockedAmount = tokenAmount.sub(unlockedAmount);

            _createVestingSchedule(
                beneficiary,
                unlockedAmount,
                0,
                firstVestingDuration
            );
            _createVestingSchedule(
                beneficiary,
                lockedAmount,
                SECONDS_IN_MONTH,
                secondVestingDuration
            );
        } else {
            require(token.transfer(beneficiary, tokenAmount), "no tokens");
        }

        availableTokensForSale = availableTokensForSale.sub(tokenAmount);

        emit TokenPurchase(msg.sender, beneficiary, msg.value, tokenAmount);
    }

    function _createVestingSchedule(
        address beneficiary,
        uint256 amount,
        uint256 vestingStartTime,
        uint16 vestingDuration
    ) private {
        vestingVault.addTokenGrant(
            beneficiary,
            vestingStartTime,
            amount,
            vestingDuration,
            0
        );
    }
}
