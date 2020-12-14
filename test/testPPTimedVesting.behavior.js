const { time } = require('@openzeppelin/test-helpers');
const { solidity } = require('ethereum-waffle');
const { evmMine, getLatestBlockTimestamp, getLatestBlockNumber, evmSetNextBlockTimestamp, ether } = require('./helpers');

const chai = require('chai');
const PPTimedVesting = artifacts.require('PPTimedVesting');
const ERC20 = artifacts.require('ERC20PresetMinterPauser');

chai.use(solidity);
const { expect } = chai;

ERC20.numberFormat = 'String';
PPTimedVesting.numberFormat = 'String';

// NOTICE: all durations are represented in seconds
contract('PPTimedVesting Behaviour Tests', function ([, member1, member2, member3, alice, vault]) {
  let vesting;
  let startT;
  let durationT;
  let startV;
  let durationV;
  let erc20;

  beforeEach(async function () {
    erc20 = await ERC20.new('Concentrated Voting Power', 'CVP');
    await erc20.mint(vault, ether(150000000000));
  });

  describe('claimTokens', () => {
    it('should allow a gradual token/votes claims each second', async function () {
      // Setup...

      const amountPerMember = ether('2500');
      const currentTimestamp = (await time.latest()).toNumber();

      startV = parseInt(currentTimestamp) + 5;
      durationV = 10;

      startT = parseInt(currentTimestamp) + 10;
      durationT = 5;

      vesting = await PPTimedVesting.new(
        erc20.address,
        startV,
        durationV,
        startT,
        durationT,
        [member1, member2, member3],
        amountPerMember,
      );

      await erc20.transfer(vesting.address, ether(30000), { from: vault });
      // Step #0
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');

      // Step #1
      await evmMine(startV);
      expect(await vesting.hasVoteVestingStarted()).to.be.true;

      let res = await vesting.claimVotes(member1);
      const block1 = res.receipt.blockNumber;

      // Step #2
      res = await vesting.claimVotes(member1);
      const block2 = res.receipt.blockNumber;
      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal(ether(250));

      // Step #3
      res = await vesting.claimVotes(member1);
      const block3 = res.receipt.blockNumber;
      expect(await vesting.getPriorVotes(member1, block2)).to.be.equal(ether(500));

      // Step #4
      res = await vesting.claimVotes(member1);
      const blockFour = res.receipt.blockNumber;
      expect(await vesting.getPriorVotes(member1, block3)).to.be.equal(ether(750));

      // Step #5
      res = await vesting.claimVotes(member1);
      const block5 = res.receipt.blockNumber;
      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('5');
      expect(await vesting.getPriorVotes(member1, blockFour)).to.be.equal(ether(1000));

      // Step #6
      res = await vesting.claimTokens(alice, { from: member1 });
      const block6 = res.receipt.blockNumber;
      expect(await vesting.getPriorVotes(member1, block5)).to.be.equal(ether(1250));
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('6');
      const checkpoint = await vesting.checkpoints(member1, 0);
      expect(checkpoint.votes).to.be.equal(ether(250));

      // Step #7
      res = await vesting.claimTokens(alice, { from: member1 });
      const block7 = res.receipt.blockNumber;
      expect(await vesting.getPriorVotes(member1, block6)).to.be.equal(ether(1000));

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1000));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));

      // Step #8
      res = await vesting.claimTokens(alice, { from: member1 });
      const block8 = res.receipt.blockNumber;
      expect(await vesting.getPriorVotes(member1, block7)).to.be.equal(ether(750));

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));

      // Step #9
      res = await vesting.claimTokens(alice, { from: member1 });
      const block9 = res.receipt.blockNumber;
      expect(await vesting.getPriorVotes(member1, block8)).to.be.equal(ether(500));

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2000));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));

      // Step #10
      res = await vesting.claimTokens(alice, { from: member1 });
      const block10 = res.receipt.blockNumber;
      expect(await vesting.getPriorVotes(member1, block9)).to.be.equal(ether(250));

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));

      // Step #11
      await time.advanceBlock();
      expect(await vesting.getPriorVotes(member1, block10)).to.be.equal(ether(0));
      await expect(vesting.claimTokens(alice, { from: member1 })).to.revertedWith(
        'Vesting::claimTokens: Nothing to claim',
      );
    });
  });

  // Time offsets
  // deployment   -30    -0.1y
  // startV       0      0y
  // startT       182.5  0.5 y
  // endV         365    1y
  // envT         730    2y

  const amountPerMember = ether(5 * 1000 * 1000);
  durationV = 3600 * 24 * 365;
  durationT = 3600 * 24 * 547.5;

  function days(number) {
    return 3600 * 24 * number;
  }

  function months(number) {
    return 3600 * 24 * number * 365 / 12;
  }

  const DAYS_IN_YEAR = BigInt(365e9);
  const DAY_SECONDS = BigInt(3600 * 24);
  const PER_MEMBER = BigInt(amountPerMember);
  const DURATION_V = BigInt(durationV.toString());
  const DURATION_T = BigInt(durationT.toString());

  function buildMB(duration) {
    return function (months) {
      return PER_MEMBER * DAYS_IN_YEAR * BigInt(months) * DAY_SECONDS / BigInt(duration) / BigInt(12e9);
    }
  }
  function buildMS(duration) {
    const vmb = buildMB(duration);
    return function(months) {
      return vmb(months).toString();
    }
  }

  const VMB = buildMB(DURATION_V);
  const TMB = buildMB(DURATION_T);
  const VMS = buildMS(DURATION_V)
  const TMS = buildMS(DURATION_T)

  it('should allow launching vesting after startV', async function () {
    // Setup...
    const currentTimestamp = (await time.latest()).toNumber();
    startV = parseInt(currentTimestamp) - months(2);
    startT = parseInt(currentTimestamp) + months(4);

    vesting = await PPTimedVesting.new(
      erc20.address,
      startV,
      durationV,
      startT,
      durationT,
      [member1, member2, member3],
      amountPerMember,
    );

    await erc20.transfer(vesting.address, ether(5 * 1000 * 1000), { from: vault });

    // Step #1. Member #1 claimV #1

    await vesting.claimVotes(member1);

    // Step #2. Member #1 claimV #2
    await evmSetNextBlockTimestamp(startV + months(3));
    await vesting.claimVotes(member1);
    expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(VMS(3));

    // Step #3. Member #1 claimT #1 claimV #3
    await evmSetNextBlockTimestamp(startV + months(22));
    await vesting.claimTokens(member1, { from: member1 });
    expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(amountPerMember);
    expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(TMS(16));

    // Step #4. Member #1 claimT #2 claimV #4
    await evmSetNextBlockTimestamp(startV + months(24));
    await vesting.claimTokens(member1, { from: member1 });
    expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(amountPerMember);
    expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(amountPerMember);
  });

  describe('increaseDurationT', () => {
    it('should allow claiming after increaseDurationT', async function () {
      // Setup...
      const currentTimestamp = (await time.latest()).toNumber();
      startV = parseInt(currentTimestamp) + months(1);
      startT = parseInt(currentTimestamp) + months(7);

      vesting = await PPTimedVesting.new(
        erc20.address,
        startV,
        durationV,
        startT,
        durationT,
        [member1, member2, member3],
        amountPerMember,
      );

      await erc20.transfer(vesting.address, ether(5 * 1000 * 1000), { from: vault });

      // Step #1. Member #1 claimT #1
      await evmSetNextBlockTimestamp(startV + months(7));
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      await vesting.claimTokens(member1, { from: member1 });
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(7));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal('0');
      expect(await erc20.balanceOf(member1)).to.be.equal(TMS(1));

      // Step #2. IncreaseDurationT
      await expect(vesting.increaseDurationT(months(17))).to.be.revertedWith('Vesting::increaseDurationT: Too small duration');
      await vesting.increaseDurationT(months(20));

      const TMS2 = buildMS(months(20));

      // Step #3. Member #1 claimV #2
      await vesting.claimVotes(member1, { from: member1 });

      await expect(vesting.claimTokens(member1, { from: member1 })).to.be.revertedWith('SafeMath: subtraction overflow');

      // Step #4. Member #1 claimT #2 claimV #2
      await evmSetNextBlockTimestamp(startV + months(8));
      await vesting.claimTokens(member1, { from: member1 });
      expect(await erc20.balanceOf(member1)).to.be.equal(TMS2(2));

      // Step #5. Member #1 claimT #3 claimV #3
      await evmSetNextBlockTimestamp(startV + months(24));
      await vesting.claimTokens(member1, { from: member1 });
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(24));
      expect(await erc20.balanceOf(member1)).to.be.equal(TMS2(18));

      // Step #6. Member #1 claimT #4 claimV #4
      await evmSetNextBlockTimestamp(startV + months(26));
      await vesting.claimTokens(member1, { from: member1 });
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(26));
      expect(await erc20.balanceOf(member1)).to.be.equal(TMS2(20));
      expect(await erc20.balanceOf(member1)).to.be.equal(amountPerMember);
    });

    it('should allow correctly handle delegations', async function () {
      // Setup...
      const currentTimestamp = (await time.latest()).toNumber();
      startV = parseInt(currentTimestamp) + months(1);
      startT = parseInt(currentTimestamp) + months(7);

      vesting = await PPTimedVesting.new(
        erc20.address,
        startV,
        durationV,
        startT,
        durationT,
        [member1, member2, member3],
        amountPerMember,
      );

      await erc20.transfer(vesting.address, ether(5 * 1000 * 1000), { from: vault });

      // Step #1. Member #1 claimT #1
      await evmSetNextBlockTimestamp(startV + months(7));
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      await vesting.claimTokens(member1, { from: member1 });
      const block1 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(7));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal('0');
      expect(await erc20.balanceOf(member1)).to.be.equal(TMS(1));

      // Step #2. Delegate 1 -> 2
      await vesting.delegateVotes(member2, { from: member1 });
      const block2 = await getLatestBlockNumber();

      // Step #3. IncreaseDurationT
      await vesting.increaseDurationT(months(20));
      const TMS2 = buildMS(months(20));
      const TMB2 = buildMB(months(20));

      // Step #4. Member #1 claimV #2
      await evmSetNextBlockTimestamp(startV + months(8));
      await vesting.delegateVotes(member1, { from: member1 });
      const block3 = await getLatestBlockNumber();

      // Step #4. Member #1 claimT #2 claimV #2
      await evmSetNextBlockTimestamp(startV + months(9));
      await vesting.claimTokens(member1, { from: member1 });
      expect(await erc20.balanceOf(member1)).to.be.equal(TMS2(3));
      const block4 = await getLatestBlockNumber();

      // Step #5. Member #1 claimT #3 claimV #3
      await evmSetNextBlockTimestamp(startV + months(24));
      await vesting.claimTokens(member1, { from: member1 });
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(24));
      expect(await erc20.balanceOf(member1)).to.be.equal(TMS2(18));

      // Step #6. Member #1 claimT #4 claimV #4
      await evmSetNextBlockTimestamp(startV + months(26));
      await vesting.claimTokens(member1, { from: member1 });
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(26));
      expect(await erc20.balanceOf(member1)).to.be.equal(TMS2(20));
      expect(await erc20.balanceOf(member1)).to.be.equal(amountPerMember);

      // Vote cache checks
      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal((VMB(7) - TMB(1)).toString());
      expect(await vesting.getPriorVotes(member1, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block3)).to.be.equal((VMB(7) - TMB(1)).toString());
      expect(await vesting.getPriorVotes(member1, block4)).to.be.equal((VMB(9) - TMB2(3)).toString());

      expect(await vesting.getPriorVotes(member2, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block2)).to.be.equal((VMB(7) - TMB(1)).toString());
      expect(await vesting.getPriorVotes(member2, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block4)).to.be.equal('0');
    });
  });

  describe('delegation', () => {
    it('should allow delegation', async function () {
      // Setup...
      const currentTimestamp = (await time.latest()).toNumber();
      startV = parseInt(currentTimestamp) + months(1);

      startT = parseInt(currentTimestamp) + months(7);

      vesting = await PPTimedVesting.new(
        erc20.address,
        startV,
        durationV,
        startT,
        durationT,
        [member1, member2, member3],
        amountPerMember,
      );

      await erc20.transfer(vesting.address, ether(3 * 5 * 1000 * 1000), { from: vault });

      // Step #1. Member #1 claimV #1
      await evmSetNextBlockTimestamp(startV + days(1));
      expect(await vesting.hasVoteVestingStarted()).to.be.false;
      await evmMine();
      expect(await vesting.hasVoteVestingStarted()).to.be.true;

      await evmSetNextBlockTimestamp(startV + months(1));
      await vesting.claimVotes(member1);
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(1));
      const block1 = await getLatestBlockNumber();

      // Step #2. Member #1 claimV #2
      await evmSetNextBlockTimestamp(startV + months(2));
      await vesting.claimVotes(member1);
      const block2 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(2));
      expect(await vesting.getPriorVotes(member1, block1 - 2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block1 - 1)).to.be.equal('0');
      // ~821_917/30 days rate
      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal(VMS(1));

      // Step #3. Member #1 claimV #3
      await evmSetNextBlockTimestamp(startV + months(3));
      await vesting.claimVotes(member1);
      const block3 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(3));
      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal(VMS(1));
      expect(await vesting.getPriorVotes(member1, block2)).to.be.equal(VMS(2));

      // Step #4. Delegate 1 -> 2
      await evmSetNextBlockTimestamp(startV + months(4));
      await vesting.delegateVotes(member2, { from: member1 });
      const block4 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(4));
      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal(VMS(1));
      expect(await vesting.getPriorVotes(member1, block2)).to.be.equal(VMS(2));
      expect(await vesting.getPriorVotes(member1, block3)).to.be.equal(VMS(3));

      // Step #5. Member #1 claimV #4
      await evmSetNextBlockTimestamp(startV + months(5));
      await vesting.claimVotes(member1);
      const block5 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(5));

      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal(VMS(1));
      expect(await vesting.getPriorVotes(member1, block2)).to.be.equal(VMS(2));
      expect(await vesting.getPriorVotes(member1, block3)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member1, block4)).to.be.equal('0');

      expect(await vesting.getPriorVotes(member2, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block4)).to.be.equal(VMS(3));

      // Step #6. Member #3 claimV #1
      await evmSetNextBlockTimestamp(startV + months(6));
      await vesting.claimVotes(member3);
      const block6 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(6));

      // Step #7. Delegate 3 -> 2
      await evmSetNextBlockTimestamp(startV + months(7));
      await vesting.delegateVotes(member2, { from: member3 });
      const block7 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(7));

      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal(VMS(1));
      expect(await vesting.getPriorVotes(member1, block2)).to.be.equal(VMS(2));
      expect(await vesting.getPriorVotes(member1, block3)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member1, block4)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block5)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block6)).to.be.equal('0');

      expect(await vesting.getPriorVotes(member2, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block4)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member2, block5)).to.be.equal(VMS(5));
      expect(await vesting.getPriorVotes(member2, block6)).to.be.equal(VMS(5));

      expect(await vesting.getPriorVotes(member3, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block4)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block5)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block6)).to.be.equal(VMS(6));

      // Step #8. Member #2 claimT #1
      await evmSetNextBlockTimestamp(startV + months(8));
      await vesting.claimTokens(member2, { from: member2 });
      const block8 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(8));

      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal(VMS(1));
      expect(await vesting.getPriorVotes(member1, block2)).to.be.equal(VMS(2));
      expect(await vesting.getPriorVotes(member1, block3)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member1, block4)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block5)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block6)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block7)).to.be.equal('0');

      expect(await vesting.getPriorVotes(member2, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block4)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member2, block5)).to.be.equal(VMS(5));
      expect(await vesting.getPriorVotes(member2, block6)).to.be.equal(VMS(5));
      expect(await vesting.getPriorVotes(member2, block7)).to.be.equal((VMB(5) + VMB(6)).toString());

      expect(await vesting.getPriorVotes(member3, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block4)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block5)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block6)).to.be.equal(VMS(6));
      expect(await vesting.getPriorVotes(member3, block7)).to.be.equal('0');

      // Step #9. Member #1 claimT #5
      await evmSetNextBlockTimestamp(startV + months(9));
      await vesting.claimTokens(member1, { from: member1 });
      const block9 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(9));

      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal(VMS(1));
      expect(await vesting.getPriorVotes(member1, block2)).to.be.equal(VMS(2));
      expect(await vesting.getPriorVotes(member1, block3)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member1, block4)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block5)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block6)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block7)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block8)).to.be.equal('0');

      expect(await vesting.getPriorVotes(member2, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block4)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member2, block5)).to.be.equal(VMS(5));
      expect(await vesting.getPriorVotes(member2, block6)).to.be.equal(VMS(5));
      expect(await vesting.getPriorVotes(member2, block7)).to.be.equal((VMB(5) + VMB(6)).toString());
      expect(await vesting.getPriorVotes(member2, block8)).to.be.equal((VMB(5) + VMB(8) + VMB(6) - TMB(2)).toString());

      expect(await vesting.getPriorVotes(member3, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block4)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block5)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block6)).to.be.equal(VMS(6));
      expect(await vesting.getPriorVotes(member3, block7)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block8)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block8)).to.be.equal('0');

      // Step #10. Delegate 2 -> 1
      await evmSetNextBlockTimestamp(startV + months(11));
      await vesting.delegateVotes(member1, { from: member2 });
      const block10 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(11));
      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal(VMS(1));
      expect(await vesting.getPriorVotes(member1, block2)).to.be.equal(VMS(2));
      expect(await vesting.getPriorVotes(member1, block3)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member1, block4)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block5)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block6)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block7)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block8)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block9)).to.be.equal('0');

      expect(await vesting.getPriorVotes(member2, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block4)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member2, block5)).to.be.equal(VMS(5));
      expect(await vesting.getPriorVotes(member2, block6)).to.be.equal(VMS(5));
      expect(await vesting.getPriorVotes(member2, block7)).to.be.equal((VMB(5) + VMB(6)).toString());
      expect(await vesting.getPriorVotes(member2, block8)).to.be.equal((VMB(5) + VMB(8) + VMB(6) - TMB(2)).toString());
      expect(await vesting.getPriorVotes(member2, block9)).to.be.equal((VMB(9) + VMB(8) + VMB(6) - TMB(2) - TMB(3)).toString());

      expect(await vesting.getPriorVotes(member3, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block4)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block5)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block6)).to.be.equal(VMS(6));
      expect(await vesting.getPriorVotes(member3, block7)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block8)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block8)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block9)).to.be.equal('0');

      expect(await erc20.balanceOf(member1)).to.be.equal(TMS(3));
      expect(await erc20.balanceOf(member2)).to.be.equal(TMS(2));
      expect(await erc20.balanceOf(member3)).to.be.equal(TMS(0));

      expect(await vesting.voteDelegations(member1)).to.be.equal(member2);
      expect(await vesting.voteDelegations(member2)).to.be.equal(member1);
      expect(await vesting.voteDelegations(member3)).to.be.equal(member2);

      // Step #11. Member #1 claimV #6 claimT #2
      await evmSetNextBlockTimestamp(startV + months(13));
      await vesting.claimTokens(member1, { from: member1 });
      const block11 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(13));

      // Step #12. Member #2 claimV #2
      await evmSetNextBlockTimestamp(startV + months(14));
      await vesting.claimVotes(member2, { from: member2 });
      const block12 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(14));

      // Step #13. Member #1 claimV #7 claimT #3
      await evmSetNextBlockTimestamp(startV + months(24));
      await vesting.claimTokens(member1, { from: member1 });
      expect(await vesting.hasVoteVestingEnded()).to.be.equal(true);
      expect(await vesting.hasTokenVestingEnded()).to.be.equal(true);
      const block13 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(24));

      // >>> endT checks

      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal(VMS(1));
      expect(await vesting.getPriorVotes(member1, block2)).to.be.equal(VMS(2));
      expect(await vesting.getPriorVotes(member1, block3)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member1, block4)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block5)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block6)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block7)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block8)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block9)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block10)).to.be.equal((VMB(8) - TMB(2)).toString());
      expect(await vesting.getPriorVotes(member1, block11)).to.be.equal((VMB(8) - TMB(2)).toString());
      expect(await vesting.getPriorVotes(member1, block12)).to.be.equal((VMB(12) - TMB(2)).toString());

      expect(await vesting.getPriorVotes(member2, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block4)).to.be.equal(VMS(3));
      expect(await vesting.getPriorVotes(member2, block5)).to.be.equal(VMS(5));
      expect(await vesting.getPriorVotes(member2, block6)).to.be.equal(VMS(5));
      expect(await vesting.getPriorVotes(member2, block7)).to.be.equal((VMB(5) + VMB(6)).toString());
      expect(await vesting.getPriorVotes(member2, block8)).to.be.equal((VMB(5) + VMB(8) + VMB(6) - TMB(2)).toString());
      expect(await vesting.getPriorVotes(member2, block9)).to.be.equal((VMB(9) + VMB(8) + VMB(6) - TMB(2) - TMB(3)).toString());
      expect(await vesting.getPriorVotes(member2, block10)).to.be.equal((VMB(9) + VMB(6) - TMB(3)).toString());
      expect(await vesting.getPriorVotes(member2, block11)).to.be.equal((VMB(12) + VMB(6) - TMB(7)).toString());
      expect(await vesting.getPriorVotes(member2, block12)).to.be.equal((VMB(12) + VMB(6) - TMB(7)).toString());

      expect(await vesting.getPriorVotes(member3, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block2)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block3)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block4)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block5)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block6)).to.be.equal(VMS(6));
      expect(await vesting.getPriorVotes(member3, block7)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block8)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block8)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block9)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block10)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block11)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block12)).to.be.equal('0');

      // Step #14. Member #2 claimV #3 claimT #2
      await evmSetNextBlockTimestamp(startV + months(25));
      await vesting.claimTokens(member2, { from: member2 });
      const block14 = await getLatestBlockNumber();
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(25));

      // Step #14. Member #2 claimV #3 claimT #2
      await evmSetNextBlockTimestamp(startV + months(26));
      await vesting.claimTokens(member3, { from: member3 });
      expect(await getLatestBlockTimestamp()).to.be.equal(startV + months(26));

      const FIVE_MILLIONS = ether(5 * 1000 * 1000);

      expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(FIVE_MILLIONS);
      expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(FIVE_MILLIONS);
      expect((await vesting.members(member3)).alreadyClaimedVotes).to.be.equal(VMS(6));
      expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(FIVE_MILLIONS);
      expect((await vesting.members(member2)).alreadyClaimedTokens).to.be.equal(FIVE_MILLIONS);
      expect((await vesting.members(member3)).alreadyClaimedTokens).to.be.equal(FIVE_MILLIONS);
      expect(await erc20.balanceOf(member1)).to.be.equal(FIVE_MILLIONS);
      expect(await erc20.balanceOf(member2)).to.be.equal(FIVE_MILLIONS);
      expect(await erc20.balanceOf(member3)).to.be.equal(FIVE_MILLIONS);

      // >>> final checks
      expect(await vesting.getPriorVotes(member1, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block10)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block13)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, block14)).to.be.equal('0');

      expect(await vesting.getPriorVotes(member2, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block10)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block13)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, block14)).to.be.equal('0');

      expect(await vesting.getPriorVotes(member3, block1)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block10)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block13)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member3, block14)).to.be.equal('0');
    });
  });
});
