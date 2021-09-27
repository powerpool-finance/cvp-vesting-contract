/* SPDX-License-Identifier: UNLICENSED */

pragma solidity 0.6.12;

import "./utils/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";

interface IERC20 {
  function totalSupply() external view returns (uint256);

  function transfer(address _to, uint256 _amount) external returns (bool);
}

interface CvpInterface {
  function getPriorVotes(address account, uint256 blockNumber) external view returns (uint96);
}

/**
 * @title PowerPool Vesting Contract
 * @author PowerPool
 */
contract PPTimedVesting is CvpInterface, Ownable {
  using SafeMath for uint256;
  using SafeCast for uint256;

  // @notice Emitted when a member is disabled either by the owner or the by the member itself
  event DisableMember(address indexed member, uint256 tokensRemainder);

  // @notice Emitted when a new active member list is added
  event AddMembers(address[] members);

  // @notice Emitted when the owner increases durationT correspondingly increasing the endT timestamp
  event IncreaseDurationT(uint256 prevDurationT, uint256 prevEndT, uint256 newDurationT, uint256 newEndT);

  // @notice Emitted when the owner increases personalDurationT correspondingly increasing the personalEndT timestamp
  event IncreasePersonalDurationT(
    address indexed member,
    uint256 prevEvaluatedDurationT,
    uint256 prevEvaluatedEndT,
    uint256 prevPersonalDurationT,
    uint256 newPersonalDurationT,
    uint256 newPersonalEndT
  );

  // @notice Emitted when a member delegates his votes to one of the delegates or to himself
  event DelegateVotes(address indexed from, address indexed to, address indexed previousDelegate, uint96 adjustedVotes);

  // @notice Emitted when a member transfer his permission
  event Transfer(
    address indexed from,
    address indexed to,
    uint96 alreadyClaimedVotes,
    uint96 alreadyClaimedTokens,
    address currentDelegate
  );

  /// @notice Emitted when a member claims available votes
  event ClaimVotes(
    address indexed member,
    address indexed delegate,
    uint96 lastAlreadyClaimedVotes,
    uint96 lastAlreadyClaimedTokens,
    uint96 newAlreadyClaimedVotes,
    uint96 newAlreadyClaimedTokens,
    uint96 lastMemberAdjustedVotes,
    uint96 adjustedVotes,
    uint96 diff
  );

  /// @notice Emitted when a member claims available tokens
  event ClaimTokens(
    address indexed member,
    address indexed to,
    uint96 amount,
    uint256 newAlreadyClaimed,
    uint256 votesAvailable
  );

  /// @notice A Emitted when a member unclaimed balance changes
  event UnclaimedBalanceChanged(address indexed member, uint256 previousUnclaimed, uint256 newUnclaimed);

  /// @notice A member statuses and unclaimed balance tracker
  struct Member {
    bool active;
    bool transferred;
    uint32 personalDurationT;
    uint96 alreadyClaimedVotes;
    uint96 alreadyClaimedTokens;
  }

  /// @notice A checkpoint for marking number of votes from a given block
  struct Checkpoint {
    uint32 fromBlock;
    uint96 votes;
  }

  /// @notice ERC20 token address
  address public immutable token;

  /// @notice Start timestamp for vote vesting calculations
  uint256 public immutable startV;

  /// @notice Duration of the vote vesting in seconds
  uint256 public immutable durationV;

  /// @notice End vote vesting timestamp
  uint256 public immutable endV;

  /// @notice Start timestamp for token vesting calculations
  uint256 public immutable startT;

  /// @notice Amount of ERC20 tokens to distribute during the vesting period
  uint96 public immutable amountPerMember;

  /// @notice Duration of the token vesting in seconds
  uint256 public durationT;

  /// @notice End token timestamp, used only from UI
  uint256 public endT;

  /// @notice Member details by their address
  mapping(address => Member) public members;

  /// @notice A record of vote checkpoints for each member, by index
  mapping(address => mapping(uint32 => Checkpoint)) public checkpoints;

  /// @notice The number of checkpoints for each member
  mapping(address => uint32) public numCheckpoints;

  /// @notice Vote delegations
  mapping(address => address) public voteDelegations;

  /**
   * @notice Constructs a new vesting contract
   * @dev It's up to a deployer to allocate the correct amount of ERC20 tokens on this contract
   * @param _tokenAddress The ERC20 token address to use with this vesting contract
   * @param _startV The timestamp when the vote vesting period starts
   * @param _durationV The duration in second the vote vesting period should last
   * @param _startT The timestamp when the token vesting period starts
   * @param _durationT The duration in seconds the token vesting period should last
   * @param _amountPerMember The number of tokens to distribute to each vesting contract member
   */
  constructor(
    address _tokenAddress,
    uint256 _startV,
    uint256 _durationV,
    uint256 _startT,
    uint256 _durationT,
    uint96 _amountPerMember
  ) public {
    require(_durationV > 1, "Vesting: Invalid durationV");
    require(_durationT > 1, "Vesting: Invalid durationT");
    require(_startV < _startT, "Vesting: Requires startV < startT");
    // require((_startV + _durationV) <= (_startT + _durationT), "Vesting: Requires endV <= endT");
    require((_startV.add(_durationV)) <= (_startT.add(_durationT)), "Vesting: Requires endV <= endT");
    require(_amountPerMember > 0, "Vesting: Invalid amount per member");
    require(IERC20(_tokenAddress).totalSupply() > 0, "Vesting: Missing supply of the token");

    token = _tokenAddress;

    startV = _startV;
    durationV = _durationV;
    endV = _startV + _durationV;

    startT = _startT;
    durationT = _durationT;
    endT = _startT + _durationT;

    amountPerMember = _amountPerMember;
  }

  /**
   * @notice Adds a list of vesting members
   * @param _listToPush The list of addresses to distribute tokens to
   */
  function addMembers(address[] calldata _listToPush) external onlyOwner {
    uint256 len = _listToPush.length;
    require(len > 0, "Vesting: Empty member list");

    for (uint256 i = 0; i < len; i++) {
      Member memory member = members[_listToPush[i]];
      require(member.active == false && member.transferred == false, "Vesting: Already active or transferred");
      members[_listToPush[i]].active = true;
    }

    emit AddMembers(_listToPush);
  }

  /**
   * @notice Checks whether the vote vesting period has started or not
   * @return true If the vote vesting period has started
   */
  function hasVoteVestingStarted() external view returns (bool) {
    return block.timestamp >= startV;
  }

  /**
   * @notice Checks whether the vote vesting period has ended or not
   * @return true If the vote vesting period has ended
   */
  function hasVoteVestingEnded() external view returns (bool) {
    return block.timestamp >= endV;
  }

  /**
   * @notice Checks whether the token vesting period has started or not
   * @return true If the token vesting period has started
   */
  function hasTokenVestingStarted() external view returns (bool) {
    return block.timestamp >= startT;
  }

  /**
   * @notice Checks whether the token vesting period has ended or not
   * @return true If the token vesting period has ended
   */
  function hasTokenVestingEnded() external view returns (bool) {
    return block.timestamp >= endT;
  }

  /**
   * @notice Returns the address a _voteHolder delegated their votes to
   * @param _voteHolder The address to fetch delegate for
   * @return address The delegate address
   */
  function getVoteUser(address _voteHolder) public view returns (address) {
    address currentDelegate = voteDelegations[_voteHolder];
    if (currentDelegate == address(0)) {
      return _voteHolder;
    }
    return currentDelegate;
  }

  /**
   * @notice Provides information about the last cached votes checkpoint with no other conditions
   * @dev Provides a latest cached votes value. For actual votes information use `getPriorVotes()` which introduce
   *      some additional logic constraints on top of this cached value.
   * @param _member The member address to get votes for
   */
  function getLastCachedVotes(address _member) external view returns (uint256) {
    uint32 dstRepNum = numCheckpoints[_member];
    return dstRepNum > 0 ? checkpoints[_member][dstRepNum - 1].votes : 0;
  }

  /**
   * @notice Provides information about a member already claimed votes
   * @dev Behaves like a CVP delegated balance, but with a member unclaimed balance
   * @dev Block number must be a finalized block or else this function will revert to prevent misinformation
   * @dev Returns 0 for non-member addresses, even for previously valid ones
   * @dev This method is a copy from CVP token with several modifications
   * @param account The address of the member to check
   * @param blockNumber The block number to get the vote balance at
   * @return The number of votes the account had as of the given block
   */
  function getPriorVotes(address account, uint256 blockNumber) external view override returns (uint96) {
    require(blockNumber < block.number, "Vesting::getPriorVotes: Not yet determined");

    uint32 nCheckpoints = numCheckpoints[account];

    Member memory member = members[account];

    // Transferred member
    if (member.transferred == true) {
      return 0;
    }

    // (No one can use vesting votes left on the contract after endT, even for votings created before endT)
    if (block.timestamp > getLoadedMemberEndT(member) || block.timestamp > endT) {
      return 0;
    }

    // (A member has not claimed any tokens yet) OR (The blockNumber is before the first checkpoint)
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

  /*** Available to Claim calculation ***/

  /**
   * @notice Returns available amount for a claim in the given timestamp
   *         by the given member based on the current contract values
   * @param _atTimestamp The timestamp to calculate available balance for
   * @param _member The member address to return available balance for
   * @return The available amount for a claim in the provided timestamp
   */
  function getAvailableTokensForMemberAt(uint256 _atTimestamp, address _member) external view returns (uint256) {
    Member memory member = members[_member];
    if (member.active == false) {
      return 0;
    }

    return
      getAvailable(
        _atTimestamp,
        startT,
        amountPerMember,
        getLoadedMemberDurationT(member),
        member.alreadyClaimedTokens
      );
  }

  /**
   * @notice Returns an evaluated endT value for the given member using
   *         the member's personalDurationT if it set or the global endT otherwise.
   * @param _member The member address to return endT for
   * @return The evaluated endT value
   */
  function getMemberEndT(address _member) external view returns (uint256) {
    return startT.add(getMemberDurationT(_member));
  }

  /**
   * @notice Returns an evaluated durationT value for the given member using
   *         the member's personalDurationT if it set or the global durationT otherwise.
   * @param _member The member address to return durationT for
   * @return The evaluated durationT value
   */
  function getMemberDurationT(address _member) public view returns (uint256) {
    return getLoadedMemberDurationT(members[_member]);
  }

  function getLoadedMemberEndT(Member memory _member) internal view returns (uint256) {
    return startT.add(getLoadedMemberDurationT(_member));
  }

  function getLoadedMemberDurationT(Member memory _member) internal view returns (uint256) {
    uint256 _personalDurationT = uint256(_member.personalDurationT);
    if (_personalDurationT == 0) {
      return durationT;
    }

    return _personalDurationT;
  }

  /**
   * @notice Returns available token amount for a claim by a given member in the current timestamp
   *         based on the current contract values
   * @param _member The member address to return available balance for
   * @return The available amount for a claim in the current block
   */
  function getAvailableTokensForMember(address _member) external view returns (uint256) {
    Member memory member = members[_member];
    if (member.active == false) {
      return 0;
    }

    return getAvailableTokens(member.alreadyClaimedTokens, getLoadedMemberDurationT(member));
  }

  /**
   * @notice Returns available vote amount for a claim by a given member at the moment
   *         based on the current contract values
   * @param _member The member address to return available balance for
   * @return The available amount for a claim at the moment
   */
  function getAvailableVotesForMember(address _member) external view returns (uint256) {
    Member storage member = members[_member];
    if (member.active == false) {
      return 0;
    }

    return getAvailableVotes({ _alreadyClaimed: member.alreadyClaimedVotes, _memberEndT: getLoadedMemberEndT(member) });
  }

  /**
   * @notice Returns available token amount for a claim based on the current contract values
   *         and an already claimed amount input
   * @dev Will return amountPerMember for non-members, so an external check is required for this case
   * @param _alreadyClaimed amount
   * @param _durationT in seconds
   * @return The available amount for claim
   */
  function getAvailableTokens(uint256 _alreadyClaimed, uint256 _durationT) public view returns (uint256) {
    return getAvailable(block.timestamp, startT, amountPerMember, _durationT, _alreadyClaimed);
  }

  /**
   * @notice Returns available vote amount for claim based on the current contract values
   *         and an already claimed amount input
   * @dev Will return amountPerMember for non-members, so an external check is required for this case.
   *      Will return 0 if global vesting is over.
   * @param _alreadyClaimed amount
   * @param _memberEndT either the global or a personal endT timestamp
   * @return The available amount for claim
   */
  function getAvailableVotes(uint256 _alreadyClaimed, uint256 _memberEndT) public view returns (uint256) {
    if (block.timestamp > _memberEndT || block.timestamp > endT) {
      return 0;
    }
    return getAvailable(block.timestamp, startV, amountPerMember, durationV, _alreadyClaimed);
  }

  /**
   * @notice Calculates available amount for a claim
   * @dev A pure function which doesn't reads anything from state
   * @param _now A timestamp to calculate the available amount
   * @param _start The vesting period start timestamp
   * @param _amountPerMember The amount of ERC20 tokens to be distributed to each member
   *         during this vesting period
   * @param _duration The vesting total duration in seconds
   * @param _alreadyClaimed The amount of tokens already claimed by a member
   * @return The available amount for a claim
   */
  function getAvailable(
    uint256 _now,
    uint256 _start,
    uint256 _amountPerMember,
    uint256 _duration,
    uint256 _alreadyClaimed
  ) public pure returns (uint256) {
    if (_now <= _start) {
      return 0;
    }

    // uint256 vestingEndsAt = _start + _duration;
    uint256 vestingEndsAt = _start.add(_duration);
    uint256 to = _now > vestingEndsAt ? vestingEndsAt : _now;

    // uint256 accrued = (to - _start) * _amountPerMember / _duration;
    uint256 accrued = ((to - _start).mul(_amountPerMember).div(_duration));

    // return accrued - _alreadyClaimed;
    return accrued.sub(_alreadyClaimed);
  }

  /*** Owner Methods ***/

  /**
   * @notice Increase global duration of vesting.
   *         Owner must find all personal durations lower than global duration and increase before call this function.
   * @param _newDurationT New global vesting duration
   */
  function increaseDurationT(uint256 _newDurationT) external onlyOwner {
    require(block.timestamp < endT, "Vesting::increaseDurationT: Vesting is over");
    require(_newDurationT > durationT, "Vesting::increaseDurationT: Too small duration");
    require((_newDurationT - durationT) <= 180 days, "Vesting::increaseDurationT: Too big duration");

    uint256 prevDurationT = durationT;
    uint256 prevEndT = endT;

    durationT = _newDurationT;
    uint256 newEndT = startT.add(_newDurationT);
    endT = newEndT;

    emit IncreaseDurationT(prevDurationT, prevEndT, _newDurationT, newEndT);
  }

  /**
   * @notice Increase personal duration of vesting.
   *         Personal vesting duration must be always greater than global duration.
   * @param _members Members list for increase duration
   * @param _newPersonalDurationsT New personal vesting duration
   */
  function increasePersonalDurationsT(address[] calldata _members, uint256[] calldata _newPersonalDurationsT)
    external
    onlyOwner
  {
    uint256 len = _members.length;
    require(_newPersonalDurationsT.length == len, "LENGTH_MISMATCH");

    for (uint256 i = 0; i < len; i++) {
      _increasePersonalDurationT(_members[i], _newPersonalDurationsT[i]);
    }
  }

  function _increasePersonalDurationT(address _member, uint256 _newPersonalDurationT) internal {
    Member memory member = members[_member];
    uint256 prevPersonalDurationT = getLoadedMemberDurationT(member);

    require(_newPersonalDurationT > prevPersonalDurationT, "Vesting::increasePersonalDurationT: Too small duration");
    require(
      (_newPersonalDurationT - prevPersonalDurationT) <= 180 days,
      "Vesting::increasePersonalDurationT: Too big duration"
    );
    require(_newPersonalDurationT >= durationT, "Vesting::increasePersonalDurationT: Less than durationT");

    uint256 prevPersonalEndT = startT.add(prevPersonalDurationT);

    members[_member].personalDurationT = _newPersonalDurationT.toUint32();

    uint256 newPersonalEndT = startT.add(_newPersonalDurationT);
    emit IncreasePersonalDurationT(
      _member,
      prevPersonalDurationT,
      prevPersonalEndT,
      member.personalDurationT,
      _newPersonalDurationT,
      newPersonalEndT
    );
  }

  function disableMember(address _member) external onlyOwner {
    _disableMember(_member);
  }

  function _disableMember(address _member) internal {
    Member memory from = members[_member];

    require(from.active == true, "Vesting::_disableMember: The member is inactive");

    members[_member].active = false;

    address currentDelegate = voteDelegations[_member];

    uint32 nCheckpoints = numCheckpoints[_member];
    if (nCheckpoints != 0 && currentDelegate != address(0) && currentDelegate != _member) {
      uint96 adjustedVotes =
        sub96(from.alreadyClaimedVotes, from.alreadyClaimedTokens, "Vesting::_disableMember: AdjustedVotes underflow");

      if (adjustedVotes > 0) {
        _subDelegatedVotesCache(currentDelegate, adjustedVotes);
      }
    }

    delete voteDelegations[_member];

    uint256 tokensRemainder =
      sub96(amountPerMember, from.alreadyClaimedTokens, "Vesting::_disableMember: BalanceRemainder overflow");
    require(IERC20(token).transfer(address(1), uint256(tokensRemainder)), "ERC20::transfer: failed");

    emit DisableMember(_member, tokensRemainder);
  }

  /*** Member Methods ***/

  /**
   * @notice An active member can renounce his membership once.
   * @dev This action is irreversible. The disabled member can't be enabled again.
   *      Disables all the member's vote checkpoints. Transfers all the member's unclaimed tokens to the address(1).
   */
  function renounceMembership() external {
    _disableMember(msg.sender);
  }

  /**
   * @notice An active member claims a distributed amount of votes
   * @dev Caches unclaimed balance per block number which could be used by voting contract
   * @param _to address to claim votes to
   */
  function claimVotes(address _to) external {
    Member memory member = members[_to];
    require(member.active == true, "Vesting::claimVotes: User not active");

    uint256 endT_ = getLoadedMemberEndT(member);
    uint256 votes = getAvailableVotes({ _alreadyClaimed: member.alreadyClaimedVotes, _memberEndT: endT_ });

    require(block.timestamp <= endT_, "Vesting::claimVotes: Vote vesting has ended");
    require(votes > 0, "Vesting::claimVotes: Nothing to claim");

    _claimVotes(_to, member, votes);
  }

  function _claimVotes(
    address _memberAddress,
    Member memory _member,
    uint256 _availableVotes
  ) internal {
    uint96 newAlreadyClaimedVotes;

    if (_availableVotes > 0) {
      uint96 amount = safe96(_availableVotes, "Vesting::_claimVotes: Amount overflow");

      // member.alreadyClaimed += amount
      newAlreadyClaimedVotes = add96(
        _member.alreadyClaimedVotes,
        amount,
        "Vesting::claimVotes: newAlreadyClaimed overflow"
      );
      members[_memberAddress].alreadyClaimedVotes = newAlreadyClaimedVotes;
    } else {
      newAlreadyClaimedVotes = _member.alreadyClaimedVotes;
    }

    // Step #1. Get the accrued votes value
    // lastMemberAdjustedVotes = claimedVotesBeforeTx - claimedTokensBeforeTx
    uint96 lastMemberAdjustedVotes =
      sub96(
        _member.alreadyClaimedVotes,
        _member.alreadyClaimedTokens,
        "Vesting::_claimVotes: lastMemberAdjustedVotes overflow"
      );

    // Step #2. Get the adjusted value in relation to the member itself.
    // `adjustedVotes = votesAfterTx - claimedTokensBeforeTheCalculation`
    // `claimedTokensBeforeTheCalculation` could be updated earlier in claimVotes() method in the same tx
    uint96 adjustedVotes =
      sub96(
        newAlreadyClaimedVotes,
        members[_memberAddress].alreadyClaimedTokens,
        "Vesting::_claimVotes: adjustedVotes underflow"
      );

    address delegate = getVoteUser(_memberAddress);
    uint96 diff;

    // Step #3. Apply the adjusted value in relation to the delegate
    if (adjustedVotes > lastMemberAdjustedVotes) {
      diff = sub96(adjustedVotes, lastMemberAdjustedVotes, "Vesting::_claimVotes: Positive diff underflow");
      _addDelegatedVotesCache(delegate, diff);
    } else if (lastMemberAdjustedVotes > adjustedVotes) {
      diff = sub96(lastMemberAdjustedVotes, adjustedVotes, "Vesting::_claimVotes: Negative diff underflow");
      _subDelegatedVotesCache(delegate, diff);
    }

    emit ClaimVotes(
      _memberAddress,
      delegate,
      _member.alreadyClaimedVotes,
      _member.alreadyClaimedTokens,
      newAlreadyClaimedVotes,
      members[_memberAddress].alreadyClaimedTokens,
      lastMemberAdjustedVotes,
      adjustedVotes,
      diff
    );
  }

  /**
   * @notice An active member claims a distributed amount of ERC20 tokens
   * @param _to address to claim ERC20 tokens to
   */
  function claimTokens(address _to) external {
    Member memory member = members[msg.sender];
    require(member.active == true, "Vesting::claimTokens: User not active");

    uint256 durationT_ = getLoadedMemberDurationT(member);
    uint256 bigAmount = getAvailableTokens(member.alreadyClaimedTokens, durationT_);
    require(bigAmount > 0, "Vesting::claimTokens: Nothing to claim");
    uint96 amount = safe96(bigAmount, "Vesting::claimTokens: Amount overflow");

    // member.alreadyClaimed += amount
    uint96 newAlreadyClaimed =
      add96(member.alreadyClaimedTokens, amount, "Vesting::claimTokens: NewAlreadyClaimed overflow");
    members[msg.sender].alreadyClaimedTokens = newAlreadyClaimed;

    uint256 endT_ = startT.add(durationT_);
    uint256 votes = getAvailableVotes({ _alreadyClaimed: member.alreadyClaimedVotes, _memberEndT: endT_ });

    if (block.timestamp <= endT) {
      _claimVotes(msg.sender, member, votes);
    }

    emit ClaimTokens(msg.sender, _to, amount, newAlreadyClaimed, votes);

    require(IERC20(token).transfer(_to, bigAmount), "ERC20::transfer: failed");
  }

  /**
   * @notice Delegates an already claimed votes amount to the given address
   * @param _to address to delegate votes
   */
  function delegateVotes(address _to) external {
    Member memory member = members[msg.sender];
    require(_to != address(0), "Vesting::delegateVotes: Can't delegate to 0 address");
    require(member.active == true, "Vesting::delegateVotes: msg.sender not active");

    address currentDelegate = getVoteUser(msg.sender);
    require(_to != currentDelegate, "Vesting::delegateVotes: Already delegated to this address");

    voteDelegations[msg.sender] = _to;
    uint96 adjustedVotes =
      sub96(member.alreadyClaimedVotes, member.alreadyClaimedTokens, "Vesting::claimVotes: AdjustedVotes underflow");

    _subDelegatedVotesCache(currentDelegate, adjustedVotes);
    _addDelegatedVotesCache(_to, adjustedVotes);

    emit DelegateVotes(msg.sender, _to, currentDelegate, adjustedVotes);
  }

  /**
   * @notice Transfers a vested rights for a member funds to another address
   * @dev A new member won't have any votes for a period between a start timestamp and a current timestamp
   * @param _to address to transfer a vested right to
   */
  function transfer(address _to) external {
    Member memory from = members[msg.sender];
    Member memory to = members[_to];

    uint96 alreadyClaimedTokens = from.alreadyClaimedTokens;
    uint96 alreadyClaimedVotes = from.alreadyClaimedVotes;
    uint32 personalDurationT = from.personalDurationT;

    require(from.active == true, "Vesting::transfer: From member is inactive");
    require(to.active == false, "Vesting::transfer: To address is already active");
    require(to.transferred == false, "Vesting::transfer: To address has been already used");
    require(numCheckpoints[_to] == 0, "Vesting::transfer: To address already had a checkpoint");

    members[msg.sender] = Member({
      active: false,
      transferred: true,
      alreadyClaimedVotes: 0,
      alreadyClaimedTokens: 0,
      personalDurationT: 0
    });
    members[_to] = Member({
      active: true,
      transferred: false,
      alreadyClaimedVotes: alreadyClaimedVotes,
      alreadyClaimedTokens: alreadyClaimedTokens,
      personalDurationT: personalDurationT
    });

    address currentDelegate = voteDelegations[msg.sender];

    uint32 currentBlockNumber = safe32(block.number, "Vesting::transfer: Block number exceeds 32 bits");

    checkpoints[_to][0] = Checkpoint(uint32(0), 0);
    if (currentDelegate == address(0)) {
      uint96 adjustedVotes =
        sub96(from.alreadyClaimedVotes, from.alreadyClaimedTokens, "Vesting::claimVotes: AdjustedVotes underflow");
      _subDelegatedVotesCache(msg.sender, adjustedVotes);
      checkpoints[_to][1] = Checkpoint(currentBlockNumber, adjustedVotes);
      numCheckpoints[_to] = 2;
    } else {
      numCheckpoints[_to] = 1;
    }

    voteDelegations[_to] = voteDelegations[msg.sender];
    delete voteDelegations[msg.sender];

    Member memory toMember = members[_to];

    emit Transfer(msg.sender, _to, alreadyClaimedVotes, alreadyClaimedTokens, currentDelegate);

    uint256 votes =
      getAvailableVotes({ _alreadyClaimed: toMember.alreadyClaimedVotes, _memberEndT: getLoadedMemberEndT(toMember) });

    _claimVotes(_to, toMember, votes);
  }

  function _subDelegatedVotesCache(address _member, uint96 _subAmount) internal {
    uint32 dstRepNum = numCheckpoints[_member];
    uint96 dstRepOld = dstRepNum > 0 ? checkpoints[_member][dstRepNum - 1].votes : 0;
    uint96 dstRepNew = sub96(dstRepOld, _subAmount, "Vesting::_cacheUnclaimed: Sub amount overflows");
    _writeCheckpoint(_member, dstRepNum, dstRepOld, dstRepNew);
  }

  function _addDelegatedVotesCache(address _member, uint96 _addAmount) internal {
    uint32 dstRepNum = numCheckpoints[_member];
    uint96 dstRepOld = dstRepNum > 0 ? checkpoints[_member][dstRepNum - 1].votes : 0;
    uint96 dstRepNew = add96(dstRepOld, _addAmount, "Vesting::_cacheUnclaimed: Add amount overflows");
    _writeCheckpoint(_member, dstRepNum, dstRepOld, dstRepNew);
  }

  /// @dev A copy from CVP token, only the event name changed
  function _writeCheckpoint(
    address delegatee,
    uint32 nCheckpoints,
    uint96 oldVotes,
    uint96 newVotes
  ) internal {
    uint32 blockNumber = safe32(block.number, "Vesting::_writeCheckpoint: Block number exceeds 32 bits");

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
