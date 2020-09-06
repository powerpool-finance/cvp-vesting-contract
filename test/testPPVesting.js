const { ether: etherBN, time, constants } = require('@openzeppelin/test-helpers');
const { solidity } = require('ethereum-waffle');

const chai = require('chai');
const PPVesting = artifacts.require('PPVesting');
const ERC20 = artifacts.require('ERC20PresetMinterPauser');
const MockCVP = artifacts.require('MockCVP');

chai.use(solidity);
const { expect } = chai;

function ether(value) {
  return etherBN(String(value)).toString();
}

ERC20.numberFormat = 'String';
PPVesting.numberFormat = 'String';

contract('PPVesting Unit Tests', function ([, owner, member1, member2, member3, member4, alice, bob]) {
  let vesting;
  let startBlock;
  let startBlockInt;
  let endBlock;
  let endBlockInt;
  let durationInBlocks;
  let durationInBlocksInt;
  const amountPerMember = ether('5000');
  let erc20;

  beforeEach(async function () {
    const currentBlock = await time.latestBlock();

    startBlockInt = parseInt(currentBlock) + 5;
    startBlock = String(parseInt(currentBlock) + 5);

    durationInBlocksInt = 10;
    durationInBlocks = String(durationInBlocksInt);

    endBlockInt = startBlockInt + durationInBlocksInt;
    endBlock = String(endBlock);

    erc20 = await ERC20.new('Concentrated Voting Power', 'CVP');
    await erc20.mint(owner, ether(5000));

    vesting = await PPVesting.new(
      owner,
      erc20.address,
      startBlock,
      durationInBlocks,
      [member1, member2, member3],
      amountPerMember,
    );
  });

  describe('initialization', () => {
    it('should assign correct values during initialization', async function () {
      expect(await vesting.owner()).to.equal(owner);
      expect(await vesting.token()).to.equal(erc20.address);
      expect(await vesting.startBlock()).to.equal(startBlock);
      expect(await vesting.durationInBlocks()).to.equal(durationInBlocks);
      expect(await vesting.amountPerMember()).to.equal(amountPerMember);
      expect(await vesting.memberCount()).to.equal('3');

      const res = await vesting.members(member1);
      expect(res.active).to.be.true;
      expect(res.alreadyClaimed).to.be.equal('0');
    });

    it('should deny initialization with zero duration', async function () {
      await expect(
        PPVesting.new(owner, erc20.address, startBlock, 0, [member1, member2, member3], amountPerMember),
      ).to.be.revertedWith('PPVesting: Invalid durationInBlocks');
    });

    it('should deny initialization with zero owner address', async function () {
      await expect(
        PPVesting.new(
          constants.ZERO_ADDRESS,
          erc20.address,
          startBlock,
          durationInBlocks,
          [member1, member2, member3],
          amountPerMember,
        ),
      ).to.be.revertedWith('PPVesting: Invalid owner address');
    });

    it('should deny initialization with zero owner address', async function () {
      await expect(
        PPVesting.new(owner, erc20.address, startBlock, durationInBlocks, [member1, member2, member3], 0),
      ).to.be.revertedWith('PPVesting: Invalid amount per member');
    });

    it('should deny initialization with an empty member list', async function () {
      await expect(
        PPVesting.new(owner, erc20.address, startBlock, durationInBlocks, [], amountPerMember),
      ).to.be.revertedWith('PPVesting: Empty member list');
    });

    it('should deny initialization with non-erc20 contract address', async function () {
      await expect(
        PPVesting.new(
          owner,
          vesting.address,
          startBlock,
          durationInBlocks,
          [member1, member2, member3],
          amountPerMember,
        ),
      ).to.be.revertedWith(
        'Transaction reverted: function selector was not recognized and there\'s no fallback function',
      );
    });

    it('should deny initialization with non-erc20 address', async function () {
      await expect(
        PPVesting.new(owner, bob, startBlock, durationInBlocks, [member1, member2, member3], amountPerMember),
      ).to.be.revertedWith('Transaction reverted: function call to a non-contract account');
    });
  });

  describe('availableToWithdraw pure function', () => {
    describe('when nothing claimed yet', () => {
      it('should return correct results before and on startBlock', async function () {
        expect(await vesting.availableToWithdraw('199', '200', '5000', '100', '0')).to.be.equal('0');
        expect(await vesting.availableToWithdraw('200', '200', '5000', '100', '0')).to.be.equal('0');
      });

      it('should return correct results on the first block of vesting period', async function () {
        // 5000 total / 100 blocks = 50 per block
        expect(await vesting.availableToWithdraw('201', '200', '5000', '100', '0')).to.be.equal('50');
        expect(await vesting.availableToWithdraw('201', '200', ether('5000'), '100', '0')).to.be.equal(ether('50'));
      });

      it('should return correct results on the first block of vesting period', async function () {
        // 5000 total / 100 blocks * 1 block = 50 for the first block
        expect(await vesting.availableToWithdraw('201', '200', '5000', '100', '0')).to.be.equal('50');
        expect(await vesting.availableToWithdraw('201', '200', ether('5000'), '100', '0')).to.be.equal(ether('50'));
      });

      it('should return correct results on the pre-last block of vesting period', async function () {
        // 5000 total / 100 blocks  * 99 blocks = 4950
        expect(await vesting.availableToWithdraw('299', '200', '5000', '100', '0')).to.be.equal('4950');
        expect(await vesting.availableToWithdraw('299', '200', ether('5000'), '100', '0')).to.be.equal(ether('4950'));
      });

      it('should return correct results on the last block of vesting period', async function () {
        // 5000 total
        expect(await vesting.availableToWithdraw('300', '200', '5000', '100', '0')).to.be.equal('5000');
        expect(await vesting.availableToWithdraw('300', '200', ether('5000'), '100', '0')).to.be.equal(ether('5000'));
      });

      it('should return correct results on the next after the last block of vesting period', async function () {
        // 5000 total
        expect(await vesting.availableToWithdraw('301', '200', '5000', '100', '0')).to.be.equal('5000');
        expect(await vesting.availableToWithdraw('301', '200', ether('5000'), '100', '0')).to.be.equal(ether('5000'));
      });
    });

    describe('when a partial amount is already claimed', () => {
      it('should return correct results on the first block of vesting period', async function () {
        // 5000 total / 100 blocks - 20 already claimed = 30
        expect(await vesting.availableToWithdraw('201', '200', '5000', '100', '20')).to.be.equal('30');
        expect(await vesting.availableToWithdraw('201', '200', ether('5000'), '100', ether(20))).to.be.equal(
          ether('30'),
        );

        expect(await vesting.availableToWithdraw('201', '200', '5000', '100', '50')).to.be.equal('0');
        expect(await vesting.availableToWithdraw('201', '200', ether('5000'), '100', ether(50))).to.be.equal(
          ether('0'),
        );
      });

      it('should return correct results on the last block of vesting period', async function () {
        expect(await vesting.availableToWithdraw('300', '200', '5000', '100', '50')).to.be.equal('4950');
        expect(await vesting.availableToWithdraw('300', '200', ether('5000'), '100', ether(50))).to.be.equal(
          ether('4950'),
        );

        expect(await vesting.availableToWithdraw('300', '200', '5000', '100', '5000')).to.be.equal('0');
        expect(await vesting.availableToWithdraw('300', '200', ether('5000'), '100', ether(5000))).to.be.equal(
          ether('0'),
        );
      });

      it('should return correct results after the last block of vesting period', async function () {
        expect(await vesting.availableToWithdraw('305', '200', '5000', '100', '50')).to.be.equal('4950');
        expect(await vesting.availableToWithdraw('305', '200', ether('5000'), '100', ether(50))).to.be.equal(
          ether('4950'),
        );

        expect(await vesting.availableToWithdraw('305', '200', '5000', '100', '5000')).to.be.equal('0');
        expect(await vesting.availableToWithdraw('305', '200', ether('5000'), '100', ether(5000))).to.be.equal(
          ether('0'),
        );
      });

      it('should revert if already claimed is greater than accrued', async function () {
        await expect(vesting.availableToWithdraw('201', '200', '5000', '100', '51')).to.be.revertedWith(
          'SafeMath: subtraction overflow',
        );
      });
    });
  });

  describe('availableToWithdrawFor', () => {
    it('should return correct values before the start', async function () {
      expect(await vesting.hasStarted()).to.be.false;
      expect(await vesting.availableToWithdrawFor(0)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawFor(5000)).to.be.equal(ether(0));
    });

    it('should return correct values on 0th block', async function () {
      await time.advanceBlockTo(startBlock);
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.availableToWithdrawFor(0)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawFor(5000)).to.be.equal(ether(0));
    });

    it('should return correct values on the first block after the start', async function () {
      await time.advanceBlockTo(startBlockInt + 1);
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.availableToWithdrawFor(0)).to.be.equal(ether(500));
      expect(await vesting.availableToWithdrawFor(ether(500))).to.be.equal(ether(0));
    });

    it('should return correct values on the pre-last block', async function () {
      await time.advanceBlockTo(startBlockInt + parseInt(durationInBlocks) - 1);
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.hasEnded()).to.be.false;
      expect(await vesting.availableToWithdrawFor(ether(0))).to.be.equal(ether(4500));
      expect(await vesting.availableToWithdrawFor(ether(4000))).to.be.equal(ether(500));
      expect(await vesting.availableToWithdrawFor(ether(4500))).to.be.equal(ether(0));
    });

    it('should return correct values on the last block', async function () {
      await time.advanceBlockTo(startBlockInt + parseInt(durationInBlocks));
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.hasEnded()).to.be.true;
      expect(await vesting.availableToWithdrawFor(ether(0))).to.be.equal(ether(5000));
      expect(await vesting.availableToWithdrawFor(ether(4500))).to.be.equal(ether(500));
      expect(await vesting.availableToWithdrawFor(ether(5000))).to.be.equal(ether(0));
    });

    it('should return correct values after the last block', async function () {
      await time.advanceBlockTo(startBlockInt + parseInt(durationInBlocks) + 5);
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.hasEnded()).to.be.true;
      expect(await vesting.availableToWithdrawFor(ether(0))).to.be.equal(ether(5000));
      expect(await vesting.availableToWithdrawFor(ether(4500))).to.be.equal(ether(500));
      expect(await vesting.availableToWithdrawFor(ether(5000))).to.be.equal(ether(0));
    });
  });

  describe('availableToWithdrawForMember', () => {
    it('should return correct values before the start', async function () {
      expect(await vesting.hasStarted()).to.be.false;
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMember(member2)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMember(member3)).to.be.equal(ether(0));
      expect(await vesting.availableToWithdrawForMember(member4)).to.be.equal(ether(0));
    });

    it('should return correct values on the first block after the start', async function () {
      await time.advanceBlockTo(startBlockInt + 1);
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(500));
      expect(await vesting.availableToWithdrawForMember(member4)).to.be.equal(ether(0));
    });

    it('should return correct values on the last block', async function () {
      await time.advanceBlockTo(startBlockInt + parseInt(durationInBlocks));
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(5000));
      expect(await vesting.availableToWithdrawForMember(member4)).to.be.equal(ether(0));
    });

    it('should return correct values after the last block', async function () {
      await time.advanceBlockTo(startBlockInt + parseInt(durationInBlocks) + 5);
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.availableToWithdrawForMember(member1)).to.be.equal(ether(5000));
      expect(await vesting.availableToWithdrawForMember(member4)).to.be.equal(ether(0));
    });
  });

  describe('availableToWithdrawForMemberInTheNextBlock', () => {
    it('should return correct values before the start', async function () {
      await time.advanceBlockTo(startBlockInt);
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(500));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member2)).to.be.equal(ether(500));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member3)).to.be.equal(ether(500));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member4)).to.be.equal(ether(0));
    });

    it('should return correct values on the last block', async function () {
      await time.advanceBlockTo(startBlockInt + parseInt(durationInBlocks));
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(5000));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member2)).to.be.equal(ether(5000));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member3)).to.be.equal(ether(5000));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member4)).to.be.equal(ether(0));
    });

    it('should return correct values after the last block', async function () {
      await time.advanceBlockTo(startBlockInt + parseInt(durationInBlocks) + 5);
      expect(await vesting.hasStarted()).to.be.true;
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member1)).to.be.equal(ether(5000));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member2)).to.be.equal(ether(5000));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member3)).to.be.equal(ether(5000));
      expect(await vesting.availableToWithdrawForMemberInTheNextBlock(member4)).to.be.equal(ether(0));
    });
  });

  describe('withdraw', () => {
    beforeEach(async function () {
      await erc20.transfer(vesting.address, ether(3000), { from: owner });
    });

    it('should deny withdrawing before the vesting period start', async function () {
      expect(await vesting.hasStarted()).to.be.false;
      await expect(vesting.withdraw(bob, { from: member1 })).to.be.revertedWith(
        ' PPVesting::withdraw: Nothing to withdraw',
      );
    });

    it('should deny non-active member withdrawing tokens', async function () {
      await time.advanceBlockTo(startBlockInt + 1);
      await expect(vesting.withdraw(bob, { from: member4 })).to.be.revertedWith('PPVesting::withdraw: User not active');
    });

    it('should deny claiming when nothing was assigned', async function () {
      vesting = await PPVesting.new(owner, erc20.address, startBlock, 10, [member1, member2, member3], 5);
      await erc20.mint(vesting.address, ether(3000));
      await time.advanceBlockTo(startBlockInt + 1);
      await vesting.withdraw(bob, { from: member1 });
      await expect(vesting.withdraw(bob, { from: member1 })).to.be.revertedWith(
        'PPVesting::withdraw: Nothing to withdraw',
      );
    });
  });

  describe('transfer', () => {
    it('should allow transferring before the vesting period start', async function () {
      await vesting.transfer(bob, { from: member1 });

      const member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimed).to.be.equal('0');

      const bobDetails = await vesting.members(bob);
      expect(bobDetails.active).to.be.true;
      expect(bobDetails.transferred).to.be.false;
      expect(bobDetails.alreadyClaimed).to.be.equal('0');
    });

    it('should allow transferring after the vesting period ends', async function () {
      await time.advanceBlockTo(endBlockInt + 2);
      await vesting.transfer(bob, { from: member1 });

      const member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimed).to.be.equal('0');

      const bobDetails = await vesting.members(bob);
      expect(bobDetails.active).to.be.true;
      expect(bobDetails.transferred).to.be.false;
      expect(bobDetails.alreadyClaimed).to.be.equal('0');
    });

    it('should deny non-active member calling the method tokens', async function () {
      await expect(vesting.transfer(bob, { from: member4 })).to.be.revertedWith(
        'PPVesting::transfer: From member is inactive',
      );
    });

    it('should deny transferring to an already active member', async function () {
      await expect(vesting.transfer(member2, { from: member1 })).to.be.revertedWith('To address is already active');
    });

    it('should deny transferring to an already used account', async function () {
      await vesting.transfer(bob, { from: member1 });
      await expect(vesting.transfer(member1, { from: bob })).to.be.revertedWith(
        'PPVesting::transfer: To address has been already used',
      );
    });
  });

  describe('transferOwnership', () => {
    it('should allow an owner transferring ownership', async function () {
      expect(await vesting.owner()).to.be.equal(owner);
      await vesting.transferOwnership(alice, { from: owner });
      expect(await vesting.owner()).to.be.equal(alice);
    });

    it('should deny another owner transferring ownership', async function () {
      await expect(vesting.transferOwnership(alice, { from: bob })).to.be.revertedWith(
        'PPVesting::onlyOwner: Check failed',
      );
    });
  });

  describe('delegateVote', () => {
    let mockCVP;
    beforeEach(async function () {
      mockCVP = await MockCVP.new();
      vesting = await PPVesting.new(
        owner,
        mockCVP.address,
        startBlock,
        durationInBlocks,
        [member1, member2, member3],
        amountPerMember,
      );
    });

    it('should allow an owner transferring ownership', async function () {
      await vesting.delegateVote(bob, { from: owner });
      expect(await mockCVP.lastMsgSender()).to.be.equal(vesting.address);
      expect(await mockCVP.lastCalledDelegatee()).to.be.equal(bob);
    });

    it('should deny another owner transferring ownership', async function () {
      await expect(vesting.delegateVote(alice, { from: bob })).to.be.revertedWith('PPVesting::onlyOwner: Check failed');
    });
  });
});
