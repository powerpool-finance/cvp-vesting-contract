const { ether: etherBN, time } = require('@openzeppelin/test-helpers');
const { solidity } = require('ethereum-waffle');
const { evmMine } = require('./helpers');

const chai = require('chai');
const PPTimedVesting = artifacts.require('PPTimedVesting');
const ERC20 = artifacts.require('ERC20PresetMinterPauser');

chai.use(solidity);
const { expect } = chai;

function ether(value) {
  return etherBN(String(value)).toString();
}

ERC20.numberFormat = 'String';
PPTimedVesting.numberFormat = 'String';

// NOTICE: all durations are represented in blocks
contract('PPTimedVesting Behaviour Tests', function ([, member1, member2, member3, alice, vault]) {
  let vesting;
  let startT;
  let durationT;
  let startV;
  let durationV;
  let erc20;

  beforeEach(async function () {
    erc20 = await ERC20.new('Concentrated Voting Power', 'CVP');
    await erc20.mint(vault, ether(1500000));

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
  });

  describe('claimTokens', () => {
    it('should allow a gradual token/votes claims each block', async function () {
      // Step #0
      expect(await erc20.balanceOf(member1)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('0');

      // Step #1
      await evmMine(startV);
      expect(await vesting.hasVoteVestingStarted()).to.be.true;

      await vesting.claimVotes(member1);

      // Step #2
      await vesting.claimVotes(member1);

      // Step #3
      await vesting.claimVotes(member1);

      // Step #4
      await vesting.claimVotes(member1);

      // Step #5
      await vesting.claimVotes(member1);
      expect(await erc20.balanceOf(alice)).to.be.equal('0');
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('5');

      // Step #6
      await vesting.claimTokens(alice, { from: member1 });
      expect(await erc20.balanceOf(alice)).to.be.equal(ether(500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));
      expect(await vesting.numCheckpoints(member1)).to.be.equal('6');
      const checkpoint = await vesting.checkpoints(member1, 0);
      expect(checkpoint.votes).to.be.equal(ether(250));

      // Step #7
      await vesting.claimTokens(alice, { from: member1 });

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1000));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));

      // Step #8
      await vesting.claimTokens(alice, { from: member1 });

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(1500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));

      // Step #9
      await vesting.claimTokens(alice, { from: member1 });

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2000));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));

      // Step #10
      await vesting.claimTokens(alice, { from: member1 });

      expect(await erc20.balanceOf(alice)).to.be.equal(ether(2500));
      expect(await vesting.getAvailableTokensForMember(member1)).to.be.equal(ether(0));

      // Step #11
      await expect(vesting.claimTokens(alice, { from: member1 })).to.revertedWith(
        'Vesting::claimTokens: Nothing to claim',
      );
    });
  });
});
