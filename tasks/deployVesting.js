require('@nomiclabs/hardhat-truffle5');

const fs = require('fs');
const _ = require('lodash');

task('deploy-vesting', 'Deploy Vesting')
  .setAction(async (__, {ethers, network}) => {
    const {impersonateAccount, fromEther} = require('../test/helpers');
    const PPVesting = await artifacts.require('PPTimedVesting');
    const CVP = await artifacts.require('@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20');

    const admin = '0xb258302c3f209491d604165549079680708581cc';

    const {web3} = PPVesting;

    const [deployer] = await web3.eth.getAccounts();
    const sendOptions = {from: deployer};

    const members = getAddresses('VestingMembers');

    const networkId = parseInt(await web3.eth.net.getId());

    const startV = 1601509764;
    const config = {
      cvpAddress: networkId === 42 ? '0x86D0FFCf65eE225217e0Fe85DDB2B79A8CE7eDE2' : '0x38e4adb44ef08f22f5b5b76a8f0c2d0dcbe7dca1',
      startV,
      durationV: 31560000,
      startT: startV + 15780000,
      durationT: 47340000
    };
    const cvp = await CVP.at(config.cvpAddress);
    console.log('config.cvpAddress', config.cvpAddress);

    const vesting = await PPVesting.new(
      cvp.address,
      config.startV,
      config.durationV,
      config.startT,
      config.durationT,
      web3.utils.toWei('50000', 'ether'),
      sendOptions
    );

    await vesting.initializeMembers(members, sendOptions);

    console.log('vesting.address', vesting.address);
    console.log('memberCount', (await vesting.memberCount()).toString());

    fs.writeFileSync(
      './tmp/latestVestingDeployArguments',
      web3.eth.abi.encodeParameters(_.find(vesting.contract._jsonInterface, {type: 'constructor'}).inputs.map(i => i.type), [
        cvp.address,
        config.startV,
        config.durationV,
        config.startT,
        config.durationT,
        web3.utils.toWei('50000', 'ether')
      ])
    );

    if (network.name !== 'mainnetfork') {
      return;
    }
    let testMember = '0x1bf8567543fa87c5107b690452dbf3f754654a2e';
    const transferTo = '0x3cd751e6b0078be393132286c442345e5dc49699';
    await impersonateAccount(ethers, admin);
    await impersonateAccount(ethers, testMember);
    await impersonateAccount(ethers, transferTo);
    await vesting.transfer(transferTo, {from: testMember});
    await cvp.transfer(vesting.address, web3.utils.toWei('500000', 'ether'), {from: admin});

    testMember = transferTo;

    // await vesting.claimTokens(testMember, {from: testMember});
    await vesting.claimVotes(testMember, {from: testMember});
    let blockNumber = await web3.eth.getBlockNumber();
    await vesting.claimVotes(testMember, {from: testMember});
    console.log('cvp balance', fromEther(await cvp.contract.methods.balanceOf(testMember).call()));
    console.log('votes', fromEther(await vesting.contract.methods.getPriorVotes(testMember, blockNumber).call()));
    await vesting.claimTokens(testMember, {from: testMember});
    blockNumber = await web3.eth.getBlockNumber();
    await vesting.claimTokens(testMember, {from: testMember});
    console.log('cvp balance', fromEther(await cvp.contract.methods.balanceOf(testMember).call()));
    console.log('votes', fromEther(await vesting.contract.methods.getPriorVotes(testMember, blockNumber).call()));

    function getAddresses(filename) {
      return JSON.parse(fs.readFileSync('data/' + filename + '.json', {encoding: 'utf8'}));
    }
  });
