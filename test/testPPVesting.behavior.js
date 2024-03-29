const { ether: etherBN, time, constants } = require('@openzeppelin/test-helpers');
const { solidity } = require('ethereum-waffle');

const chai = require('chai');
const PPVesting = artifacts.require('PPVesting');
const ERC20 = artifacts.require('ERC20PresetMinterPauser');

chai.use(solidity);
const { expect } = chai;

function ether(value) {
  return etherBN(String(value)).toString();
}

ERC20.numberFormat = 'String';
PPVesting.numberFormat = 'String';

// NOTICE: all durations are represented in blocks
contract('PPVesting Behaviour Tests', function ([, member1, member2, member3, alice, bob, vault]) {
  let vesting;
  let startT;
  let endT;
  let durationT;
  let startV;
  let durationV;
  let erc20;
  let currentBlock;

  beforeEach(async function () {
    erc20 = await ERC20.new('Concentrated Voting Power', 'CVP');
    await erc20.mint(vault, ether(1500000));

    // Setup...
    const amountPerMember = ether('2500');
    currentBlock = await time.latestBlock();

    startV = parseInt(currentBlock) + 5;
    durationV = 10;

    startT = parseInt(currentBlock) + 10;
    durationT = 5;

    endT = startT + durationT;

    vesting = await PPVesting.new(
      erc20.address,
      startV,
      durationV,
      startT,
      durationT,
      [member1, member2, member3],
      amountPerMember,
    );

    await erc20.transfer(vesting.address, ether(30000), { from: vault });
  });

  describe('claimTokens', () => {
    it('should allow a gradual token/votes claims each block', async function () {
      // Step #0
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, currentBlock)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );

      // Step #1
      await time.advanceBlockTo(startV);
      expect(await vesting.hasVoteVestingStarted()).to.be.true;

      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 1);

      await expect(vesting.getPriorVotes(member1, startV - 1)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );

      // Step #2
      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 2);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));

      // Step #3
      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 3);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));

      // Step #4
      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 4);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));

      // Step #5
      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 5);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(1000));
      await expect(vesting.getPriorVotes(member1, startT)).to.be.revertedWith(
        'PPVesting::getPriorVotes: Not yet determined',
      );
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT);
      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('5');

      // Step #6
      await vesting.claimTokens(alice, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 6); // #11
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT + 1);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startT)).to.be.equal(ether(1250));
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('6');
      const checkpoint = await vesting.checkpoints(member1, 0);
      expect(checkpoint.fromBlock).to.be.equal(String(startV + 1));
      expect(checkpoint.votes).to.be.equal(ether(250));

      // Step #7
      await vesting.claimTokens(alice, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 7); // #12
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT + 2);

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1000));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startT)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 1)).to.be.equal(ether(1000));

      // Step #8
      await vesting.claimTokens(alice, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 8); // #13
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT + 3);

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startT)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 1)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startT + 2)).to.be.equal(ether(750));

      // Step #9
      await vesting.claimTokens(alice, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 9); // #14
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT + 4);

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2000));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startT)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 1)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startT + 2)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startT + 3)).to.be.equal(ether(500));

      // Step #10
      await vesting.claimTokens(alice, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 10); // #15
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT + 5);

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startT)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 1)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startT + 2)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startT + 3)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startT + 4)).to.be.equal(ether(250));

      // Step #11
      await expect(vesting.claimTokens(alice, { from: member1 })).to.revertedWith(
        'PPVesting::claimTokens: Nothing to claim',
      );
      expect(await vesting.getPriorVotes(member1, startT + 4)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startT + 5)).to.be.equal(ether(0));
    });

    it('should allow case with V1,2/T2,3,4 proportion', async function () {
      // Setup...
      const amountPerMember = ether('50000');
      currentBlock = await time.latestBlock();

      startV = parseInt(currentBlock) + 100;
      durationV = 120;

      startT = parseInt(currentBlock) + 160;
      durationT = 180;

      endT = startT + durationT;

      vesting = await PPVesting.new(
        erc20.address,
        startV,
        durationV,
        startT,
        durationT,
        [member1, member2, member3],
        amountPerMember,
      );

      await erc20.transfer(vesting.address, ether(150000), { from: vault });

      // Step #1
      await time.advanceBlockTo(startV + 14);
      await vesting.claimVotes(member1);
      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));

      // Step #2
      await time.advanceBlockTo(startV + 16);
      expect(await vesting.getPriorVotes(member1, startV + 15)).to.be.equal(ether(6250));
      await expect(vesting.getPriorVotes(member1, startT)).to.be.revertedWith(
        'PPVesting::getPriorVotes: Not yet determined',
      );
      expect(await vesting.numCheckpoints(member1)).to.be.equal('1');

      // Step #3
      await time.advanceBlockTo(startV + 59);
      await vesting.claimVotes(member1);
      await time.advanceBlockTo(startV + 61);
      expect(await vesting.getPriorVotes(member1, startV + 60)).to.be.equal(ether(25000));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('2');

      // Step #4
      await time.advanceBlockTo(startV + 74);
      await vesting.claimVotes(member1);
      await time.advanceBlockTo(startV + 76);
      expect(await vesting.getPriorVotes(member1, startV + 75)).to.be.equal(ether(31250));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('3');

      // Step #5
      await time.advanceBlockTo(startV + 89);
      await vesting.claimTokens(member1, { from: member1 });
      await time.advanceBlockTo(startV + 91);
      expect(await vesting.getPriorVotes(member1, startV + 90)).to.be.equal('29166666666666666666667');
      expect(await erc20.balanceOf(member1)).to.be.equal('8333333333333333333333');
      expect(await vesting.numCheckpoints(member1)).to.be.equal('4');

      // Step #6
      await time.advanceBlockTo(startV + 104);
      await vesting.claimTokens(member1, { from: member1 });
      await time.advanceBlockTo(startV + 106);
      expect(await vesting.getPriorVotes(member1, startV + 105)).to.be.equal(ether(31250));
      expect(await erc20.balanceOf(member1)).to.be.equal(ether(12500));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('5');

      // Step #7
      await time.advanceBlockTo(startV + 119);
      await vesting.claimTokens(member1, { from: member1 });
      await time.advanceBlockTo(startV + 121);
      expect(await vesting.getPriorVotes(member1, startV + 120)).to.be.equal('33333333333333333333334');
      expect(await erc20.balanceOf(member1)).to.be.equal('16666666666666666666666');
      expect(await vesting.numCheckpoints(member1)).to.be.equal('6');

      // Step #8 (member2 claims his tokens)
      await time.advanceBlockTo(startV + 149);
      await vesting.claimTokens(member1, { from: member1 });
      await time.advanceBlockTo(startV + 151);
      expect(await vesting.getPriorVotes(member1, startV + 150)).to.be.equal(ether(25000));
      expect(await erc20.balanceOf(member1)).to.be.equal(ether(25000));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('7');

      await vesting.claimTokens(member2, { from: member2 });
      await time.advanceBlockTo(startV + 153);
      expect(await vesting.getPriorVotes(member2, startV + 152)).to.be.equal('24444444444444444444445');
      expect(await erc20.balanceOf(member2)).to.be.equal('25555555555555555555555');
      expect(await vesting.numCheckpoints(member2)).to.be.equal('1');

      // Step #9
      await time.advanceBlockTo(startV + 239);
      await vesting.claimTokens(member1, { from: member1 });
      await time.advanceBlockTo(startV + 241);
      expect(await vesting.getPriorVotes(member1, startV + 240)).to.be.equal(ether(0));
      expect(await erc20.balanceOf(member1)).to.be.equal(ether(50000));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('8');

      // Step #10 (member3 claims his votes)
      await expect(vesting.claimTokens(member1, { from: member1 })).to.be.revertedWith(
        'PPVesting::claimTokens: Nothing to claim',
      );
      await vesting.claimTokens(member3, { from: member3 });
      await time.advanceBlockTo(startV + 251);
      expect(await vesting.getPriorVotes(member3, startV + 250)).to.be.equal(ether(0));
      expect(await erc20.balanceOf(member3)).to.be.equal(ether(50000));
      expect(await vesting.numCheckpoints(member3)).to.be.equal('0');
    });

    it('should allow withdrawing tokens at the pre-last block', async function () {
      // Step #0
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, currentBlock)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );

      await time.advanceBlockTo(startT - 1);

      // Step #1
      await vesting.claimVotes(member1);

      expect(await vesting.hasVoteVestingStarted()).to.be.true;
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 5);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT);

      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      await expect(vesting.getPriorVotes(member1, startT)).to.be.revertedWith(
        'PPVesting::getPriorVotes: Not yet determined',
      );
      expect(await vesting.numCheckpoints(member1)).to.be.equal('1');

      // Step #2
      await time.advanceBlockTo(endT - 1);

      expect((await time.latestBlock()).toNumber()).to.be.equal(endT - 1);
      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(2000));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 1)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 2)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 3)).to.be.equal(ether(1250));

      // Step #3
      await vesting.claimTokens(alice, { from: member1 });

      expect((await time.latestBlock()).toNumber()).to.be.equal(endT);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether('0'));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 1)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 2)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 3)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 4)).to.be.equal(ether(1250));

      // Step #4
      await expect(vesting.claimTokens(alice, { from: member1 })).to.be.revertedWith(
        'PPVesting::claimTokens: Nothing to claim',
      );

      expect((await time.latestBlock()).toNumber()).to.be.equal(endT + 1);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether('0'));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 1)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 2)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 3)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 4)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 5)).to.be.equal(ether(0));

      // Step #5
      await expect(vesting.claimTokens(alice, { from: member1 })).to.be.revertedWith(
        'PPVesting::claimTokens: Nothing to claim',
      );

      expect((await time.latestBlock()).toNumber()).to.be.equal(endT + 2);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether('0'));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startT + 2)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 3)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 4)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member1, startT + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startT + 6)).to.be.equal(ether(0));
    });
  });

  describe('transfer/claimTokens', () => {
    it('should allow transferring after startV', async function () {
      // Step #0
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, currentBlock)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );

      await time.advanceBlockTo(startV);

      await vesting.claimVotes(member1);
      await vesting.claimVotes(member1);

      await time.advanceBlockTo(startT);

      // Step #1
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT);
      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('2');

      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(500));
      await expect(vesting.getPriorVotes(member1, startT)).to.be.revertedWith(
        'PPVesting::getPriorVotes: Not yet determined',
      );

      // Step #2
      await vesting.claimVotes(member1);
      await vesting.claimTokens(alice, { from: member1 });
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1000));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('4');
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 6)).to.be.equal(ether(1500));
      await expect(vesting.getPriorVotes(member1, startV + 7)).to.be.revertedWith(
        'PPVesting::getPriorVotes: Not yet determined',
      );

      // Step #2
      await vesting.transfer(bob, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT + 3);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1000));

      const member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimedVotes).to.be.equal(ether(0));
      expect(member1Details.alreadyClaimedTokens).to.be.equal(ether(0));

      const bobDetails = await vesting.members(bob);
      expect(bobDetails.active).to.be.true;
      expect(bobDetails.transferred).to.be.false;
      expect(bobDetails.alreadyClaimedVotes).to.be.equal(ether(2000));
      expect(bobDetails.alreadyClaimedTokens).to.be.equal(ether(1000));

      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startT)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startT + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startT + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startT + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startT + 2)).to.be.equal(ether(0));

      // Step #3
      await expect(vesting.claimTokens(alice, { from: member1 })).to.be.revertedWith(
        'PPVesting::claimTokens: User not active',
      );

      expect((await time.latestBlock()).toNumber()).to.be.equal(startT + 4);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startT + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startT + 3)).to.be.equal(ether(1000));

      // Step #4
      await vesting.claimTokens(alice, { from: bob });

      expect((await time.latestBlock()).toNumber()).to.be.equal(endT);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));

      // Step #5
      await expect(vesting.claimTokens(alice, { from: bob })).to.be.revertedWith(
        'PPVesting::claimTokens: Nothing to claim',
      );

      expect((await time.latestBlock()).toNumber()).to.be.equal(endT + 1);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startT)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startT + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startT + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startT + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startT + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, endT)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startT)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startT + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startT + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startT + 3)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(bob, startT + 4)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(bob, endT)).to.be.equal(ether(0));
    });
  });

  describe('delegation', () => {
    it('should allow delegation', async function () {
      // Step #1
      await time.advanceBlockTo(startV);
      expect(await vesting.hasVoteVestingStarted()).to.be.true;

      // Step #2
      await vesting.claimVotes(member1);
      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 2);

      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));

      // Step #3
      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 3);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));

      // Step #4
      await vesting.delegateVotes(member2, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 4);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));

      // Step #4
      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 5);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 4)).to.be.equal(ether(750));

      // Step #5
      await vesting.claimVotes(member3);
      await vesting.delegateVotes(member2, { from: member3 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 7);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 6)).to.be.equal(ether(0));

      expect(await vesting.getPriorVotes(member2, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 4)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member2, startV + 5)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 6)).to.be.equal(ether(1250));

      expect(await vesting.getPriorVotes(member3, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 6)).to.be.equal(ether(1500));

      // Step #6
      await vesting.claimTokens(member2, { from: member2 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 8);

      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 6)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 7)).to.be.equal(ether(0));

      expect(await vesting.getPriorVotes(member2, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 4)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member2, startV + 5)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 6)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 7)).to.be.equal(ether(2750));

      expect(await vesting.getPriorVotes(member3, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 6)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(member3, startV + 7)).to.be.equal(ether(0));

      // Step #7
      await vesting.claimTokens(member1, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 9);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT + 4);

      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 6)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 8)).to.be.equal(ether(0));

      expect(await vesting.getPriorVotes(member2, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 4)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member2, startV + 5)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 6)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 7)).to.be.equal(ether(2750));
      expect(await vesting.getPriorVotes(member2, startV + 8)).to.be.equal(ether(3250));

      expect(await vesting.getPriorVotes(member3, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 6)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(member3, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 8)).to.be.equal(ether(0));

      // Step #7
      await vesting.delegateVotes(member1, { from: member2 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 10);
      expect((await time.latestBlock()).toNumber()).to.be.equal(endT);

      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 6)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 8)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 9)).to.be.equal(ether(0));

      expect(await vesting.getPriorVotes(member2, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 4)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member2, startV + 5)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 6)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 7)).to.be.equal(ether(2750));
      expect(await vesting.getPriorVotes(member2, startV + 8)).to.be.equal(ether(3250));
      expect(await vesting.getPriorVotes(member2, startV + 9)).to.be.equal(ether(2250));

      expect(await vesting.getPriorVotes(member3, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 6)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(member3, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 9)).to.be.equal(ether(0));

      expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(2250));
      expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(2000));
      expect((await vesting.members(member3)).alreadyClaimedVotes).to.be.equal(ether(1500));
      expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(2000));
      expect((await vesting.members(member2)).alreadyClaimedTokens).to.be.equal(ether(1500));
      expect((await vesting.members(member3)).alreadyClaimedTokens).to.be.equal(ether(0));
      expect(await erc20.balanceOf(member1)).to.be.equal(ether(2000));
      expect(await erc20.balanceOf(member2)).to.be.equal(ether(1500));
      expect(await erc20.balanceOf(member3)).to.be.equal(ether(0));

      expect(await vesting.voteDelegations(member1)).to.be.equal(member2);
      expect(await vesting.voteDelegations(member2)).to.be.equal(member1);
      expect(await vesting.voteDelegations(member3)).to.be.equal(member2);

      // Step #8
      await vesting.claimTokens(member1, { from: member1 });
      await vesting.claimTokens(member2, { from: member2 });
      await vesting.claimTokens(member3, { from: member3 });
      await expect(vesting.claimVotes(member1, { from: member3 })).to.be.revertedWith(
        'PPVesting::claimVotes: Vote vesting has ended',
      );

      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 14);
      expect((await time.latestBlock()).toNumber()).to.be.equal(endT + 4);

      expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(2250));
      expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(2000));
      expect((await vesting.members(member3)).alreadyClaimedVotes).to.be.equal(ether(1500));
      expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(2500));
      expect((await vesting.members(member2)).alreadyClaimedTokens).to.be.equal(ether(2500));
      expect((await vesting.members(member3)).alreadyClaimedTokens).to.be.equal(ether(2500));
      expect(await erc20.balanceOf(member1)).to.be.equal(ether(2500));
      expect(await erc20.balanceOf(member2)).to.be.equal(ether(2500));
      expect(await erc20.balanceOf(member3)).to.be.equal(ether(2500));

      // The vote vesting has ended so all balances for all blocks are 0
      expect(await vesting.hasVoteVestingEnded()).to.be.equal(true);
      expect(await vesting.getPriorVotes(member1, startV + 6)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 8)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 9)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 10)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startV + 11)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 12)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 13)).to.be.equal(ether(0));

      expect(await vesting.getPriorVotes(member2, startV + 6)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 7)).to.be.equal(ether(2750));
      expect(await vesting.getPriorVotes(member2, startV + 8)).to.be.equal(ether(3250));
      expect(await vesting.getPriorVotes(member2, startV + 9)).to.be.equal(ether(2250));
      expect(await vesting.getPriorVotes(member2, startV + 10)).to.be.equal(ether(1750));
      expect(await vesting.getPriorVotes(member2, startV + 11)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 12)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 13)).to.be.equal(ether(0));

      expect(await vesting.getPriorVotes(member3, startV + 6)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(member3, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 8)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 9)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 10)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 11)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 12)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 13)).to.be.equal(ether(0));
    });

    it('should correctly handle delegations on transfers', async function () {
      const amountPerMember = ether('2500');
      currentBlock = await time.latestBlock();

      startV = parseInt(currentBlock) + 5;
      durationV = 20;

      startT = parseInt(currentBlock) + 10;
      durationT = 20;

      endT = startT + durationT;

      vesting = await PPVesting.new(
        erc20.address,
        startV,
        durationV,
        startT,
        durationT,
        [member1, member2, member3],
        amountPerMember,
      );

      await erc20.transfer(vesting.address, ether(30000), { from: vault });
      // Step #1
      await time.advanceBlockTo(startV);
      expect(await vesting.hasVoteVestingStarted()).to.be.true;

      // Step #2
      await vesting.claimVotes(member1);
      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 2);

      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(125));

      // Step #3
      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 3);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(125));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(250));

      // Step #4
      await vesting.delegateVotes(member2, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 4);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(125));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(375));

      // Step #5
      await vesting.claimVotes(member1);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 5);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(125));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(375));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 4)).to.be.equal(ether(375));

      // Step #6
      await vesting.claimVotes(member3);
      await vesting.delegateVotes(member2, { from: member3 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 7);

      await expect(vesting.getPriorVotes(member1, startV)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );
      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(125));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(375));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 6)).to.be.equal(ether(0));

      expect(await vesting.getPriorVotes(member2, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 4)).to.be.equal(ether(375));
      expect(await vesting.getPriorVotes(member2, startV + 5)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member2, startV + 6)).to.be.equal(ether(625));

      expect(await vesting.getPriorVotes(member3, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 6)).to.be.equal(ether(750));

      // Step #7
      await vesting.claimTokens(member2, { from: member2 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 8);

      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(125));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(250));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(375));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 6)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 7)).to.be.equal(ether(0));

      expect(await vesting.getPriorVotes(member2, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 4)).to.be.equal(ether(375));
      expect(await vesting.getPriorVotes(member2, startV + 5)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member2, startV + 6)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member2, startV + 7)).to.be.equal(ether(1375));

      expect(await vesting.getPriorVotes(member3, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 6)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member3, startV + 7)).to.be.equal(ether(0));

      // Step #8
      await vesting.delegateVotes(member1, { from: member2 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 9);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT + 4);

      // Step #9
      await vesting.transfer(alice, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 10);

      // Step #10
      await vesting.delegateVotes(alice, { from: alice });
      await vesting.delegateVotes(member2, { from: alice });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 12);

      expect(await vesting.getPriorVotes(alice, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 8)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 9)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 10)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 10)).to.be.equal(ether(0));

      expect(await vesting.getPriorVotes(member1, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 6)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 8)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 9)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 10)).to.be.equal(ether(0));

      expect(await vesting.getPriorVotes(member2, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 4)).to.be.equal(ether(375));
      expect(await vesting.getPriorVotes(member2, startV + 5)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member2, startV + 6)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member2, startV + 7)).to.be.equal(ether(1375));
      expect(await vesting.getPriorVotes(member2, startV + 8)).to.be.equal(ether(2000));
      expect(await vesting.getPriorVotes(member2, startV + 9)).to.be.equal(ether(1375));
      expect(await vesting.getPriorVotes(member2, startV + 10)).to.be.equal(ether(2000));

      expect(await vesting.getPriorVotes(member3, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 6)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member3, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 9)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 10)).to.be.equal(ether(0));

      expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(0));
      expect((await vesting.members(alice)).alreadyClaimedVotes).to.be.equal(ether(1250));
      expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(1000));
      expect((await vesting.members(member3)).alreadyClaimedVotes).to.be.equal(ether(750));

      expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(0));
      expect((await vesting.members(alice)).alreadyClaimedTokens).to.be.equal(ether(0));
      expect((await vesting.members(member2)).alreadyClaimedTokens).to.be.equal(ether(375));
      expect((await vesting.members(member3)).alreadyClaimedTokens).to.be.equal(ether(0));
      expect(await erc20.balanceOf(member1)).to.be.equal(ether(0));
      expect(await erc20.balanceOf(member2)).to.be.equal(ether(375));
      expect(await erc20.balanceOf(member3)).to.be.equal(ether(0));

      expect(await vesting.voteDelegations(member1)).to.be.equal(constants.ZERO_ADDRESS);
      expect(await vesting.voteDelegations(alice)).to.be.equal(member2);
      expect(await vesting.voteDelegations(member2)).to.be.equal(member1);
      expect(await vesting.voteDelegations(member3)).to.be.equal(member2);

      expect(await vesting.hasVoteVestingEnded()).to.be.equal(false);

      // Step #11
      await vesting.claimTokens(alice, { from: alice });
      await vesting.claimTokens(member2, { from: member2 });
      await vesting.claimTokens(member3, { from: member3 });
      await vesting.delegateVotes(member3, { from: member2 });
      await vesting.claimTokens(member2, { from: member2 });
      await vesting.delegateVotes(member2, { from: member2 });
      await vesting.claimTokens(alice, { from: alice });
      expect(await vesting.hasVoteVestingEnded()).to.be.equal(false);
      await vesting.delegateVotes(member3, { from: alice });
      await time.advanceBlockTo(endT + 1);
      await vesting.claimTokens(alice, { from: alice });

      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 27);
      expect((await time.latestBlock()).toNumber()).to.be.equal(endT + 2);

      expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(0));
      expect((await vesting.members(alice)).alreadyClaimedVotes).to.be.equal(ether(2375));
      expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(2125));
      expect((await vesting.members(member3)).alreadyClaimedVotes).to.be.equal(ether(1875));

      expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(0));
      expect((await vesting.members(alice)).alreadyClaimedTokens).to.be.equal(ether(2500));
      expect((await vesting.members(member2)).alreadyClaimedTokens).to.be.equal(ether(1500));
      expect((await vesting.members(member3)).alreadyClaimedTokens).to.be.equal(ether(1250));
      expect(await erc20.balanceOf(member1)).to.be.equal(ether(0));
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await erc20.balanceOf(member2)).to.be.equal(ether(1500));
      expect(await erc20.balanceOf(member3)).to.be.equal(ether(1250));

      // Step #12
      await vesting.claimTokens(member2, { from: member2 });
      await vesting.claimTokens(member3, { from: member3 });
      await expect(vesting.claimTokens(member3, { from: member3 })).to.be.revertedWith(
        'PPVesting::claimTokens: Nothing to claim',
      );

      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 30);
      expect((await time.latestBlock()).toNumber()).to.be.equal(endT + 5);

      expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(0));
      expect((await vesting.members(alice)).alreadyClaimedTokens).to.be.equal(ether(2500));
      expect((await vesting.members(member2)).alreadyClaimedTokens).to.be.equal(ether(2500));
      expect((await vesting.members(member3)).alreadyClaimedTokens).to.be.equal(ether(2500));

      expect(await erc20.balanceOf(member1)).to.be.equal(ether(0));
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await erc20.balanceOf(member2)).to.be.equal(ether(2500));
      expect(await erc20.balanceOf(member3)).to.be.equal(ether(2500));

      expect(await vesting.getPriorVotes(member1, startV + 23)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 23)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 23)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member3, startV + 23)).to.be.equal(ether(625));

      // member1
      expect(await vesting.getPriorVotes(member1, startV + 6)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 8)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 9)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 10)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 11)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 12)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 13)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 14)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 15)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 16)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 17)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 18)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 19)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 20)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 21)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 22)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startV + 23)).to.be.equal(ether(0));

      // alice
      expect(await vesting.getPriorVotes(alice, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 6)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 8)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 9)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 10)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 11)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(alice, startV + 12)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 13)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 14)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 15)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 16)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 17)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 18)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 19)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 20)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 21)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 22)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 23)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 24)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 25)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(alice, startV + 26)).to.be.equal(ether(0));

      // member2
      expect(await vesting.getPriorVotes(member2, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, startV + 4)).to.be.equal(ether(375));
      expect(await vesting.getPriorVotes(member2, startV + 5)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member2, startV + 6)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member2, startV + 7)).to.be.equal(ether(1375));
      expect(await vesting.getPriorVotes(member2, startV + 8)).to.be.equal(ether(2000));
      expect(await vesting.getPriorVotes(member2, startV + 9)).to.be.equal(ether(1375));
      expect(await vesting.getPriorVotes(member2, startV + 10)).to.be.equal(ether(2000));
      expect(await vesting.getPriorVotes(member2, startV + 11)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member2, startV + 12)).to.be.equal(ether(2000));
      expect(await vesting.getPriorVotes(member2, startV + 13)).to.be.equal(ether(1375));
      expect(await vesting.getPriorVotes(member2, startV + 14)).to.be.equal(ether(1375));
      expect(await vesting.getPriorVotes(member2, startV + 15)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 16)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 17)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 18)).to.be.equal(ether(1875));
      expect(await vesting.getPriorVotes(member2, startV + 19)).to.be.equal(ether(1875));
      expect(await vesting.getPriorVotes(member2, startV + 20)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 21)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 22)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member2, startV + 23)).to.be.equal(ether(1250));
      expect(await vesting.getPriorVotes(member3, startV + 24)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member3, startV + 25)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member3, startV + 26)).to.be.equal(ether(0));

      // member3
      expect(await vesting.getPriorVotes(member3, startV + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 5)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 6)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member3, startV + 7)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 8)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 9)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 10)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 11)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 12)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 13)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 14)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 15)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 16)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member3, startV + 17)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member3, startV + 18)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 19)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member3, startV + 20)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member3, startV + 21)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member3, startV + 22)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member3, startV + 23)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member3, startV + 24)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member3, startV + 25)).to.be.equal(ether(625));
      expect(await vesting.getPriorVotes(member3, startV + 26)).to.be.equal(ether(0));
    });
  });
});
