const { ether: etherBN, time, constants, expectEvent } = require('@openzeppelin/test-helpers');
const { solidity } = require('ethereum-waffle');
const { evmMine, evmSetNextBlockTimestamp } = require('./helpers');

const chai = require('chai');
const PPTimedVesting = artifacts.require('PPTimedVesting');
const ERC20 = artifacts.require('ERC20PresetMinterPauser');

chai.use(solidity);
const { expect } = chai;
const { BN } = web3.utils;

function ether(value) {
  return etherBN(String(value)).toString();
}

/**
 * @param { string } amount
 * @param { string } times
 * @returns {string}
 */
function bnMul(amount, times) {
  return (BigInt(amount) * BigInt(times)).toString();
}

ERC20.numberFormat = 'String';
PPTimedVesting.numberFormat = 'String';

const ADDRESS_1 = '0x0000000000000000000000000000000000000001';

contract('PPTimedVesting Unit Tests', function ([, member1, member2, member3, member4, owner, bob, vault, stub]) {
  let vesting;
  let startV;
  let durationV;
  let startT;
  let endT;
  let durationT;
  const amountPerMember = ether('5000');
  let erc20;

  beforeEach(async function () {
    const currentTimestamp = await time.latest();

    startV = currentTimestamp.toNumber() + 5;
    durationV = 10;

    startT = currentTimestamp.toNumber() + 10;
    durationT = 20;

    endT = startT + durationT;

    erc20 = await ERC20.new('Concentrated Voting Power', 'CVP');
    await erc20.mint(vault, ether(5000000));

    vesting = await PPTimedVesting.new(
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
        PPTimedVesting.new(erc20.address, startV, 0, startT, 2, [member1, member2, member3], amountPerMember),
      ).to.be.revertedWith('Vesting: Invalid durationV');
    });

    it('should deny initialization with zero token vesting duration', async function () {
      await expect(
        PPTimedVesting.new(erc20.address, startV, 2, startT, 0, [member1, member2, member3], amountPerMember),
      ).to.be.revertedWith('Vesting: Invalid durationT');
    });

    it('should deny initialization with zero amountPerMember value', async function () {
      await expect(
        PPTimedVesting.new(erc20.address, startV, durationV, startT, durationT, [member1, member2, member3], 0),
      ).to.be.revertedWith('Vesting: Invalid amount per member');
    });

    it('should deny initialization with an empty member list', async function () {
      await expect(
        PPTimedVesting.new(erc20.address, startV, durationV, startT, durationT, [], amountPerMember),
      ).to.be.revertedWith('Vesting: Empty member list');
    });

    it('should deny initialization with non-erc20 contract address', async function () {
      await expect(
        PPTimedVesting.new(
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
        PPTimedVesting.new(bob, startV, durationV, startT, durationT, [member1, member2, member3], amountPerMember),
      ).to.be.revertedWith('Transaction reverted: function call to a non-contract account');
    });
  });

  describe('disableMember()/renounceMembership', async function () {
    beforeEach(async function () {
      await vesting.transferOwnership(owner);
      await erc20.transfer(vesting.address, bnMul(amountPerMember, 3), { from: vault });
    });

    describe('with no vote claims', () => {
      beforeEach(async function () {
        let res = await vesting.members(member1);
        expect(res.active).to.be.true;
        expect(res.transferred).to.be.false;
        expect(res.alreadyClaimedVotes).to.be.equal('0');
        expect(res.alreadyClaimedTokens).to.be.equal('0');
        expect(await erc20.balanceOf(vesting.address)).to.be.equal(bnMul(amountPerMember, 3));
      });

      it('should allow the owner disabling a member with no any claims and no delegations', async function () {
        this.res = await vesting.disableMember(member1, { from: owner });
      });

      it('should allow the owner disabling a member with no any claims and no delegations', async function () {
        this.res = await vesting.renounceMembership({ from: member1 });
      });

      afterEach(async function () {
        expectEvent(this.res, 'DisableMember', {
          member: member1,
          tokensRemainder: amountPerMember,
        });
        let res = await vesting.members(member1);
        expect(res.active).to.be.false;
        expect(res.transferred).to.be.false;
        expect(res.alreadyClaimedVotes).to.be.equal('0');
        expect(res.alreadyClaimedTokens).to.be.equal('0');
        expect(await vesting.voteDelegations(member1), constants.ZERO_ADDRESS);
        expect(await vesting.numCheckpoints(member1), 0);
        expect(await vesting.checkpoints(member1, 0), 0);
        expect(await vesting.checkpoints(member1, 1), 0);
        expect(await vesting.checkpoints(member1, 2), 0);
        expect(await erc20.balanceOf(vesting.address)).to.be.equal(bnMul(amountPerMember, 2));
        expect(await erc20.balanceOf(ADDRESS_1)).to.be.equal(ether(5000));
      });
    });

    describe('with no vote claims but delegations', () => {
      beforeEach(async function () {
        let res = await vesting.members(member1);
        expect(res.active).to.be.true;
        expect(res.transferred).to.be.false;
        expect(res.alreadyClaimedVotes).to.be.equal('0');
        expect(res.alreadyClaimedTokens).to.be.equal('0');
        expect(await vesting.numCheckpoints(member1)).to.be.equal('0');
        expect(await vesting.numCheckpoints(member2)).to.be.equal('0');
        await vesting.delegateVotes(member2, { from: member1 });
        expect(await vesting.numCheckpoints(member1)).to.be.equal('1');
        expect(await vesting.numCheckpoints(member2)).to.be.equal('1');
        expect(await vesting.voteDelegations(member1)).to.be.equal(member2);
      });

      it('should allow the owner disabling a member with no any claims and no delegations', async function () {
        this.res = await vesting.disableMember(member1, { from: owner });
      });

      it('should allow the owner disabling a member with no any claims and no delegations', async function () {
        this.res = await vesting.renounceMembership({ from: member1 });
      });

      afterEach(async function () {
        expectEvent(this.res, 'DisableMember', {
          member: member1,
          tokensRemainder: amountPerMember,
        });
        let res = await vesting.members(member1);
        expect(res.active).to.be.false;
        expect(res.transferred).to.be.false;
        expect(res.alreadyClaimedVotes).to.be.equal('0');
        expect(res.alreadyClaimedTokens).to.be.equal('0');
        expect(await vesting.voteDelegations(member1)).to.be.equal(constants.ZERO_ADDRESS);

        expect(await vesting.numCheckpoints(member1)).to.be.equal('1');
        expect((await vesting.checkpoints(member1, 0)).votes).to.be.equal('0');
        expect((await vesting.checkpoints(member1, 1)).votes).to.be.equal('0');

        expect(await vesting.numCheckpoints(member2)).to.be.equal('1');
        expect((await vesting.checkpoints(member2, 0)).votes).to.be.equal('0');
        expect((await vesting.checkpoints(member2, 1)).votes).to.be.equal('0');

        expect(await erc20.balanceOf(ADDRESS_1)).to.be.equal(ether(5000));
      });
    });

    describe('with one vote claim and no delegations', () => {
      beforeEach(async function () {
        await evmSetNextBlockTimestamp(startV + 8);
        await vesting.claimTokens(member2, { from: member1 });
        let res = await vesting.members(member1);
        expect(res.active).to.be.true;
        expect(res.transferred).to.be.false;
        expect(res.alreadyClaimedVotes).to.be.equal(ether(4000));
        expect(res.alreadyClaimedTokens).to.be.equal(ether(750));
        expect(await vesting.numCheckpoints(member1)).to.be.equal('1');
        expect((await vesting.checkpoints(member1, 0)).votes).to.be.equal(ether('3250'));
        expect((await vesting.checkpoints(member1, 1)).votes).to.be.equal('0');
      });

      it('should allow the owner disabling a member with no any claims and no delegations', async function () {
        this.res = await vesting.disableMember(member1, { from: owner });
      });

      it('should allow the owner disabling a member with no any claims and no delegations', async function () {
        this.res = await vesting.renounceMembership({ from: member1 });
      });

      afterEach(async function () {
        expectEvent(this.res, 'DisableMember', {
          member: member1,
          tokensRemainder: ether(4250),
        });
        let res = await vesting.members(member1);
        expect(res.active).to.be.false;
        expect(res.transferred).to.be.false;
        expect(res.alreadyClaimedVotes).to.be.equal(ether(4000));
        expect(res.alreadyClaimedTokens).to.be.equal(ether(750));
        expect(await vesting.voteDelegations(member1)).to.be.equal(constants.ZERO_ADDRESS);
        expect(await vesting.numCheckpoints(member1)).to.be.equal('1');
        expect((await vesting.checkpoints(member1, 0)).votes).to.be.equal(ether('3250'));
        expect((await vesting.checkpoints(member1, 1)).votes).to.be.equal('0');
        expect(await erc20.balanceOf(ADDRESS_1)).to.be.equal(ether(4250));
      });
    });

    describe('with vote claims and delegations', () => {
      beforeEach(async function () {
        await evmSetNextBlockTimestamp(startV + 6);
        await vesting.claimTokens(stub, { from: member1 });
        await vesting.delegateVotes(member2, { from: member1 });
        await evmSetNextBlockTimestamp(startV + 8);
        await vesting.claimTokens(stub, { from: member1 });

        let res = await vesting.members(member1);
        expect(res.active).to.be.true;
        expect(res.transferred).to.be.false;
        expect(res.alreadyClaimedVotes).to.be.equal(ether(4000));
        expect(res.alreadyClaimedTokens).to.be.equal(ether(750));

        expect(await vesting.numCheckpoints(member1)).to.be.equal('2');
        expect(await vesting.numCheckpoints(member2)).to.be.equal('2');

        expect((await vesting.checkpoints(member1, 0)).votes).to.be.equal(ether('2750'));
        expect((await vesting.checkpoints(member1, 1)).votes).to.be.equal('0');
        expect((await vesting.checkpoints(member1, 2)).votes).to.be.equal('0');
        expect((await vesting.checkpoints(member2, 0)).votes).to.be.equal(ether('2750'));
        expect((await vesting.checkpoints(member2, 1)).votes).to.be.equal(ether('3250'));
        expect((await vesting.checkpoints(member2, 2)).votes).to.be.equal('0');
        expect(await vesting.voteDelegations(member1)).to.be.equal(member2);
      });

      it('should allow the owner disabling a member with no any claims and no delegations', async function () {
        this.res = await vesting.disableMember(member1, { from: owner });
      });

      it('should allow the owner disabling a member with no any claims and no delegations', async function () {
        this.res = await vesting.renounceMembership({ from: member1 });
      });

      afterEach(async function () {
        expectEvent(this.res, 'DisableMember', {
          member: member1,
          tokensRemainder: ether(4250),
        });
        let res = await vesting.members(member1);
        expect(res.active).to.be.false;
        expect(res.transferred).to.be.false;
        expect(res.alreadyClaimedVotes).to.be.equal(ether(4000));
        expect(res.alreadyClaimedTokens).to.be.equal(ether(750));
        expect(await vesting.voteDelegations(member1)).to.be.equal(constants.ZERO_ADDRESS);

        expect(await vesting.numCheckpoints(member1)).to.be.equal('2');
        expect(await vesting.numCheckpoints(member2)).to.be.equal('3');

        expect((await vesting.checkpoints(member1, 0)).votes).to.be.equal(ether('2750'));
        expect((await vesting.checkpoints(member1, 1)).votes).to.be.equal('0');
        expect((await vesting.checkpoints(member1, 2)).votes).to.be.equal('0');
        expect((await vesting.checkpoints(member2, 0)).votes).to.be.equal(ether('2750'));
        expect((await vesting.checkpoints(member2, 1)).votes).to.be.equal(ether('3250'));
        expect((await vesting.checkpoints(member2, 2)).votes).to.be.equal('0');
        expect((await vesting.checkpoints(member2, 3)).votes).to.be.equal('0');

        expect(await erc20.balanceOf(ADDRESS_1)).to.be.equal(ether(4250));
      });
    });

    describe('disableMember()', () => {
      it('should deny non-owner calling the method', async function () {
        await expect(vesting.disableMember(member1, { from: member1 })).to.be.revertedWith(
          ' Ownable: caller is not the owner',
        );
      });

      it('should deny disabling non-existent member', async function () {
        await expect(vesting.disableMember(stub, { from: owner })).to.be.revertedWith(
          'Vesting::_disableMember: The member is inactive',
        );
      });

      it('should deny disabling an already disabled member', async function () {
        await vesting.disableMember(member1, { from: owner });
        await expect(vesting.disableMember(member1, { from: owner })).to.be.revertedWith(
          'Vesting::_disableMember: The member is inactive',
        );
      });
    });

    describe('renounceMembership()', () => {
      it('should deny renouncing for non-existent member', async function () {
        await expect(vesting.renounceMembership({ from: stub })).to.be.revertedWith(
          'Vesting::_disableMember: The member is inactive',
        );
      });

      it('should deny renouncing for an already disabled member', async function () {
        await vesting.renounceMembership({ from: member1 });
        await expect(vesting.renounceMembership({ from: member1 })).to.be.revertedWith(
          'Vesting::_disableMember: The member is inactive',
        );
      });
    });
  });

  describe('increaseDurationT()', async function () {
    let prevStartT;
    let prevEndT;
    beforeEach(async function () {
      await vesting.transferOwnership(owner);
      prevStartT = await vesting.startT();
      prevEndT = await vesting.endT();
    });

    it('should allow the owner increasing durationT', async function () {
      const newDuration = time.duration.days(180);
      const newEndT = new BN(prevStartT).add(newDuration).toString();
      const res = await vesting.increaseDurationT(newDuration.toString(), { from: owner });
      expectEvent(res, 'IncreaseDurationT', {
        prevDurationT: '20',
        prevEndT: prevEndT,
        newDurationT: time.duration.days(180).toString(),
        newEndT: newEndT,
      });
      expect(await vesting.durationT()).to.be.equal(newDuration.toString());
      expect(await vesting.endT()).to.be.equal(newEndT);
    });

    it('should deny increasing duration by less than the current', async function () {
      await expect(vesting.increaseDurationT(19, { from: owner })).to.be.revertedWith(
        'Vesting::increaseDurationT: Too small duration',
      );
    });

    it('should deny increasing duration by more than 180 days', async function () {
      await expect(vesting.increaseDurationT(time.duration.days(181), { from: owner })).to.be.revertedWith(
        'Vesting::increaseDurationT: Too big duration',
      );
    });

    it('should deny non-owner calling the method', async function () {
      await expect(vesting.increaseDurationT(21, { from: bob })).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('increasePersonalDurationsT()', async function () {
    let prevStartT;
    let prevEndT;
    beforeEach(async function () {
      await vesting.transferOwnership(owner);
      prevStartT = await vesting.startT();
      prevEndT = await vesting.endT();
    });

    it('should allow the owner increasing durationT for a member', async function () {
      const newDuration = time.duration.days(179);
      const newEndT = new BN(prevStartT).add(newDuration).toString();
      const res = await vesting.increasePersonalDurationsT([member1], [newDuration.toString()], { from: owner });
      expectEvent(res, 'IncreasePersonalDurationT', {
        prevEvaluatedDurationT: '20',
        prevEvaluatedEndT: prevEndT,
        prevPersonalDurationT: '0',
        newPersonalDurationT: time.duration.days(179).toString(),
        newPersonalEndT: newEndT,
      });
      const member = await vesting.members(member1);

      expect(await member.personalDurationT).to.be.equal(newDuration.toString());
      expect(await vesting.getMemberDurationT(member1)).to.be.equal(newDuration.toString());
      expect(await vesting.getMemberEndT(member1)).to.be.equal(newEndT);
    });

    it('should deny mismatching argument lengths', async function () {
      await expect(vesting.increasePersonalDurationsT([member1], [19, 20], { from: owner })).to.be.revertedWith(
        'LENGTH_MISMATCH',
      );
    });

    it('should deny increasing duration by less than the current global', async function () {
      await expect(vesting.increasePersonalDurationsT([member1], [19], { from: owner })).to.be.revertedWith(
        'Vesting::increasePersonalDurationT: Too small duration',
      );
    });

    it('should deny increasing duration for an invalid member', async function () {
      await expect(vesting.increasePersonalDurationsT([bob], [19], { from: owner })).to.be.revertedWith(
        'Vesting::increasePersonalDurationT: Too small duration',
      );
    });

    it('should deny increasing duration lower than global', async function () {
      await vesting.increasePersonalDurationsT([member1], [time.duration.days(100)], { from: owner });

      await vesting.increaseDurationT(time.duration.days(120), { from: owner });

      await expect(vesting.increasePersonalDurationsT([member1], [time.duration.days(110)], { from: owner })).to.be.revertedWith(
        'Vesting::increasePersonalDurationT: Less than durationT',
      );
    });

    it('should deny increasing duration by less than the current personal', async function () {
      const firstDuration = time.duration.days(100);
      const invalidSecondDuration1 = time.duration.days(100);
      const validSecondDuration = time.duration.days(101);
      await vesting.increasePersonalDurationsT([member1], [firstDuration.toString()], { from: owner });
      await expect(
        vesting.increasePersonalDurationsT([member1], [invalidSecondDuration1.toString()], { from: owner }),
      ).to.be.revertedWith('Vesting::increasePersonalDurationT: Too small duration');
      await vesting.increasePersonalDurationsT([member1], [validSecondDuration.toString()], { from: owner });
    });

    it('should deny increasing duration by more than 180 days form 0 personal', async function () {
      await expect(
        vesting.increasePersonalDurationsT([member1], [time.duration.days(181)], { from: owner }),
      ).to.be.revertedWith('Vesting::increasePersonalDurationT: Too big duration');
    });

    it('should deny increasing duration by more than 180 days from non-0 personal', async function () {
      const firstDuration = time.duration.days(100);
      const invalidSecondDuration = time.duration.days(281);
      const validSecondDuration = time.duration.days(280);
      await vesting.increasePersonalDurationsT([member1], [firstDuration.toString()], { from: owner });
      await expect(
        vesting.increasePersonalDurationsT([member1], [invalidSecondDuration.toString()], { from: owner }),
      ).to.be.revertedWith('Vesting::increasePersonalDurationT: Too big duration');
      await vesting.increasePersonalDurationsT([member1], [validSecondDuration.toString()], { from: owner });
    });

    it('should deny non-owner calling the method', async function () {
      await expect(vesting.increasePersonalDurationsT([member1], [21], { from: bob })).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('get available pure function', () => {
    describe('when nothing claimed yet', () => {
      it('should return correct results before and on start timestamp', async function () {
        expect(await vesting.getAvailable('199', '200', '5000', '100', '0')).to.be.equal('0');
        expect(await vesting.getAvailable('200', '200', '5000', '100', '0')).to.be.equal('0');
      });

      it('should return correct results on the first timestamp of vesting period', async function () {
        // 5000 total / 100 seconds = 50 per second
        expect(await vesting.getAvailable('201', '200', '5000', '100', '0')).to.be.equal('50');
        expect(await vesting.getAvailable('201', '200', ether('5000'), '100', '0')).to.be.equal(ether('50'));
      });

      it('should return correct results on the first second of vesting period', async function () {
        // 5000 total / 100 seconds * 1 second = 50 for the first second
        expect(await vesting.getAvailable('201', '200', '5000', '100', '0')).to.be.equal('50');
        expect(await vesting.getAvailable('201', '200', ether('5000'), '100', '0')).to.be.equal(ether('50'));
      });

      it('should return correct results on the pre-last second of vesting period', async function () {
        // 5000 total / 100 seconds  * 99 seconds = 4950
        expect(await vesting.getAvailable('299', '200', '5000', '100', '0')).to.be.equal('4950');
        expect(await vesting.getAvailable('299', '200', ether('5000'), '100', '0')).to.be.equal(ether('4950'));
      });

      it('should return correct results on the last second of vesting period', async function () {
        // 5000 total
        expect(await vesting.getAvailable('300', '200', '5000', '100', '0')).to.be.equal('5000');
        expect(await vesting.getAvailable('300', '200', ether('5000'), '100', '0')).to.be.equal(ether('5000'));
      });

      it('should return correct results on the next after the last second of vesting period', async function () {
        // 5000 total
        expect(await vesting.getAvailable('301', '200', '5000', '100', '0')).to.be.equal('5000');
        expect(await vesting.getAvailable('301', '200', ether('5000'), '100', '0')).to.be.equal(ether('5000'));
      });
    });

    describe('when a partial amount is already claimed', () => {
      it('should return correct results on the first second of vesting period', async function () {
        // 5000 total / 100 seconds - 20 already claimed = 30
        expect(await vesting.getAvailable('201', '200', '5000', '100', '20')).to.be.equal('30');
        expect(await vesting.getAvailable('201', '200', ether('5000'), '100', ether(20))).to.be.equal(ether('30'));

        expect(await vesting.getAvailable('201', '200', '5000', '100', '50')).to.be.equal('0');
        expect(await vesting.getAvailable('201', '200', ether('5000'), '100', ether(50))).to.be.equal(ether('0'));
      });

      it('should return correct results on the last second of vesting period', async function () {
        expect(await vesting.getAvailable('300', '200', '5000', '100', '50')).to.be.equal('4950');
        expect(await vesting.getAvailable('300', '200', ether('5000'), '100', ether(50))).to.be.equal(ether('4950'));

        expect(await vesting.getAvailable('300', '200', '5000', '100', '5000')).to.be.equal('0');
        expect(await vesting.getAvailable('300', '200', ether('5000'), '100', ether(5000))).to.be.equal(ether('0'));
      });

      it('should return correct results after the last second of vesting period', async function () {
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
      expect(await vesting.getAvailableTokens(0, durationT)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokens(5000, durationT)).to.be.equal(ether(0));
    });

    it('should return correct values on 0th second', async function () {
      await evmMine(startT);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokens(0, durationT)).to.be.equal(ether(0));
      expect(await vesting.getAvailableTokens(5000, durationT)).to.be.equal(ether(0));
    });

    it('should return correct values on the first second after the start', async function () {
      await evmMine(startT + 1);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokens(0, durationT)).to.be.equal(ether(250));
      expect(await vesting.getAvailableTokens(ether(250), durationT)).to.be.equal(ether(0));
    });

    it('should return correct values on the pre-last second', async function () {
      await evmMine(startT + parseInt(durationT) - 1);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.hasTokenVestingEnded()).to.be.false;
      expect(await vesting.getAvailableTokens(ether(0), durationT)).to.be.equal(ether(4750));
      expect(await vesting.getAvailableTokens(ether(4000), durationT)).to.be.equal(ether(750));
      expect(await vesting.getAvailableTokens(ether(4750), durationT)).to.be.equal(ether(0));
    });

    it('should return correct values on the last second', async function () {
      await evmMine(startT + parseInt(durationT));
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.hasTokenVestingEnded()).to.be.true;
      expect(await vesting.getAvailableTokens(ether(0), durationT)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokens(ether(4500), durationT)).to.be.equal(ether(500));
      expect(await vesting.getAvailableTokens(ether(5000), durationT)).to.be.equal(ether(0));
    });

    it('should return correct values after the last second', async function () {
      await evmMine(startT + parseInt(durationT) + 5);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.hasTokenVestingEnded()).to.be.true;
      expect(await vesting.getAvailableTokens(ether(0), durationT)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokens(ether(4500), durationT)).to.be.equal(ether(500));
      expect(await vesting.getAvailableTokens(ether(5000), durationT)).to.be.equal(ether(0));
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

    it('should return correct values on the first second after the start', async function () {
      await evmMine(startT + 1);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(250));
      expect(await vesting.getAvailableTokensForMember(member4)).to.be.equal(ether(0));
    });

    it('should return correct values on the last second', async function () {
      await evmMine(startT + parseInt(durationT));
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMember(member4)).to.be.equal(ether(0));
    });

    it('should calculate for global last second for a member with a custom endT', async function () {
      await vesting.increasePersonalDurationsT([member1], [durationT * 2]);
      await evmMine(startT + parseInt(durationT));
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(2500));
      expect(await vesting.getAvailableTokensForMember(member4)).to.be.equal(ether(0));
    });

    it('should return correct values after the last second', async function () {
      await evmMine(startT + parseInt(durationT) + 5);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMember(member4)).to.be.equal(ether(0));
    });
  });

  describe('getAvailableTokensForMemberAt', () => {
    it('should return correct values before the start', async function () {
      await evmMine(startT);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;

      let current = (await time.latest()).toNumber();
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member1)).to.be.equal(ether(250));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member2)).to.be.equal(ether(250));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member3)).to.be.equal(ether(250));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member4)).to.be.equal(ether(0));
    });

    it('should return correct values on the last block', async function () {
      await evmMine(startT + parseInt(durationT));
      expect(await vesting.hasTokenVestingStarted()).to.be.true;

      let current = (await time.latest()).toNumber();
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member1)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member2)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member3)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member4)).to.be.equal(ether(0));
    });

    it('should return correct values after the last block', async function () {
      await evmMine(startT + parseInt(durationT) + 5);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;

      let current = (await time.latest()).toNumber();
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member1)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member2)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member3)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member4)).to.be.equal(ether(0));
    });

    it('should return correct values for a member with a personal durationT', async function () {
      await evmMine(startT + parseInt(durationT) + 5);
      expect(await vesting.hasTokenVestingStarted()).to.be.true;
      await vesting.increasePersonalDurationsT([member2], [durationT * 2]);

      let current = (await time.latest()).toNumber();
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member1)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member2)).to.be.equal(ether(3375));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member3)).to.be.equal(ether(5000));
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member4)).to.be.equal(ether(0));

      await evmMine(startT + parseInt(durationT * 2) + 5);
      current = (await time.latest()).toNumber();
      expect(await vesting.getAvailableTokensForMemberAt(current + 1, member2)).to.be.equal(ether(5000));
    });
  });

  describe('claimVotes', () => {
    beforeEach(async function () {});

    it('should deny claiming before the vesting period start', async function () {
      expect(await vesting.hasVoteVestingStarted()).to.be.false;
      await expect(vesting.claimVotes(member1)).to.be.revertedWith(' Vesting::claimVotes: Nothing to claim');
    });

    it('should deny claiming for a non-active member', async function () {
      await evmMine(startV + 1);
      await expect(vesting.claimVotes(member4)).to.be.revertedWith('Vesting::claimVotes: User not active');
    });

    it('should deny claiming when nothing was assigned', async function () {
      vesting = await PPTimedVesting.new(erc20.address, startV, 10, startT, 15, [member1, member2, member3], 5);
      await erc20.mint(vesting.address, ether(3000));
      await evmMine(startT + 2);
      await vesting.claimVotes(member1);
      await expect(vesting.claimVotes(member1)).to.be.revertedWith('Vesting::claimVotes: Nothing to claim');
    });

    describe('increment with non-empty balance', () => {
      let firstClaimedAt;
      let secondClaimedAt;
      beforeEach(async function () {
        await evmMine(startV);
        // 500
        let res = await vesting.claimVotes(member1);
        firstClaimedAt = res.receipt.blockNumber;
        // 1000
        res = await vesting.claimVotes(member2);
        secondClaimedAt = res.receipt.blockNumber;
      });

      it('should increment an empty non-owned votes on increase', async function () {
        expect(await vesting.voteDelegations(member1)).to.be.equal(constants.ZERO_ADDRESS);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(500));
        const res = await vesting.claimVotes(member1);
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(1500));

        await time.increase(1);
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(500));
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(1500));
      });

      it('should increment an empty self-owned votes on increase', async function () {
        await vesting.delegateVotes(member2, { from: member1 });
        await vesting.delegateVotes(member1, { from: member1 });
        expect(await vesting.voteDelegations(member1)).to.be.equal(member1);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(500));
        const res = await vesting.claimVotes(member1);
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(2500));

        await time.increase(1);
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(500));
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(2500));
      });

      it('should increment an empty self-owned votes on increase', async function () {
        await vesting.delegateVotes(member2, { from: member1 });
        expect(await vesting.voteDelegations(member1)).to.be.equal(member2);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(500));
        expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(1000));
        const res = await vesting.claimVotes(member1);
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(2000));
        expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(1000));

        await time.increase(1);

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
      });
    });

    describe('decrement with non-empty balance with no tokens', () => {
      let firstClaimedAt;
      let secondClaimedAt;
      beforeEach(async function () {
        await erc20.transfer(vesting.address, ether(100000), { from: vault });
        await evmMine(startT);
        // 5000/4000
        let res = await vesting.claimTokens(member1, { from: member1 });
        firstClaimedAt = res.receipt.blockNumber;
        res = await vesting.claimTokens(member2, { from: member2 });
        secondClaimedAt = res.receipt.blockNumber;
      });

      it('should decrement an empty non-owned votes on increase', async function () {
        expect(await vesting.voteDelegations(member1)).to.be.equal(constants.ZERO_ADDRESS);
        expect(await vesting.hasVoteVestingEnded()).to.be.equal(false);
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(3000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(250));
        const res = await vesting.claimTokens(member1, { from: member1 });
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(4000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(750));

        await time.increase(1);
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(2750));
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(3250));
      });

      it('should increment an empty self-owned votes on increase', async function () {
        await vesting.delegateVotes(member2, { from: member1 });
        await vesting.delegateVotes(member1, { from: member1 });
        expect(await vesting.voteDelegations(member1)).to.be.equal(member1);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(3000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(250));
        const res = await vesting.claimTokens(member1, { from: member1 });
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(5000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(1250));

        await time.increase(1);
        expect(await vesting.hasVoteVestingEnded()).to.be.true;
        // 5000 - 1250
        expect(await vesting.getLastCachedVotes(member1)).to.be.equal(ether(3750));
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(2750));
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(3750));
      });

      it('should increment an empty self-owned votes on increase', async function () {
        await vesting.delegateVotes(member2, { from: member1 });
        expect(await vesting.voteDelegations(member1)).to.be.equal(member2);

        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(3000));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(250));
        expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(3500));
        expect((await vesting.members(member2)).alreadyClaimedTokens).to.be.equal(ether(500));
        const res = await vesting.claimTokens(member1, { from: member1 });
        const claimedAt = res.receipt.blockNumber;
        expect((await vesting.members(member1)).alreadyClaimedVotes).to.be.equal(ether(4500));
        expect((await vesting.members(member1)).alreadyClaimedTokens).to.be.equal(ether(1000));
        expect((await vesting.members(member2)).alreadyClaimedVotes).to.be.equal(ether(3500));
        expect((await vesting.members(member2)).alreadyClaimedTokens).to.be.equal(ether(500));

        await time.increase(1);

        // member1
        // 3000 - 250
        expect(await vesting.getPriorVotes(member1, firstClaimedAt)).to.be.equal(ether(2750));
        expect(await vesting.getPriorVotes(member1, parseInt(claimedAt) - 1)).to.be.equal(ether(0));
        expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(0));
        // member2
        // 3000 (member2)
        expect(await vesting.getPriorVotes(member2, secondClaimedAt)).to.be.equal(ether(3000));
        // 3000 (member2) + 2750 (member1)
        expect(await vesting.getPriorVotes(member2, parseInt(claimedAt) - 1)).to.be.equal(ether(5750));
        expect(await vesting.getPriorVotes(member2, claimedAt)).to.be.equal(ether(6500));
      });
    });
  });

  describe('claimTokens', () => {
    beforeEach(async function () {
      await erc20.transfer(vesting.address, ether(3000), { from: vault });
    });

    it('should deny withdrawing before the vesting period start', async function () {
      expect(await vesting.hasTokenVestingStarted()).to.be.false;
      await expect(vesting.claimTokens(bob, { from: member1 })).to.be.revertedWith(
        'Vesting::claimTokens: Nothing to claim',
      );
    });

    it('should deny non-active member withdrawing tokens', async function () {
      await evmMine(startT + 1);
      await expect(vesting.claimTokens(bob, { from: member4 })).to.be.revertedWith(
        'Vesting::claimTokens: User not active',
      );
    });

    it('should deny claiming when nothing was assigned', async function () {
      vesting = await PPTimedVesting.new(erc20.address, startV, 5, startT, 10, [member1, member2, member3], 5);
      await erc20.mint(vesting.address, ether(3000));
      await evmMine(startT + 1);
      await vesting.claimTokens(bob, { from: member1 });
      await expect(vesting.claimTokens(bob, { from: member1 })).to.be.revertedWith(
        'Vesting::claimTokens: Nothing to claim',
      );
    });
  });

  describe('delegate', () => {
    beforeEach(async function () {
      await erc20.transfer(vesting.address, ether(3000), { from: vault });
    });

    it('should delegate back and forth from an account with 0 balance', async function () {
      await evmMine(startV);
      let res = await vesting.delegateVotes(member2, { from: member1 });
      let theBlock = res.receipt.blockNumber;
      await time.increase(1);

      expect(await vesting.voteDelegations(member1)).to.be.equal(member2);
      expect(await vesting.getPriorVotes(member1, theBlock)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, theBlock)).to.be.equal('0');

      res = await vesting.delegateVotes(member1, { from: member1 });
      theBlock = res.receipt.blockNumber;
      await time.increase(1);

      expect(await vesting.getPriorVotes(member1, theBlock)).to.be.equal('0');
      expect(await vesting.getPriorVotes(member2, theBlock)).to.be.equal('0');
    });

    it('should delegate back and forth from self-delegated address', async function () {
      await vesting.delegateVotes(member2, { from: member1 });
      await vesting.delegateVotes(member1, { from: member1 });

      await vesting.claimVotes(member1);
      let res = await vesting.claimVotes(member2);
      const secondClaim = res.receipt.blockNumber;
      await time.advanceBlock();

      expect(await vesting.getPriorVotes(member1, secondClaim)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member2, secondClaim)).to.be.equal(ether(1500));

      res = await vesting.delegateVotes(member2, { from: member1 });
      let delegateBlock = res.receipt.blockNumber;
      await time.increase(1);

      expect(await vesting.voteDelegations(member1)).to.be.equal(member2);
      expect(await vesting.getPriorVotes(member1, delegateBlock)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, delegateBlock)).to.be.equal(ether(2500));

      res = await vesting.delegateVotes(member1, { from: member1 });
      delegateBlock = res.receipt.blockNumber;
      await time.increase(1);

      expect(await vesting.voteDelegations(member1)).to.be.equal(member1);
      expect(await vesting.getPriorVotes(member1, delegateBlock)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member2, delegateBlock)).to.be.equal(ether(1500));
    });

    it('should delegate between non-member addresses', async function () {
      await evmMine(startV + 1);
      await vesting.claimVotes(member1);
      let res = await vesting.claimVotes(member2);
      const firstClaim = res.receipt.blockNumber;
      await time.increase(1);

      expect(await vesting.getPriorVotes(member1, firstClaim)).to.be.equal(ether(1000));
      expect(await vesting.getPriorVotes(member2, firstClaim)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(member3, firstClaim)).to.be.equal(ether(0));

      res = await vesting.delegateVotes(member2, { from: member1 });
      let delegateBlock = res.receipt.blockNumber;
      await time.increase(1);

      expect(await vesting.voteDelegations(member1)).to.be.equal(member2);
      expect(await vesting.getPriorVotes(member1, delegateBlock)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, delegateBlock)).to.be.equal(ether(2500));
      expect(await vesting.getPriorVotes(member3, delegateBlock)).to.be.equal(ether(0));

      res = await vesting.delegateVotes(member3, { from: member1 });
      delegateBlock = res.receipt.blockNumber;
      await time.increase(1);

      expect(await vesting.voteDelegations(member1)).to.be.equal(member3);
      expect(await vesting.getPriorVotes(member1, delegateBlock)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member2, delegateBlock)).to.be.equal(ether(1500));
      expect(await vesting.getPriorVotes(member3, delegateBlock)).to.be.equal(ether(1000));
    });

    it('should deny delegate to the 0 address', async function () {
      expect(await vesting.voteDelegations(member1)).to.be.equal(constants.ZERO_ADDRESS);
      await expect(vesting.delegateVotes(constants.ZERO_ADDRESS, { from: member1 })).to.be.revertedWith(
        "Vesting::delegateVotes: Can't delegate to 0 address",
      );
    });

    it('should deny delegate to the self address when the delegate is 0 address', async function () {
      expect(await vesting.voteDelegations(member1)).to.be.equal(constants.ZERO_ADDRESS);
      await expect(vesting.delegateVotes(member1, { from: member1 })).to.be.revertedWith(
        'Vesting::delegateVotes: Already delegated to this address',
      );
    });

    it('should deny delegate to the already delegated address', async function () {
      await vesting.delegateVotes(member2, { from: member1 });
      expect(await vesting.voteDelegations(member1)).to.be.equal(member2);
      await expect(vesting.delegateVotes(member2, { from: member1 })).to.be.revertedWith(
        'Vesting::delegateVotes: Already delegated to this address',
      );
    });

    it('should deny delegating to a non-member address', async function () {
      await vesting.transfer(member4, { from: member1 });
      await expect(vesting.delegateVotes(member4, { from: member1 })).to.be.revertedWith(
        'Vesting::delegateVotes: msg.sender not active',
      );
    });
  });

  describe('transfer', () => {
    beforeEach(async function () {
      await erc20.transfer(vesting.address, ether(30000), { from: vault });
    });

    it('should allow transferring before the vesting period start', async function () {
      await vesting.transfer(bob, { from: member1 });

      const member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimedVotes).to.be.equal('0');
      expect(member1Details.alreadyClaimedTokens).to.be.equal('0');

      const bobDetails = await vesting.members(bob);
      expect(bobDetails.active).to.be.true;
      expect(bobDetails.transferred).to.be.false;
      expect(member1Details.alreadyClaimedVotes).to.be.equal('0');
      expect(bobDetails.alreadyClaimedTokens).to.be.equal('0');
    });

    it('should allow transferring after the token vesting period ends', async function () {
      await evmMine(endT + 2);
      await vesting.transfer(bob, { from: member1 });
      await evmMine(endT + 5);
      await time.advanceBlock();
      expect(await vesting.hasVoteVestingEnded()).to.be.equal(true);

      const member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimedVotes).to.be.equal('0');
      expect(member1Details.alreadyClaimedTokens).to.be.equal('0');
      expect(member1Details.personalDurationT).to.be.equal('0');

      const bobDetails = await vesting.members(bob);
      expect(bobDetails.active).to.be.true;
      expect(bobDetails.transferred).to.be.false;
      // nothing had been claimed during a transfer since the vote vesting period has ended
      expect(bobDetails.alreadyClaimedVotes).to.be.equal(ether(0));
      expect(bobDetails.alreadyClaimedTokens).to.be.equal('0');
      expect(bobDetails.personalDurationT).to.be.equal('0');
    });

    it('should correctly transfer with non-delegated votes and some claimed tokens', async function () {
      await evmMine(startT + 2);
      let res = await vesting.claimTokens(bob, { from: member1 });
      const claimedAt = res.receipt.blockNumber;
      await time.increase(1);

      // before check
      let member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.true;
      expect(member1Details.transferred).to.be.false;
      expect(member1Details.alreadyClaimedVotes).to.be.equal(ether(4000));
      expect(member1Details.alreadyClaimedTokens).to.be.equal(ether(750));
      // 4000 - 750
      expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(3250));
      expect(await vesting.getPriorVotes(bob, claimedAt)).to.be.equal(ether(0));

      // transfer
      res = await vesting.transfer(bob, { from: member1 });
      const transferredAt = res.receipt.blockNumber;
      await time.increase(1);

      // after check
      expect(await vesting.voteDelegations(bob)).to.be.equal(constants.ZERO_ADDRESS);
      member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimedVotes).to.be.equal('0');
      expect(member1Details.alreadyClaimedTokens).to.be.equal('0');

      const bobDetails = await vesting.members(bob);
      expect(bobDetails.active).to.be.true;
      expect(bobDetails.transferred).to.be.false;
      // +1000 from auto-claimed votes for bob
      expect(bobDetails.alreadyClaimedVotes).to.be.equal(ether(5000));
      expect(bobDetails.alreadyClaimedTokens).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, transferredAt)).to.be.equal(ether(0));
      expect(await vesting.hasVoteVestingEnded()).to.be.equal(true);
      // 3250 + (2 advanceBlocks + 1 transfer + 1 txItself) * 250 = 3250 + 4 * 250 = 4250
      expect(await vesting.getLastCachedVotes(bob)).to.be.equal(ether(4250));
      expect(await vesting.getPriorVotes(bob, transferredAt)).to.be.equal(ether(4250));
    });

    it('should correctly transfer with a custom personalDurationT', async function () {
      await evmMine(startT + 2);
      let res = await vesting.claimTokens(bob, { from: member1 });
      const claimedAt = res.receipt.blockNumber;
      await time.increase(1);
      await vesting.increasePersonalDurationsT([member1], [durationT + 10]);

      // before check
      let member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.true;
      expect(member1Details.transferred).to.be.false;
      expect(member1Details.alreadyClaimedVotes).to.be.equal(ether(4000));
      expect(member1Details.alreadyClaimedTokens).to.be.equal(ether(750));
      expect(member1Details.personalDurationT).to.be.equal(String(durationT + 10));
      // 4000 - 750
      expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(3250));
      expect(await vesting.getPriorVotes(bob, claimedAt)).to.be.equal(ether(0));

      // transfer
      res = await vesting.transfer(bob, { from: member1 });
      const transferredAt = res.receipt.blockNumber;
      await time.increase(1);

      // after check
      expect(await vesting.voteDelegations(bob)).to.be.equal(constants.ZERO_ADDRESS);
      member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimedVotes).to.be.equal('0');
      expect(member1Details.alreadyClaimedTokens).to.be.equal('0');
      expect(member1Details.personalDurationT).to.be.equal('0');

      const bobDetails = await vesting.members(bob);
      expect(bobDetails.active).to.be.true;
      expect(bobDetails.transferred).to.be.false;
      // +1000 from auto-claimed votes for bob
      expect(bobDetails.alreadyClaimedVotes).to.be.equal(ether(5000));
      expect(bobDetails.alreadyClaimedTokens).to.be.equal(ether(750));
      expect(bobDetails.personalDurationT).to.be.equal(String(durationT + 10));
      expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, transferredAt)).to.be.equal(ether(0));
      expect(await vesting.hasVoteVestingEnded()).to.be.equal(true);
      // 3250 + (2 advanceBlocks + 1 transfer + 1 txItself) * 250 = 3250 + 4 * 250 = 4250
      expect(await vesting.getLastCachedVotes(bob)).to.be.equal(ether(4250));
      expect(await vesting.getPriorVotes(bob, transferredAt)).to.be.equal(ether(4250));
    });

    it('should correctly transfer with self-delegated votes and some claimed tokens', async function () {
      await vesting.delegateVotes(member2, { from: member1 });
      await vesting.delegateVotes(member1, { from: member1 });

      await evmMine(startT + 2);
      let res = await vesting.claimTokens(bob, { from: member1 });
      const claimedAt = res.receipt.blockNumber;
      await time.increase(1);

      // before check
      let member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.true;
      expect(member1Details.transferred).to.be.false;
      expect(member1Details.alreadyClaimedVotes).to.be.equal(ether(4000));
      expect(member1Details.alreadyClaimedTokens).to.be.equal(ether(750));
      // 4000 - 750
      expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(3250));
      expect(await vesting.getPriorVotes(bob, claimedAt)).to.be.equal(ether(0));

      // transfer
      res = await vesting.transfer(bob, { from: member1 });
      const transferredAt = res.receipt.blockNumber;
      await time.increase(1);

      // after check
      member1Details = await vesting.members(member1);
      expect(member1Details.active).to.be.false;
      expect(member1Details.transferred).to.be.true;
      expect(member1Details.alreadyClaimedVotes).to.be.equal('0');
      expect(member1Details.alreadyClaimedTokens).to.be.equal('0');

      const bobDetails = await vesting.members(bob);
      expect(bobDetails.active).to.be.true;
      expect(bobDetails.transferred).to.be.false;
      // +1000 from auto-claimed votes for bob
      expect(bobDetails.alreadyClaimedVotes).to.be.equal(ether(5000));
      expect(bobDetails.alreadyClaimedTokens).to.be.equal(ether(750));
      expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(member1, claimedAt)).to.be.equal(ether(0));

      // in this case bob will have member1 as delegate an the new votes should be allocated there
      expect(await vesting.numCheckpoints(bob)).to.be.equal('1');
      expect(await vesting.getPriorVotes(member1, transferredAt)).to.be.equal(ether(0));
      expect(await vesting.getPriorVotes(bob, transferredAt)).to.be.equal(ether(0));

      expect(await vesting.voteDelegations(bob)).to.be.equal(member1);

      // member 1 is inactive, so he doesn't participate in voting
      expect(await vesting.getPriorVotes(member1, transferredAt)).to.be.equal(ether(0));
      // but the cached balance is still positive, so the delegators could re-delegate their votes
      // 3250 + (2 advanceBlocks + 1 transfer + 1 txItself) * 250 = 3250 + 4 * 250 = 4250
      expect(await vesting.getLastCachedVotes(member1)).to.be.equal(ether(4250));
      expect(await vesting.getPriorVotes(bob, transferredAt)).to.be.equal(ether(0));

      // and bob claims back his delegated votes from member 1
      res = await vesting.delegateVotes(bob, { from: bob });
      const delegatedBackAt = res.receipt.blockNumber;
      await time.increase(1);

      expect(await vesting.getPriorVotes(member1, delegatedBackAt)).to.be.equal(ether(0));
      expect(await vesting.getLastCachedVotes(member1)).to.be.equal(ether(0));

      expect(await vesting.hasVoteVestingEnded()).to.be.equal(true);
      // and 750 tokens was claimed earlier
      expect(await vesting.getLastCachedVotes(bob)).to.be.equal(ether(4250));
      expect(await vesting.getPriorVotes(bob, delegatedBackAt)).to.be.equal(ether(4250));
    });

    it('should deny non-active member calling the method tokens', async function () {
      await expect(vesting.transfer(bob, { from: member4 })).to.be.revertedWith(
        'Vesting::transfer: From member is inactive',
      );
    });

    it('should deny transferring to an already active member', async function () {
      await expect(vesting.transfer(member2, { from: member1 })).to.be.revertedWith('To address is already active');
    });

    it('should deny transferring to an already used account', async function () {
      await vesting.transfer(bob, { from: member1 });
      await expect(vesting.transfer(member1, { from: bob })).to.be.revertedWith(
        'Vesting::transfer: To address has been already used',
      );
    });

    it('should deny transferring a disabled account', async function () {
      await vesting.disableMember(member1);
      await expect(vesting.transfer(member1, { from: bob })).to.be.revertedWith(
        'Vesting::transfer: From member is inactive',
      );
    });
  });
});
