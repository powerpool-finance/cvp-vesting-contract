require('@nomiclabs/hardhat-truffle5');

const fs = require('fs');
const _ = require('lodash');

task('deploy-vesting', 'Deploy Vesting')
  .setAction(async () => {
    const PPVesting = await artifacts.require('PPTimedVesting');
    const CVP = await artifacts.require('@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20');

    const {web3} = PPVesting;

    const [deployer] = await web3.eth.getAccounts();
    const sendOptions = {from: deployer};

    const members = getAddresses('testers-dump');

    const networkId = parseInt(await web3.eth.net.getId());

    const startV = 1601509764;
    const config = {
      cvpAddress: networkId === 1 ? '0x38e4adb44ef08f22f5b5b76a8f0c2d0dcbe7dca1' : '0x86D0FFCf65eE225217e0Fe85DDB2B79A8CE7eDE2',
      startV,
      durationV: 31560000,
      startT: startV + 15780000,
      durationT: 47340000
    };
    const cvp = await CVP.at(config.cvpAddress);

    const vesting = await PPVesting.new(
      cvp.address,
      config.startV,
      config.durationV,
      config.startT,
      config.durationT,
      members,
      web3.utils.toWei('50000', 'ether'),
      sendOptions
    );

    if (networkId !== 1) {
      await cvp.transfer(vesting.address, web3.utils.toWei('500000', 'ether'));
    }

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
        members,
        web3.utils.toWei('50000', 'ether')
      ])
    );

    function getAddresses(filename) {
      return JSON.parse(fs.readFileSync('data/' + filename + '.json', {encoding: 'utf8'}));
    }
  });
