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

contract('PPVesting Behaviour Tests', function ([, owner, member1, member2, member3, alice, bob]) {
  let vesting;
  let startBlock;
  let startBlockInt;
  let endBlock;
  let endBlockInt;
  let durationInBlocks;
  let durationInBlocksInt;
  let erc20;
  let currentBlock;

  beforeEach(async function () {
    erc20 = await ERC20.new('Concentrated Voting Power', 'CVP');
    await erc20.mint(owner, ether(5000));

    // Setup...
    const amountPerMember = ether('2500');
    currentBlock = await time.latestBlock();

    startBlockInt = parseInt(currentBlock) + 5;
    startBlock = String(parseInt(currentBlock) + 5);

    durationInBlocksInt = 5;
    durationInBlocks = String('5');

    endBlockInt = startBlockInt + durationInBlocksInt;
    endBlock = String(endBlock);

    vesting = await PPVesting.new(
      owner,
      erc20.address,
      startBlock,
      durationInBlocks,
      [member1, member2, member3],
      amountPerMember,
    );

    await erc20.transfer(vesting.address, ether(3000), { from: owner });
  });

  describe('withdrawal', () => {
    it('should allow a gradual withdrawal each block', async function () {
      // Step #0
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, currentBlock)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startBlock",
      );

      await time.advanceBlockTo(startBlockInt);
      expect(await vesting.hasStarted()).to.be.true;

      // Step #1
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt);
      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, startBlock)).to.be.revertedWith(
        'PPVesting::getPriorVotes: Not yet determined',
      );

      // will mine block #8
      await vesting.withdraw(alice, { from: member1 });

      // Step #2
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt + 1);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(500));
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('1');
      const checkpoint = await vesting.checkpoints(member1, 0);
      expect(checkpoint.fromBlock).to.be.equal(String(startBlockInt + 1));
      expect(checkpoint.votes).to.be.equal(ether(2000));
      await expect(vesting.getPriorVotes(member1, startBlock)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startBlock",
      );
      await expect(vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.revertedWith(
        'PPVesting::getPriorVotes: Not yet determined',
      );

      await vesting.withdraw(alice, { from: member1 });

      // Step #3
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt + 2);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1000));
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(2000));

      await vesting.withdraw(alice, { from: member1 });

      // Step #4
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt + 3);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1500));
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(2000));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(1500));

      await vesting.withdraw(alice, { from: member1 });

      // Step #5
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt + 4);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2000));
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(2000));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 3)).to.be.equal(ether(1000));

      await vesting.withdraw(alice, { from: member1 });

      // Step #6
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt + 5);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
      await expect(vesting.getPriorVotes(member1, startBlock)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startBlock",
      );
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(2000));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 3)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 4)).to.be.equal(ether(500));

      await expect(vesting.withdraw(alice, { from: member1 })).to.revertedWith(
        'PPVesting::withdraw: Nothing to withdraw',
      );

      // Step #6
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt + 6);
      expect(await vesting.getPriorVotes(member1, startBlockInt + 5)).to.be.equal('0');
    });

    it('should allow withdrawing at the pre-last block', async function () {
      // Step #0
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, currentBlock)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startBlock",
      );

      // will
      await time.advanceBlockTo(startBlockInt);
      expect(await vesting.hasStarted()).to.be.true;

      // Step #1
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt);
      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, startBlock)).to.be.revertedWith(
        'PPVesting::getPriorVotes: Not yet determined',
      );

      await time.advanceBlockTo(endBlockInt - 1);

      // Step #2
      expect((await time.latestBlock()).toNumber()).to.be.equal(endBlockInt - 1);
      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(2000));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 3)).to.be.equal(ether(2500));

      await vesting.withdraw(alice, { from: member1 });

      // Step #3
      expect((await time.latestBlock()).toNumber()).to.be.equal(endBlockInt);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether('0'));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 3)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 4)).to.be.equal(ether(2500));

      await expect(vesting.withdraw(alice, { from: member1 })).to.be.revertedWith(
        'PPVesting::withdraw: Nothing to withdraw',
      );

      // Step #4
      expect((await time.latestBlock()).toNumber()).to.be.equal(endBlockInt + 1);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether('0'));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 3)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 4)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 5)).to.be.equal(ether(0));

      await expect(vesting.withdraw(alice, { from: member1 })).to.be.revertedWith(
        'PPVesting::withdraw: Nothing to withdraw',
      );

      // Step #5
      expect((await time.latestBlock()).toNumber()).to.be.equal(endBlockInt + 2);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether('0'));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 3)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 4)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, endBlockInt)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, endBlockInt + 1)).to.be.equal(ether(0));
    });
  });

  describe('transfer/withdrawal', () => {
    it('should allow transferring after startBlock', async function () {
      // Step #0
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, currentBlock)).to.be.revertedWith(
        "PPVesting::getPriorVotes: Can't be before/equal the startBlock",
      );

      await time.advanceBlockTo(startBlockInt);
      expect(await vesting.hasStarted()).to.be.true;

      // Step #1
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt);
      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
      await expect(vesting.getPriorVotes(member1, startBlock)).to.be.revertedWith(
        'PPVesting::getPriorVotes: Not yet determined',
      );

      await vesting.withdraw(alice, { from: member1 });
      await vesting.withdraw(alice, { from: member1 });

      // Step #1
      await vesting.transfer(bob, { from: member1 });
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt + 3);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1000));

      const member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimed).to.be.equal(ether(0));

      const aliceDetails = await vesting.members(bob);
      expect(aliceDetails.active).to.be.true;
      expect(aliceDetails.transferred).to.be.false;
      expect(aliceDetails.alreadyClaimed).to.be.equal(ether(1000));

      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 2)).to.be.equal(ether(0));
      await expect(vesting.withdraw(alice, { from: member1 })).to.be.revertedWith(
        'PPVesting::withdraw: User not active',
      );

      // Step #2
      expect((await time.latestBlock()).toNumber()).to.be.equal(startBlockInt + 4);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 3)).to.be.equal(ether(1500));

      await vesting.withdraw(alice, { from: bob });

      // Step #3
      expect((await time.latestBlock()).toNumber()).to.be.equal(endBlockInt);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 3)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 4)).to.be.equal(ether(1500));

      await expect(vesting.withdraw(alice, { from: bob })).to.be.revertedWith(
        'PPVesting::withdraw: Nothing to withdraw',
      );

      // Step #4
      expect((await time.latestBlock()).toNumber()).to.be.equal(endBlockInt + 1);
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 3)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, startBlockInt + 4)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, endBlockInt)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 1)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 2)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 3)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(bob, startBlockInt + 4)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(bob, endBlockInt)).to.be.equal(ether(0));
    });
  });
});
