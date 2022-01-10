// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVestingVault {
    function addTokenGrant(
        address _recipient, 
        uint256 _startTime, 
        uint256 _amount, 
        uint16 _vestingDurationInDays,
        uint16 _vestingCliffInDays
    ) external;
}
