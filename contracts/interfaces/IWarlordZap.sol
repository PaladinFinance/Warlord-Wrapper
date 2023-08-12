pragma solidity 0.8.16;
//SPDX-License-Identifier: None

interface IWarlordZap {

    function zap(address token, uint256 amount, address receiver) external returns (uint256);

}