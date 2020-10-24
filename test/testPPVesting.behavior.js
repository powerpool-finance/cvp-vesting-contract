const { ether: etherBN, time } = require('@openzeppelin/test-helpers');
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
contract('PPVesting Behaviour Tests', function ([, owner, member1, member2, member3, alice, bob]) {
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
    await erc20.mint(owner, ether(5000));

    // Setup...
    const amountPerMember = ether('2500');
    currentBlock = await time.latestBlock();

    startV = parseInt(currentBlock) + 5;
    durationV = 10;

    startT = parseInt(currentBlock) + 10;
    durationT = 5;

    endT = startT + durationT;

    vesting = await PPVesting.new(
      owner,
      erc20.address,
      startV,
      durationV,
      startT,
      durationT,
      [member1, member2, member3],
      amountPerMember,
    );

    await erc20.transfer(vesting.address, ether(3000), { from: owner });
  });

  describe('claimTokens', () => {
    it('should allow a gradual token/votes claims each block', async function () {
      // Step #0
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, currentBlock)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );

      // Step #1
      await time.advanceBlockTo(startV);
      expect(await vesting.voteVestingStarted()).to.be.true;

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
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
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
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('6');
      // TODO: move checkpoint
      const checkpoint = await vesting.checkpoints(member1, 0);
      expect(checkpoint.fromBlock).to.be.equal(String(startV + 1));
      expect(checkpoint.votes).to.be.equal(ether(250));

      // Step #7
      await vesting.claimTokens(alice, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 7); // #12
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT + 2);

      expect(await erc20.balanceOf(alice)).to.be.equal(ether( 1000));
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
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

      expect(await erc20.balanceOf(alice)).to.be.equal(ether( 1500));
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
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

      expect(await erc20.balanceOf(alice)).to.be.equal(ether( 2000));
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
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

      expect(await erc20.balanceOf(alice)).to.be.equal(ether( 2500));
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
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

    it('should allow withdrawing tokens at the pre-last block', async function () {
      // Step #0
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, currentBlock)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startV",
      );

      await time.advanceBlockTo(startT - 1);

      // Step #1
      await vesting.claimVotes(member1);

      expect(await vesting.voteVestingStarted()).to.be.true;
      expect((await time.latestBlock()).toNumber()).to.be.equal(startV + 5);
      expect((await time.latestBlock()).toNumber()).to.be.equal(startT);

      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
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
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(2000));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(2500));
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
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether('0'));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
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
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether('0'));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
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
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether('0'));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
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
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
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
      expect(await vesting.availableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
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
      expect(bobDetails.alreadyClaimedVotes).to.be.equal(ether(1750));
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
      expect(await vesting.getPriorVotes(bob, startT + 3)).to.be.equal(ether(750));

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
      expect(await vesting.getPriorVotes(bob, startT + 3)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(bob, startT + 4)).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(bob, endT)).to.be.equal(ether(0));
    });
  });
});
