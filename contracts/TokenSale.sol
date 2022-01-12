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

    uint256 private constant SECONDS_IN_DAY = 86400;

    IVestingVault public vestingVault;

    ERC20 public token;

    uint256 public startTime;

    uint256 public saleDuration;

    uint16 public firstVestingDurationInDays;

    uint16 public secondVestingDurationInDays;

    uint256 public tokenPerWei;

    uint256 public totalTokensForSale;

    uint256 public availableTokensForSale;

    uint16 public unlockPercent;

    event TokenPurchase(
        address indexed purchaser,
        address indexed beneficiary,
        uint256 fuseAmount,
        uint256 tokenAmount
    );

    modifier saleEnded {
        require(block.timestamp > startTime + saleDuration, "sale is open");
        _;
    }

    constructor(
        IVestingVault _vestingVault,
        ERC20 _token,
        uint256 _startTime,
        uint256 _saleDuration,
        uint16 _firstVestingDurationInDays,
        uint16 _secondVestingDurationInDays,
        uint256 _tokenPerWei,
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
        require(
            _startTime > block.timestamp,
            "startTime should be a time in the future"
        );
        require(_tokenPerWei > 0, "rate should be greater than zero");
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
        firstVestingDurationInDays = _firstVestingDurationInDays;
        secondVestingDurationInDays = _secondVestingDurationInDays;
        tokenPerWei = _tokenPerWei;
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
        return fuseAmount.mul(tokenPerWei);
    }

    function purchaseTokens(address beneficiary) public payable override {
        _purchase(beneficiary);
    }

    function withdrawTokens() public override onlyOwner saleEnded {
        require(
            token.transfer(owner(), token.balanceOf(address(this))),
            "Failed to send tokens"
        );
    }

    function withdrawFuse() public override onlyOwner saleEnded {
        (bool sent, ) = payable(owner()).call{value: address(this).balance}("");
        require(sent, "Failed to send FUSE");
    }

    function _purchase(address beneficiary) private {
        require(block.timestamp > startTime, "token sale has not started");
        require(
            block.timestamp < startTime + saleDuration,
            "token sale has ended"
        );
        require(msg.value > 0, "fuse amount should be greater than zero");

        uint256 tokenAmount = calculateTokenAmount(msg.value);
        require(tokenAmount > 0, "token amount should be greater than zero");

        if (firstVestingDurationInDays > 0 && secondVestingDurationInDays > 0) {
            uint256 unlockedAmount = tokenAmount.mul(unlockPercent).div(100);
            require(
                unlockedAmount > 0,
                "unlocked amount should be greater than zero"
            );

            uint256 lockedAmount = tokenAmount.sub(unlockedAmount);

            token.approve(address(vestingVault), tokenAmount);

            _createVestingSchedule(
                beneficiary,
                unlockedAmount,
                0,
                firstVestingDurationInDays
            );

            _createVestingSchedule(
                beneficiary,
                lockedAmount,
                block.timestamp + (firstVestingDurationInDays * SECONDS_IN_DAY),
                secondVestingDurationInDays
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
