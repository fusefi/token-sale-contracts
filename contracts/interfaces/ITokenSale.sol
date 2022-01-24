// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ITokenSale {
    function calculateTokenAmount(uint256 fuseAmount)
        external
        view
        returns (uint256 tokenAmount);

    function withdrawTokens() external;

    function withdrawFuse() external;

    function purchaseTokens() external payable;

    function setPurchaseLimit(uint256 newPurchaseLimit) external;
}
