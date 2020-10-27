/* SPDX-License-Identifier: UNLICENSED */

pragma solidity 0.6.12;

import "./utils/SafeMath.sol";
import "@nomiclabs/buidler/console.sol";

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
  event Transfer(address indexed from, address indexed to, uint32 indexed blockNumber, uint96 alreadyClaimedVotes, uint96 alreadyClaimedTokens);

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
    uint96 alreadyClaimedVotes;
    uint96 alreadyClaimedTokens;
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

  /// @notice Start block number for vote vesting calculations
  uint256 public immutable startV;

  /// @notice Duration of the vote vesting in blocks
  uint256 public immutable durationV;

  /// @notice End vote vesting block number, used only from UI
  uint256 public immutable endV;

  /// @notice Start block number for token vesting calculations
  uint256 public immutable startT;

  /// @notice Duration of the token vesting in blocks
  uint256 public immutable durationT;

  /// @notice End token block number, used only from UI
  uint256 public immutable endT;

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

  /// @notice Vote delegations
  mapping(address => address) public voteDelegations;

  modifier onlyOwner() {
    require(msg.sender == owner, "PPVesting::onlyOwner: Check failed");
    _;
  }

  /**
   * @notice Constructs a new vesting contract
   * @dev It's up to a deployer to allocate the correct amount of ERC20 tokens on this contract
   * @param _owner The initial owner address
   * @param _tokenAddress The ERC20 token address to use with this vesting contract
   * @param _startV The block number when the vote vesting period starts
   * @param _durationV The number of blocks the vote vesting period should last
   * @param _startT The block number when the token vesting period starts
   * @param _durationT The number of blocks the token vesting period should last
   * @param _memberList The list of addresses to distribute tokens to
   * @param _amountPerMember The number of tokens to distribute to each vesting contract member
   */
  constructor(
    address _owner,
    address _tokenAddress,
    uint256 _startV,
    uint256 _durationV,
    uint256 _startT,
    uint256 _durationT,
    address[] memory _memberList,
    uint96 _amountPerMember
  ) public {
    require(_durationV > 1, "PPVesting: Invalid durationV");
    require(_durationT > 1, "PPVesting: Invalid durationT");
    require(_startV < _startT, "PPVesting: Requires startV < startT");
    require(_owner != address(0), "PPVesting: Invalid owner address");
    require(_amountPerMember > 0, "PPVesting: Invalid amount per member");
    require(IERC20(_tokenAddress).totalSupply() > 0, "PPVesting: Missing supply of the token");

    owner = _owner;
    token = _tokenAddress;

    startV = _startV;
    durationV = _durationV;
    endV = _startV + _durationV;

    startT = _startT;
    durationT = _durationT;
    endT = _startT + _durationT;

    amountPerMember = _amountPerMember;

    uint256 len = _memberList.length;
    require(len > 0, "PPVesting: Empty member list");

    memberCount = len;

    for (uint256 i = 0; i < len; i++) {
      members[_memberList[i]].active = true;
    }

    emit Init(_memberList);
  }

  /**
   * @notice Checks whether the vote vesting period has started or not
   * @return true If the vote vesting period has started
   */
  function hasVoteVestingStarted() external view returns (bool) {
    return block.number >= startV;
  }

  /**
   * @notice Checks whether the vote vesting period has ended or not
   * @return true If the vote vesting period has ended
   */
  function hasVoteVestingEnded() external view returns (bool) {
    return block.number >= endV;
  }

  /**
   * @notice Checks whether the token vesting period has started or not
   * @return true If the token vesting period has started
   */
  function hasTokenVestingStarted() external view returns (bool) {
    return block.number >= startT;
  }

  /**
   * @notice Checks whether the token vesting period has ended or not
   * @return true If the token vesting period has ended
   */
  function hasTokenVestingEnded() external view returns (bool) {
    return block.number >= endT;
  }

  function getVoteUser(address _voteHolder) public view returns (address) {
    address currentDelegate = voteDelegations[_voteHolder];
    if (currentDelegate == address(0)) {
      return _voteHolder;
    }
    return currentDelegate;
  }

  function getCurrentVotes(address _member) public view returns (uint256) {
    uint32 dstRepNum = numCheckpoints[_member];
    return dstRepNum > 0 ? checkpoints[_member][dstRepNum - 1].votes : 0;
  }

  /**
   * @notice Provides information about a member already claimed votes
   * @dev Behaves like a CVP delegated balance, but with a member unclaimed balance
   * @dev Block number must be a finalized block or else this function will revert to prevent misinformation
   * @dev Block number must be greater than the vote start block number or else this function
   *      will revert to prevent misinformation
   * @dev Returns 0 for non-member addresses, even for previously valid ones
   * @dev This method is a copy from CVP token with several modifications
   * @param account The address of the member to check
   * @param blockNumber The block number to get the vote balance at
   * @return The number of votes the account had as of the given block
   */
  function getPriorVotes(address account, uint256 blockNumber) public override view returns (uint96) {
    require(blockNumber < block.number, "PPVesting::getPriorVotes: Not yet determined");
    require(blockNumber > startV, "PPVesting::getPriorVotes: Can't be before/equal the startV");

    uint32 nCheckpoints = numCheckpoints[account];

    // Not a member
    if (members[account].active == false) {
      return 0;
    }

    // First check (A member has not claimed any tokens yet) OR (The blockNumber is before the first checkpoint)
    if (nCheckpoints == 0 || checkpoints[account][0].fromBlock > blockNumber) {
      return 0;
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
  function getAvailableTokensForMemberInTheNextBlock(address _member) external view returns (uint256) {
    Member storage member = members[_member];
    if (member.active == false) {
      return 0;
    }

    return getAvailable(block.number + 1, startT, amountPerMember, durationT, member.alreadyClaimedTokens);
  }

  /**
   * @notice Returns available token amount for a claim by a given member in the current block
   *         based on the current contract values
   * @param _member The member address to return available balance for
   * @return The available amount for a claim in the current block
   */
  function getAvailableTokensForMember(address _member) external view returns (uint256) {
    Member storage member = members[_member];
    if (member.active == false) {
      return 0;
    }

    return getAvailableTokens(member.alreadyClaimedTokens);
  }

  /**
   * @notice Returns available vote amount for a claim by a given member in the current block
   *         based on the current contract values
   * @param _member The member address to return available balance for
   * @return The available amount for a claim in the current block
   */
  function getAvailableVotesForMember(address _member) external view returns (uint256) {
    Member storage member = members[_member];
    if (member.active == false) {
      return 0;
    }

    return getAvailableVotes(member.alreadyClaimedVotes);
  }

  /**
   * @notice Returns available token amount for a claim based on the current contract values
   *         and an already claimed amount input
   * @dev Will return amountPerMember for non-members, so an external check is required for this case
   * @param _alreadyClaimed amount
   * @return The available amount for claim
   */
  function getAvailableTokens(uint256 _alreadyClaimed) public view returns (uint256) {
    return getAvailable(block.number, startT, amountPerMember, durationT, _alreadyClaimed);
  }

  /**
   * @notice Returns available vote amount for claim based on the current contract values
   *         and an already claimed amount input
   * @dev Will return amountPerMember for non-members, so an external check is required for this case
   * @param _alreadyClaimed amount
   * @return The available amount for claim
   */
  function getAvailableVotes(uint256 _alreadyClaimed) public view returns (uint256) {
    return getAvailable(block.number, startV, amountPerMember, durationV, _alreadyClaimed);
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
  function getAvailable(
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

  // @notice Owner delegates total unclaimed CVP balance
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
   * @notice An active member claims a distributed amount of votes
   * @dev Caches unclaimed balance per block number which could be used by voting contract
   * @param _to address to withdraw ERC20 tokens to
   */
  function claimVotes(address _to) external {
    Member memory member = members[_to];
    require(member.active == true, "PPVesting::claimVotes: User not active");

    uint256 votes = getAvailableVotes(member.alreadyClaimedVotes);

    require(votes > 0, "PPVesting::claimVotes: Nothing to claim");

    _claimVotes(_to, member, votes);
  }

  function _claimVotes(address _memberAddress, Member memory _member, uint256 _availableVotes) internal {
    uint96 newAlreadyClaimedVotes;

    if (_availableVotes > 0) {
      uint96 amount = safe96(_availableVotes, "PPVesting::_claimVotes: Amount overflow");

      // member.alreadyClaimed += amount
      newAlreadyClaimedVotes = add96(_member.alreadyClaimedVotes, amount, "PPVesting::claimVotes: NewAlreadyClaimed overflow");
      members[_memberAddress].alreadyClaimedVotes = newAlreadyClaimedVotes;
    } else {
      newAlreadyClaimedVotes = _member.alreadyClaimedVotes;
    }

    address delegate = getVoteUser(_memberAddress);

    // Step #2. Get the accrued votes value
    uint96 lastMemberAdjustedVotes = sub96(
      _member.alreadyClaimedVotes,
      _member.alreadyClaimedTokens,
      "PPVesting::_claimVotes: LastMemberAdjustedVotes overflow"
    );

    // Step #2. Get the adjusted value in relation to the member itself
    uint96 adjustedVotes = sub96(newAlreadyClaimedVotes, members[_memberAddress].alreadyClaimedTokens, "PPVesting::_claimVotes: AdjustedVotes underflow");

    // Step #3. Apply the adjusted value in relation to the delegate
    if (adjustedVotes > lastMemberAdjustedVotes) {
      uint96 diff = sub96(adjustedVotes, lastMemberAdjustedVotes, "PPVesting::_claimVotes: AdjustedVotes underflow");
      _addDelegatedVotesCache(delegate, diff);
    } else if (lastMemberAdjustedVotes > adjustedVotes) {
      uint96 diff = sub96(lastMemberAdjustedVotes, adjustedVotes, "PPVesting::_claimVotes: AdjustedVotes underflow");
      _subDelegatedVotesCache(delegate, diff);
    }
  }

  /**
   * @notice An active member claims a distributed amount of ERC20 tokens
   * @dev Caches unclaimed balance per block number which could be used by voting contract
   * @param _to address to withdraw ERC20 tokens to
   */
  function claimTokens(address _to) external {
    Member memory member = members[msg.sender];
    require(member.active == true, "PPVesting::claimTokens: User not active");

    uint256 bigAmount = getAvailableTokens(member.alreadyClaimedTokens);
    require(bigAmount > 0, "PPVesting::claimTokens: Nothing to claim");
    uint96 amount = safe96(bigAmount, "PPVesting::claimTokens: Amount overflow");

    // member.alreadyClaimed += amount
    uint96 newAlreadyClaimed = add96(member.alreadyClaimedTokens, amount, "PPVesting::claimTokens: NewAlreadyClaimed overflow");
    members[msg.sender].alreadyClaimedTokens = newAlreadyClaimed;

    uint256 votes = getAvailableVotes(member.alreadyClaimedVotes);

    _claimVotes(msg.sender, member, votes);

    emit Withdraw(msg.sender, _to, amount, newAlreadyClaimed);

    IERC20(token).transfer(_to, bigAmount);
  }

  /**
   * @notice Delegates an already claimed votes amount to the given address
   * @param _to address to delegate votes
   */
  function delegateVotes(address _to) external {
    Member memory member = members[msg.sender];
    require(_to != address(0), "PPVesting::delegateVotes: Can't delegate to 0 address");
    require(member.active == true, "PPVesting::delegateVotes: User not active");
    require(members[_to].active == true, "PPVesting::delegateVotes: _to user not active");

    address currentDelegate = getVoteUser(msg.sender);
    require(_to != currentDelegate, "PPVesting::delegateVotes: Already delegated to this address");

    voteDelegations[msg.sender] = _to;
    uint96 adjustedVotes = sub96(member.alreadyClaimedVotes, member.alreadyClaimedTokens, "PPVesting::claimVotes: AdjustedVotes underflow");

    _subDelegatedVotesCache(currentDelegate, adjustedVotes);
    _addDelegatedVotesCache(_to, adjustedVotes);
  }

  /**
   * @notice Transfers a vested rights for a member funds to another address
   * @dev A new member won't have any votes for a period between a start block and a current block
   * @param _to address to transfer a vested right to
   */
  function transfer(address _to) external {
    Member memory from = members[msg.sender];
    Member memory to = members[_to];

    uint96 alreadyClaimedTokens = from.alreadyClaimedTokens;
    uint96 alreadyClaimedVotes = from.alreadyClaimedVotes;

    require(from.active == true, "PPVesting::transfer: From member is inactive");
    require(to.active == false, "PPVesting::transfer: To address is already active");
    require(to.transferred == false, "PPVesting::transfer: To address has been already used");

    members[msg.sender] = Member({ active: false, transferred: true, alreadyClaimedVotes: 0, alreadyClaimedTokens: 0 });
    members[_to] = Member({ active: true, transferred: false, alreadyClaimedVotes: alreadyClaimedVotes, alreadyClaimedTokens: alreadyClaimedTokens });

    address currentDelegate = voteDelegations[msg.sender];

    uint32 startBlockNumber = safe32(startV, "PPVesting::transfer: Block number exceeds 32 bits");
    uint32 currentBlockNumber = safe32(block.number, "PPVesting::transfer: Block number exceeds 32 bits");

    checkpoints[_to][0] = Checkpoint(startBlockNumber, 0);
    if (currentDelegate == address(0)) {
      uint96 adjustedVotes = sub96(from.alreadyClaimedVotes, from.alreadyClaimedTokens, "PPVesting::claimVotes: AdjustedVotes underflow");
      _subDelegatedVotesCache(msg.sender, adjustedVotes);
      checkpoints[_to][1] = Checkpoint(currentBlockNumber, adjustedVotes);
      numCheckpoints[_to] += 2;
    } else {
      numCheckpoints[_to] += 1;
    }

    voteDelegations[_to] = voteDelegations[msg.sender];
    delete voteDelegations[msg.sender];

    Member memory toMember = members[_to];
    uint256 votes = getAvailableVotes(toMember.alreadyClaimedVotes);
    _claimVotes(_to, toMember, votes);

    emit Transfer(msg.sender, _to, startBlockNumber, alreadyClaimedVotes, alreadyClaimedTokens);
  }

  function _subDelegatedVotesCache(address _member, uint96 _subAmount) internal {
    uint32 dstRepNum = numCheckpoints[_member];
    uint96 dstRepOld = dstRepNum > 0 ? checkpoints[_member][dstRepNum - 1].votes : 0;
    uint96 dstRepNew = sub96(dstRepOld, _subAmount, "PPVesting::_cacheUnclaimed: Sub amount overflows");
    _writeCheckpoint(_member, dstRepNum, dstRepOld, dstRepNew);
  }

  function _addDelegatedVotesCache(address _member, uint96 _addAmount) internal {
    uint32 dstRepNum = numCheckpoints[_member];
    uint96 dstRepOld = dstRepNum > 0 ? checkpoints[_member][dstRepNum - 1].votes : 0;
    uint96 dstRepNew = add96(dstRepOld, _addAmount, "PPVesting::_cacheUnclaimed: Add amount overflows");
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
