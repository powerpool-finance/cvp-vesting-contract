/* SPDX-License-Identifier: UNLICENSED */

pragma solidity 0.6.12;

import "./utils/SafeMath.sol";

interface IERC20 {
  function totalSupply() external view returns (uint256);

  function transfer(address _to, uint256 _amount) external;
}

interface ICRV {
  function delegate(address delegatee) external;
}

interface CvpInterface {
  function getPriorVotes(address account, uint256 blockNumber) external view returns (uint96);
}

/**
 * @title PowerPool Vesting Contract
 * @author PowerPool
 */
contract PPVesting is CvpInterface {
  using SafeMath for uint256;

  /// @notice Emitted when an owner delegates all the contract voting power to a particular address
  event DelegateVote(address indexed to);

  // @notice Emitted once when the contract was deployed
  event Init(address[] members);

  // @notice Emitted when a member transfer his permission
  event Transfer(address indexed from, address indexed to, uint32 indexed blockNumber, uint96 alreadyClaimed);

  /// @notice Emitted when an owner transfer their ownership to a new address
  event TransferOwnership(address indexed from, address indexed to);

  /// @notice Emitted when a member withdraws available balance
  event Withdraw(address indexed member, address indexed to, uint96 amount, uint256 newAlreadyClaimed);

  /// @notice A Emitted when a member unclaimed balance changes
  event UnclaimedBalanceChanged(address indexed member, uint256 previousUnclaimed, uint256 newUnclaimed);

  /// @notice A member statuses and unclaimed balance tracker
  struct Member {
    bool active;
    bool transferred;
    uint96 alreadyClaimed;
  }

  /// @notice A checkpoint for marking number of votes from a given block
  struct Checkpoint {
    uint32 fromBlock;
    uint96 votes;
  }

  /// @notice A contract owner
  address public owner;

  /// @notice ERC20 token address
  address public immutable token;

  /// @notice Start block number for vesting calculations
  uint256 public immutable startBlock;

  /// @notice Duration of the vesting in blocks
  uint256 public immutable durationInBlocks;

  /// @notice End block number, used only from UI
  uint256 public immutable endsAt;

  /// @notice Number of the vesting contract members, used only from UI
  uint256 public immutable memberCount;

  /// @notice Amount of ERC20 tokens to distribute during the vesting period
  uint96 public immutable amountPerMember;

  /// @notice Member details by their address
  mapping(address => Member) public members;

  /// @notice A record of unclaimed balance checkpoints for each member, by index
  mapping(address => mapping(uint32 => Checkpoint)) public checkpoints;

  /// @notice The number of checkpoints for each member
  mapping(address => uint32) public numCheckpoints;

  modifier onlyOwner() {
    require(msg.sender == owner, "PPVesting::onlyOwner: Check failed");
    _;
  }

  /**
   * @notice Constructs a new vesting contract
   * @dev It's up to a deployer to allocate the correct amount of ERC20 tokens on this contract
   * @param _owner The initial owner address
   * @param _tokenAddress The ERC20 token address to use with this vesting contract
   * @param _startBlock The block number when the vesting period starts
   * @param _durationInBlocks The number of blocks the vesting period should last
   * @param _memberList The list of addresses to distribute tokens to
   * @param _amountPerMember The number of tokens to distribute to each vesting contract member
   */
  constructor(
    address _owner,
    address _tokenAddress,
    uint256 _startBlock,
    uint256 _durationInBlocks,
    address[] memory _memberList,
    uint96 _amountPerMember
  ) public {
    require(_durationInBlocks > 1, "PPVesting: Invalid durationInBlocks");
    require(_owner != address(0), "PPVesting: Invalid owner address");
    require(_amountPerMember > 0, "PPVesting: Invalid amount per member");
    require(IERC20(_tokenAddress).totalSupply() > 0, "PPVesting: Missing supply of the token");

    owner = _owner;
    token = _tokenAddress;

    startBlock = _startBlock;
    durationInBlocks = _durationInBlocks;
    amountPerMember = _amountPerMember;
    endsAt = _startBlock + _durationInBlocks;

    uint256 len = _memberList.length;
    require(len > 0, "PPVesting: Empty member list");

    memberCount = len;

    for (uint256 i = 0; i < len; i++) {
      members[_memberList[i]].active = true;
    }

    emit Init(_memberList);
  }

  /**
   * @notice Checks whether the vesting period has started or not
   * @return true If the vesting period has started
   */
  function hasStarted() external view returns (bool) {
    return block.number >= startBlock;
  }

  /**
   * @notice Checks whether the vesting period has ended or not
   * @return true If the vesting period has ended
   */
  function hasEnded() external view returns (bool) {
    return block.number >= endsAt;
  }

  /**
   * @notice Provides information about a member unclaimed balance in order to use it in voting contract
   * @dev Behaves like a CVP delegated balance, but with a member unclaimed balance
   * @dev Block number must be a finalized block or else this function will revert to prevent misinformation
   * @dev Block number must be greater than the start block number or else this function
   *      will revert to prevent misinformation
   * @dev Returns 0 for non-members
   * @dev This method is a copy from CVP token with changes marked with XXX
   * @param account The address of the member to check
   * @param blockNumber The block number to get the vote balance at
   * @return The number of votes the account had as of the given block
   */
  function getPriorVotes(address account, uint256 blockNumber) external override view returns (uint96) {
    require(blockNumber < block.number, "PPVesting::getPriorVotes: Not yet determined");
    require(blockNumber > startBlock, "PPVesting::getPriorVotes: Can't be before/equal the startBlock");

    uint32 nCheckpoints = numCheckpoints[account];

    // Not a member
    if (members[account].active == false) {
      return 0;
    }

    // First check (A member has not claimed any tokens yet) OR (The blockNumber is before the first checkpoint)
    if (nCheckpoints == 0 || checkpoints[account][0].fromBlock > blockNumber) {
      return uint96(amountPerMember);
    }

    // Next check most recent balance
    if (checkpoints[account][nCheckpoints - 1].fromBlock <= blockNumber) {
      return checkpoints[account][nCheckpoints - 1].votes;
    }

    uint32 lower = 0;
    uint32 upper = nCheckpoints - 1;
    while (upper > lower) {
      uint32 center = upper - (upper - lower) / 2;
      // ceil, avoiding overflow
      Checkpoint memory cp = checkpoints[account][center];
      if (cp.fromBlock == blockNumber) {
        return cp.votes;
      } else if (cp.fromBlock < blockNumber) {
        lower = center;
      } else {
        upper = center - 1;
      }
    }
    return checkpoints[account][lower].votes;
  }

  /*** Available to Withdraw calculation ***/

  /**
   * @notice Returns available amount for withdrawal in the next mined block
   *         by a given member based on the current contract values
   * @param _member The member address to return available balance for
   * @return The available amount for withdrawal in the next block
   */
  function availableToWithdrawForMemberInTheNextBlock(address _member) external view returns (uint256) {
    Member storage member = members[_member];
    if (member.active == false) {
      return 0;
    }

    return availableToWithdraw(block.number + 1, startBlock, amountPerMember, durationInBlocks, member.alreadyClaimed);
  }

  /**
   * @notice Returns available amount for withdrawal by a given member in the current block
   *         based on the current contract values
   * @param _member The member address to return available balance for
   * @return The available amount for withdrawal in the current block
   */
  function availableToWithdrawForMember(address _member) external view returns (uint256) {
    Member storage member = members[_member];
    if (member.active == false) {
      return 0;
    }

    return availableToWithdrawFor(member.alreadyClaimed);
  }

  /**
   * @notice Returns available amount for withdrawal based on the current contract values
   *         and an already claimed amount input
   * @dev Will return amountPerMember for non-members, so an external check is required for this case
   * @param _alreadyClaimed amount
   * @return The available amount for withdrawal
   */
  function availableToWithdrawFor(uint256 _alreadyClaimed) public view returns (uint256) {
    return availableToWithdraw(block.number, startBlock, amountPerMember, durationInBlocks, _alreadyClaimed);
  }

  /**
   * @notice Calculates available amount for withdrawal
   * @dev A pure function which doesn't reads anything from state
   * @param _now A block number to calculate the available amount
   * @param _startBlock The vesting period start block number
   * @param _amountPerMember The amount of ERC20 tokens to be distributed to each member
   *         during this vesting period
   * @param _alreadyClaimed The amount of tokens already claimed by a member
   * @return The available amount for withdrawal
   */
  function availableToWithdraw(
    uint256 _now,
    uint256 _startBlock,
    uint256 _amountPerMember,
    uint256 _durationInBlocks,
    uint256 _alreadyClaimed
  ) public pure returns (uint256) {
    if (_now <= _startBlock) {
      return 0;
    }

    // uint256 vestingEndsAt = _startBlock + _durationInBlocks;
    uint256 vestingEndsAt = _startBlock.add(_durationInBlocks);
    uint256 toBlock = _now > vestingEndsAt ? vestingEndsAt : _now;

    // uint256 accrued = (toBlock - _startBlock) * _amountPerMember / _durationInBlocks;
    uint256 accrued = ((toBlock - _startBlock).mul(_amountPerMember).div(_durationInBlocks));

    // return accrued - _alreadyClaimed;
    return accrued.sub(_alreadyClaimed);
  }

  /*** Owner Methods ***/

  // @notice Owner delegates total unclaimed balance
  function delegateVote(address _to) external onlyOwner {
    emit DelegateVote(_to);
    ICRV(token).delegate(_to);
  }

  // @notice Owner immediately transfers ownership to another address
  function transferOwnership(address _to) external onlyOwner {
    emit TransferOwnership(msg.sender, _to);
    owner = _to;
  }

  /*** Member Methods ***/

  /**
   * @notice An active member withdraws a distributed amount of ERC20 tokens
   * @dev Caches unclaimed balance per block number which could be used by voting contract
   * @param _to address to withdraw ERC20 tokens to
   */
  function withdraw(address _to) external {
    Member storage member = members[msg.sender];
    require(member.active == true, "PPVesting::withdraw: User not active");

    uint256 bigAmount = availableToWithdrawFor(member.alreadyClaimed);
    require(bigAmount > 0, "PPVesting::withdraw: Nothing to withdraw");
    uint96 amount = safe96(bigAmount, "PPVesting::withdraw: Amount overflow");

    // member.alreadyClaimed += amount
    uint96 newAlreadyClaimed = add96(member.alreadyClaimed, amount, "PPVesting::withdraw: NewAlreadyClaimed overflow");
    member.alreadyClaimed = newAlreadyClaimed;

    // Cache unclaimed member balance
    _subUnclaimedCache(msg.sender, amount);

    emit Withdraw(msg.sender, _to, amount, newAlreadyClaimed);

    IERC20(token).transfer(_to, bigAmount);
  }

  /**
   * @notice Transfers a vested right to member funds to another address
   * @dev A new member won't have any votes for a period between a start block and a current block
   * @param _to address to transfer a vested right to
   */
  function transfer(address _to) external {
    address msgSender = msg.sender;
    Member storage from = members[msgSender];
    Member storage to = members[_to];

    uint96 alreadyClaimed = from.alreadyClaimed;

    require(from.active == true, "PPVesting::transfer: From member is inactive");
    require(to.active == false, "PPVesting::transfer: To address is already active");
    require(to.transferred == false, "PPVesting::transfer: To address has been already used");

    members[msgSender] = Member({ active: false, transferred: true, alreadyClaimed: 0 });

    members[_to] = Member({ active: true, transferred: false, alreadyClaimed: alreadyClaimed });

    uint32 startBlockNumber = safe32(startBlock, "PPVesting::transfer: Block number exceeds 32 bits");
    uint32 currentBlockNumber = safe32(block.number, "PPVesting::transfer: Block number exceeds 32 bits");

    checkpoints[_to][0] = Checkpoint(startBlockNumber, 0);
    checkpoints[_to][1] = Checkpoint(
      currentBlockNumber,
      sub96(amountPerMember, alreadyClaimed, "PPVesting::transfer: To 1st checkpoint overflow")
    );
    numCheckpoints[_to] += 2;

    _subUnclaimedCache(
      msgSender,
      sub96(amountPerMember, alreadyClaimed, "PPVesting::transfer: Unclaimed msgSender overflow")
    );

    emit Transfer(msgSender, _to, startBlockNumber, alreadyClaimed);
  }

  function _subUnclaimedCache(address _member, uint96 _subAmount) internal {
    uint32 dstRepNum = numCheckpoints[_member];
    uint96 dstRepOld = dstRepNum > 0 ? checkpoints[_member][dstRepNum - 1].votes : uint96(amountPerMember);
    uint96 dstRepNew = sub96(dstRepOld, _subAmount, "PPVesting::_cacheUnclaimed: Sub amount overflows");
    _writeCheckpoint(_member, dstRepNum, dstRepOld, dstRepNew);
  }

  /// @dev A copy from CVP token, only the event name changed
  function _writeCheckpoint(
    address delegatee,
    uint32 nCheckpoints,
    uint96 oldVotes,
    uint96 newVotes
  ) internal {
    uint32 blockNumber = safe32(block.number, "PPVesting::_writeCheckpoint: Block number exceeds 32 bits");

    if (nCheckpoints > 0 && checkpoints[delegatee][nCheckpoints - 1].fromBlock == blockNumber) {
      checkpoints[delegatee][nCheckpoints - 1].votes = newVotes;
    } else {
      checkpoints[delegatee][nCheckpoints] = Checkpoint(blockNumber, newVotes);
      numCheckpoints[delegatee] = nCheckpoints + 1;
    }

    emit UnclaimedBalanceChanged(delegatee, oldVotes, newVotes);
  }

  /// @dev The exact copy from CVP token
  function safe32(uint256 n, string memory errorMessage) internal pure returns (uint32) {
    require(n < 2**32, errorMessage);
    return uint32(n);
  }

  /// @dev The exact copy from CVP token
  function safe96(uint256 n, string memory errorMessage) internal pure returns (uint96) {
    require(n < 2**96, errorMessage);
    return uint96(n);
  }

  /// @dev The exact copy from CVP token
  function sub96(
    uint96 a,
    uint96 b,
    string memory errorMessage
  ) internal pure returns (uint96) {
    require(b <= a, errorMessage);
    return a - b;
  }

  /// @dev The exact copy from CVP token
  function add96(
    uint96 a,
    uint96 b,
    string memory errorMessage
  ) internal pure returns (uint96) {
    uint96 c = a + b;
    require(c >= a, errorMessage);
    return c;
  }
}
