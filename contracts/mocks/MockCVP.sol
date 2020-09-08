/* SPDX-License-Identifier: None */
pragma solidity ^0.6.10;

contract MockCVP {
  address public lastMsgSender;
  address public lastCalledDelegatee;

  function delegate(address _delegatee) public {
    lastMsgSender = msg.sender;
    lastCalledDelegatee = _delegatee;
  }

  function totalSupply() external pure returns (uint256) {
    return 42;
  }
}
