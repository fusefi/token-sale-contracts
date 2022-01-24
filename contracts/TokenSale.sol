// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./interfaces/ITokenSale.sol";
import "./interfaces/IVestingVault.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract TokenSale is Ownable, ReentrancyGuard, ITokenSale {
    using SafeMath for uint256;
    using SafeMath for uint16;

    uint256 private constant SECONDS_IN_DAY = 86400;

    IVestingVault public vestingVault;

    ERC20 public token;

    uint256 public startTime;

    uint256 public saleDuration;

    uint256 public tokenPerWei;

    uint256 public totalTokensForSale;

    uint256 public availableTokensForSale;

    uint256[] public firstVesting;

    uint256[] public secondVesting;

    uint256 public purchaseLimit;
    
    mapping(address => uint256) public fuseBalances;

    event TokenPurchase(
        address indexed purchaser,
        uint256 fuseAmount,
        uint256 tokenAmount
    );

    event PurchaseLimitChanged(uint256 oldPurchaseLimit, uint256 newPurchaseLimit);

    constructor(
        IVestingVault _vestingVault,
        ERC20 _token,
        uint256[] memory _firstVesting,
        uint256[] memory _secondVesting,
        uint256 _startTime,
        uint256 _saleDuration,
        uint256 _tokenPerWei,
        uint256 _tokensForSale,
        uint256 _purchaseLimit
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
        require(_firstVesting[1] + _secondVesting[1] == 100, "vesting total should be 100 percent");
        require(_purchaseLimit > 0, "purchase limit should be greater than zero");

        vestingVault = _vestingVault;
        token = _token;
        firstVesting = _firstVesting;
        secondVesting = _secondVesting;
        startTime = _startTime;
        saleDuration = _saleDuration;
        tokenPerWei = _tokenPerWei;
        totalTokensForSale = _tokensForSale;
        availableTokensForSale = _tokensForSale;
        purchaseLimit = _purchaseLimit;
    }

    receive() external payable {
        _purchase();
    }

    function calculateTokenAmount(uint256 fuseAmount)
        public
        view
        override
        returns (uint256)
    {
        return fuseAmount.mul(tokenPerWei);
    }

    function purchaseTokens() public payable override {
        _purchase();
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

    function setPurchaseLimit(uint256 newPurchaseLimit) public override onlyOwner {
        require(newPurchaseLimit > 0, "purchase limit should be greater than zero");
        uint256 oldPurchaseLimit = purchaseLimit;
        purchaseLimit = newPurchaseLimit;
        emit PurchaseLimitChanged(oldPurchaseLimit, newPurchaseLimit);
    }

    function _purchase() private nonReentrant {
        require(block.timestamp > startTime, "token sale has not started");
        require(
            block.timestamp < startTime + saleDuration,
            "token sale has ended"
        );
        require(msg.value > 0, "fuse amount should be greater than zero");

        uint256 tokenAmount = calculateTokenAmount(msg.value);

        _createVesting(msg.sender, tokenAmount, 0, firstVesting);

        _createVesting(
            msg.sender,
            tokenAmount,
            block.timestamp + (firstVesting[0] * SECONDS_IN_DAY),
            secondVesting
        );

        availableTokensForSale = availableTokensForSale.sub(tokenAmount);

        fuseBalances[msg.sender] = fuseBalances[msg.sender].add(msg.value);
        require(fuseBalances[msg.sender] <= purchaseLimit, "sender has reached purchase limit");

        emit TokenPurchase(msg.sender, msg.value, tokenAmount);
    }

    function _createVesting(
        address beneficiary,
        uint256 amount,
        uint256 start,
        uint256[] memory vesting
    ) private {
        uint256 vestingDays = vesting[0];
        uint256 vestingPercent = vesting[1];

        if (vestingDays > 0) {
            uint256 vestingAmount = amount.mul(vestingPercent).div(100);
            token.approve(address(vestingVault), amount);
            vestingVault.addTokenGrant(
                beneficiary,
                start,
                vestingAmount,
                uint16(vestingDays),
                0
            );
        }
    }
}
