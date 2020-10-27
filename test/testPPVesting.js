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

async function getResTimestamp(res) {
  return (await web3.eth.getBlock(res.receipt.blockNumber)).timestamp.toString();
}

ERC20.numberFormat = 'String';
PPVesting.numberFormat = 'String';

contract('PPVesting Unit Tests', function ([, member1, member2, member3, member4, bob, vault]) {
  let vesting;
  let startV;
  let durationV;
  let endV;
  let startT;
  let endT;
  let durationT;
  const amountPerMember = ether('5000');
  let erc20;

  beforeEach(async function () {
    const currentBlock = await time.latestBlock();

    startV = parseInt(currentBlock) + 5;
    durationV = 10;

    startT = parseInt(currentBlock) + 10;
    durationT = 20;

    endV = startV + durationV;
    endT = startT + durationT;

    erc20 = await ERC20.new('Concentrated Voting Power', 'CVP');
    await erc20.mint(vault, ether(5000000));

    vesting = await PPVesting.new(
      erc20.address,
      startV,
      durationV,
      startT,
      durationT,
      [member1, member2, member3],
      amountPerMember,
    );
  });

  describe('initialization', () => {
    it('should assign correct values during initialization', async function () {
      expect(await vesting.token()).to.equal(erc20.address);
      expect(await vesting.startV()).to.equal(startV.toString());
      expect(await vesting.durationV()).to.equal(durationV.toString());
      expect(await vesting.startT()).to.equal(startT.toString());
      expect(await vesting.durationT()).to.equal(durationT.toString());
      expect(await vesting.endT()).to.equal(endT.toString());
      expect(await vesting.amountPerMember()).to.equal(amountPerMember);
      expect(await vesting.memberCount()).to.equal('3');

      const res = await vesting.members(member1);
      expect(res.active).to.be.true;
      expect(res.transferred).to.be.false;
      expect(res.alreadyClaimedVotes).to.be.equal('0');
      expect(res.alreadyClaimedTokens).to.be.equal('0');
    });

    it('should deny initialization with zero vote vesting duration', async function () {
      await expect(
        PPVesting.new(erc20.address, startV, 0, startT, 2, [member1, member2, member3], amountPerMember),
      ).to.be.revertedWith('PPVesting: Invalid durationV');
    });

    it('should deny initialization with zero token vesting duration', async function () {
      await expect(
        PPVesting.new(erc20.address, startV, 2, startT, 0, [member1, member2, member3], amountPerMember),
      ).to.be.revertedWith('PPVesting: Invalid durationT');
    });

    it('should deny initialization with zero amountPerMember value', async function () {
      await expect(
        PPVesting.new(erc20.address, startV, durationV, startT, durationT, [member1, member2, member3], 0),
      ).to.be.revertedWith('PPVesting: Invalid amount per member');
    });

    it('should deny initialization with an empty member list', async function () {
      await expect(
        PPVesting.new(erc20.address, startV, durationV, startT, durationT, [], amountPerMember),
      ).to.be.revertedWith('PPVesting: Empty member list');
    });

    it('should deny initialization with non-erc20 contract address', async function () {
      await expect(
        PPVesting.new(
          vesting.address,
          startV,
          durationV,
          startT,
          durationT,
          [member1, member2, member3],
          amountPerMember,
        ),
      ).to.be.revertedWith(
        "Transaction reverted: function selector was not recognized and there's no fallback function",
      );
    });

    it('should deny initialization with non-erc20 address', async function () {
      await expect(
        PPVesting.new(bob, startV, durationV, startT, durationT, [member1, member2, member3], amountPerMember),
      ).to.be.revertedWith('Transaction reverted: function call to a non-contract account');
    });
  });

  describe('get available pure function', () => {
    describe('when nothing claimed yet', () => {
      it('should return correct results before and on startBlock', async function () {
        expect(await vesting.getAvailable('199', '200', '5000', '100', '0')).to.be.equal('0');
        expect(await vesting.getAvailable('200', '200', '5000', '100', '0')).to.be.equal('0');
      });

      it('should return correct results on the first block of vesting period', async function () {
        // 5000 total / 100 blocks = 50 per block
        expect(await vesting.getAvailable('201', '200', '5000', '100', '0')).to.be.equal('50');
        expect(await vesting.getAvailable('201', '200', ether('5000'), '100', '0')).to.be.equal(ether('50'));
      });

      it('should return correct results on the first block of vesting period', async function () {
        // 5000 total / 100 blocks * 1 block = 50 for the first block
        expect(await vesting.getAvailable('201', '200', '5000', '100', '0')).to.be.equal('50');
        expect(await vesting.getAvailable('201', '200', ether('5000'), '100', '0')).to.be.equal(ether('50'));
      });

      it('should return correct results on the pre-last block of vesting period', async function () {
        // 5000 total / 100 blocks  * 99 blocks = 4950
        expect(await vesting.getAvailable('299', '200', '5000', '100', '0')).to.be.equal('4950');
        expect(await vesting.getAvailable('299', '200', ether('5000'), '100', '0')).to.be.equal(ether('4950'));
      });

      it('should return correct results on the last block of vesting period', async function () {
        // 5000 total
        expect(await vesting.getAvailable('300', '200', '5000', '100', '0')).to.be.equal('5000');
        expect(await vesting.getAvailable('300', '200', ether('5000'), '100', '0')).to.be.equal(ether('5000'));
      });

      it('should return correct results on the next after the last block of vesting period', async function () {
        // 5000 total
        expect(await vesting.getAvailable('301', '200', '5000', '100', '0')).to.be.equal('5000');
        expect(await vesting.getAvailable('301', '200', ether('5000'), '100', '0')).to.be.equal(ether('5000'));
      });
    });

    describe('when a partial amount is already claimed', () => {
      it('should return correct results on the first block of vesting period', async function () {
        // 5000 total / 100 blocks - 20 already claimed = 30
        expect(await vesting.getAvailable('201', '200', '5000', '100', '20')).to.be.equal('30');
        expect(await vesting.getAvailable('201', '200', ether('5000'), '100', ether(20))).to.be.equal(ether('30'));

        expect(await vesting.getAvailable('201', '200', '5000', '100', '50')).to.be.equal('0');
        expect(await vesting.getAvailable('201', '200', ether('5000'), '100', ether(50))).to.be.equal(ether('0'));
      });

      it('should return correct results on the last block of vesting period', async function () {
        expect(await vesting.getAvailable('300', '200', '5000', '100', '50')).to.be.equal('4950');
        expect(await vesting.getAvailable('300', '200', ether('5000'), '100', ether(50))).to.be.equal(ether('4950'));

        expect(await vesting.getAvailable('300', '200', '5000', '100', '5000')).to.be.equal('0');
        expect(await vesting.getAvailable('300', '200', ether('5000'), '100', ether(5000))).to.be.equal(ether('0'));
      });

      it('should return correct results after the last block of vesting period', async function () {
        expect(await vesting.getAvailable('305', '200', '5000', '100', '50')).to.be.equal('4950');
        expect(await vesting.getAvailable('305', '200', ether('5000'), '100', ether(50))).to.be.equal(ether('4950'));

        expect(await vesting.getAvailable('305', '200', '5000', '100', '5000')).to.be.equal('0');
        expect(await vesting.getAvailable('305', '200', ether('5000'), '100', ether(5000))).to.be.equal(ether('0'));
      });

      it('should revert if already claimed is greater than accrued', async function () {
        await expect(vesting.getAvailable('201', '200', '5000', '100', '51')).to.be.revertedWith(
          'SafeMath: subtraction overflow',
        );
      });
    });
  });

  describe('getAvailableTokens', () => {
    it('should return correct values before the start', async function () {
      expect(await vesting.hasTokenVestingStarted()).to.be.false;
      expect(await vesting.getAvailableTokens(0)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokens(5000)).to.be.equal(ether(0));
    });

    it('should return correct values on 0th block', async function () {
      await time.advanceBlockTo(startT);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokens(0)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokens(5000)).to.be.equal(ether(0));
    });

    it('should return correct values on the first block after the start', async function () {
      await time.advanceBlockTo(startT + 1);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokens(0)).to.be.equal(ether(250));
      expect(await vesting.getAvailableTokens(ether(250))).to.be.equal(ether(0));
    });

    it('should return correct values on the pre-last block', async function () {
      await time.advanceBlockTo(startT + parseInt(durationT) - 1);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.hasTokenVestingEnded()).to.be.false;
      expect(await vesting.getAvailableTokens(ether(0))).to.be.equal(ether(4750));
      expect(await vesting.getAvailableTokens(ether(4000))).to.be.equal(ether(750));
      expect(await vesting.getAvailableTokens(ether(4750))).to.be.equal(ether(0));
    });

    it('should return correct values on the last block', async function () {
      await time.advanceBlockTo(startT + parseInt(durationT));
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.hasTokenVestingEnded()).to.be.true;
      expect(await vesting.getAvailableTokens(ether(0))).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokens(ether(4500))).to.be.equal(ether(500));
      expect(await vesting.getAvailableTokens(ether(5000))).to.be.equal(ether(0));
    });

    it('should return correct values after the last block', async function () {
      await time.advanceBlockTo(startT + parseInt(durationT) + 5);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.hasTokenVestingEnded()).to.be.true;
      expect(await vesting.getAvailableTokens(ether(0))).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokens(ether(4500))).to.be.equal(ether(500));
      expect(await vesting.getAvailableTokens(ether(5000))).to.be.equal(ether(0));
    });
  });

  describe('getAvailableTokensForMember', () => {
    it('should return correct values before the start', async function () {
      expect(await vesting.hasTokenVestingStarted()).to.be.false;
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMember(member2)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMember(member3)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokensForMember(member4)).to.be.equal(ether(0));
    });

    it('should return correct values on the first block after the start', async function () {
      await time.advanceBlockTo(startT + 1);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(250));
      expect(await vesting.getAvailableTokensForMember(member4)).to.be.equal(ether(0));
    });

    it('should return correct values on the last block', async function () {
      await time.advanceBlockTo(startT + parseInt(durationT));
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMember(member4)).to.be.equal(ether(0));
    });

    it('should return correct values after the last block', async function () {
      await time.advanceBlockTo(startT + parseInt(durationT) + 5);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMember(member4)).to.be.equal(ether(0));
    });
  });

  describe('availableTokensForMemberInTheNextBlock', () => {
    it('should return correct values before the start', async function () {
      await time.advanceBlockTo(startT);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(250));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member2)).to.be.equal(ether(250));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member3)).to.be.equal(ether(250));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member4)).to.be.equal(ether(0));
    });

    it('should return correct values on the last block', async function () {
      await time.advanceBlockTo(startT + parseInt(durationT));
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member2)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member3)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member4)).to.be.equal(ether(0));
    });

    it('should return correct values after the last block', async function () {
      await time.advanceBlockTo(startT + parseInt(durationT) + 5);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member1)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member2)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member3)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberInTheNextBlock(member4)).to.be.equal(ether(0));
    });
  });

  describe('claimVotes', () => {
    it('should deny claiming before the vesting period start', async function () {
      expect(await vesting.hasVoteVestingStarted()).to.be.false;
      await expect(vesting.claimVotes(member1)).to.be.revertedWith(
        ' PPVesting::claimVotes: Nothing to claim',
      );
    });

    it('should deny claiming for a non-active member', async function () {
      await time.advanceBlockTo(startV + 1);
      await expect(vesting.claimVotes(member4)).to.be.revertedWith('PPVesting::claimVotes: User not active');
    });

    it('should deny claiming when nothing was assigned', async function () {
      vesting = await PPVesting.new(erc20.address, startV, 15, startT, 10, [member1, member2, member3], 5);
      await erc20.mint(vesting.address, ether(3000));
      await time.advanceBlockTo(startT + 1);
      await vesting.claimVotes(member1);
      await expect(vesting.claimVotes(member1)).to.be.revertedWith(
        'PPVesting::claimVotes: Nothing to claim',
      );
    });

    describe('increment with non-empty balance', () => {
      let firstClaimedAt;
      let secondClaimedAt;
      beforeEach(async function() {
        await time.advanceBlockTo(startV);
        // 500
        let res = await vesting.claimVotes(member1);
        firstClaimedAt = res.receipt.blockNumber;
        // 1000
        res = await vesting.claimVotes(member2);
        secondClaimedAt = res.receipt.blockNumber;
      });

      it('should increment an empty non-owned votes on increase', async function() {
        expect(await vesting.voteDelegations(member1)).to.be.equal(constants.ZERO_ADDRESS);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(500));
        const res = await vesting.claimVotes(member1);
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(1500));

        await time.advanceBlock();
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(500));
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(1500));
      })

      it('should increment an empty self-owned votes on increase', async function() {
        await vesting.delegateVotes(member2, { from: member1 });
        await vesting.delegateVotes(member1, { from: member1 });
        expect(await vesting.voteDelegations(member1)).to.be.equal(member1);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(500));
        const res = await vesting.claimVotes(member1);
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(2500));

        await time.advanceBlock();
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(500));
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(2500));
      })

      it('should increment an empty self-owned votes on increase', async function() {
        await vesting.delegateVotes(member2, { from: member1 });
        expect(await vesting.voteDelegations(member1)).to.be.equal(member2);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(500));
        expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(1000));
        const res = await vesting.claimVotes(member1);
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(2000));
        expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(1000));

        await time.advanceBlock();

        // member1
        expect(await vesting.getPriorVotes(member1, firstClaimedAt)).to.be.equal(ether(500));
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(0));
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(0));
        // member2
        expect(await vesting.getPriorVotes(member2, secondClaimedAt)).to.be.equal(ether(1000));
        // 1000 (member2) + 500 (from member1)
        expect(await vesting.getPriorVotes(member2, parseInt(claimedAt) - 1)).to.be.equal(ether(1500));
        // 1000 (member2) + 2000 (from member1)
        expect(await vesting.getPriorVotes(member2, claimedAt)).to.be.equal(ether(3000));
      })
    });

    describe('decrement with non-empty balance with no tokens', () => {
      let firstClaimedAt;
      let secondClaimedAt;
      beforeEach(async function() {
        await erc20.transfer(vesting.address, ether(100000), { from: vault})
        await time.advanceBlockTo(endT - 5);
        // 5000/4000
        let res = await vesting.claimTokens(member1, { from: member1 });
        firstClaimedAt = res.receipt.blockNumber;
        res = await vesting.claimTokens(member2, { from: member2 });
        secondClaimedAt = res.receipt.blockNumber;
      });

      it('should decrement an empty non-owned votes on increase', async function() {
        expect(await vesting.voteDelegations(member1)).to.be.equal(constants.ZERO_ADDRESS);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(5000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(4000));
        const res = await vesting.claimTokens(member1, { from: member1 });
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(5000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(4500));

        await time.advanceBlock();
        // 5000 - 4000
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(1000));
        // -500 = (5000 - 4500) - (5000 - 4000)
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(500));
      })

      it('should increment an empty self-owned votes on increase', async function() {
        await vesting.delegateVotes(member2, { from: member1 });
        await vesting.delegateVotes(member1, { from: member1 });
        expect(await vesting.voteDelegations(member1)).to.be.equal(member1);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(5000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(4000));
        const res = await vesting.claimTokens(member1, { from: member1 });
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(5000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(5000));

        await time.advanceBlock();
        // 5000 - 4000
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(1000));
        // -1000 = (5000 - 4000) - (5000 - 5000)
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(0));
      })

      it('should increment an empty self-owned votes on increase', async function() {
        await vesting.delegateVotes(member2, { from: member1 });
        expect(await vesting.voteDelegations(member1)).to.be.equal(member2);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(5000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(4000));
        expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(5000));
        expect((await vesting.members(member2)).alreadyClaimedTokens).to.be.equal(ether(4250));
        const res = await vesting.claimTokens(member1, { from: member1 });
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(5000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(4750));
        expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(5000));
        expect((await vesting.members(member2)).alreadyClaimedTokens).to.be.equal(ether(4250));

        await time.advanceBlock();

        // member1
        // 5000 - 1000
        expect(await vesting.getPriorVotes(member1, firstClaimedAt)).to.be.equal(ether(1000));
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(0));
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(0));
        // member2
        // 750 (member2)
        expect(await vesting.getPriorVotes(member2, secondClaimedAt)).to.be.equal(ether(750));
        // 750 (member2) + 1000 (member1)
        expect(await vesting.getPriorVotes(member2, parseInt(claimedAt) - 1)).to.be.equal(ether(1750));
        // ((5000 - 4750) - (5000 - 4000) = -750 (member1 adjustedVotes)
        expect(await vesting.getPriorVotes(member2, claimedAt)).to.be.equal(ether(1000));
      })
    });
  });

  describe('claimTokens', () => {
    beforeEach(async function () {
      await erc20.transfer(vesting.address, ether(3000), { from: vault });
    });

    it('should deny withdrawing before the vesting period start', async function () {
      expect(await vesting.hasTokenVestingStarted()).to.be.false;
      await expect(vesting.claimTokens(bob, { from: member1 })).to.be.revertedWith(
        ' PPVesting::claimTokens: Nothing to claim',
      );
    });

    it('should deny non-active member withdrawing tokens', async function () {
      await time.advanceBlockTo(startT + 1);
      await expect(vesting.claimTokens(bob, { from: member4 })).to.be.revertedWith('PPVesting::claimTokens: User not active');
    });

    it('should deny claiming when nothing was assigned', async function () {
      vesting = await PPVesting.new(erc20.address, startV, 15, startT, 10, [member1, member2, member3], 5);
      await erc20.mint(vesting.address, ether(3000));
      await time.advanceBlockTo(startT + 1);
      await vesting.claimTokens(bob, { from: member1 });
      await expect(vesting.claimTokens(bob, { from: member1 })).to.be.revertedWith(
        'PPVesting::claimTokens: Nothing to claim',
      );
    });
  });

  describe('transfer', () => {
    it('should allow transferring before the vesting period start', async function () {
      await vesting.transfer(bob, { from: member1 });

      const member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimedTokens).to.be.equal('0');

      const bobDetails = await vesting.members(bob);
      expect(bobDetails.active).to.be.true;
      expect(bobDetails.transferred).to.be.false;
      expect(bobDetails.alreadyClaimedTokens).to.be.equal('0');
    });

    it('should allow transferring after the vesting period ends', async function () {
      await time.advanceBlockTo(endT + 2);
      await vesting.transfer(bob, { from: member1 });

      const member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimedTokens).to.be.equal('0');

      const bobDetails = await vesting.members(bob);
      expect(bobDetails.active).to.be.true;
      expect(bobDetails.transferred).to.be.false;
      expect(bobDetails.alreadyClaimedTokens).to.be.equal('0');
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
});
