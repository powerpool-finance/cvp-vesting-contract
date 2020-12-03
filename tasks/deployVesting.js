require('@nomiclabs/hardhat-truffle5');

const fs = require('fs');
const _ = require('lodash');

task('deploy-vesting', 'Deploy Vesting')
  .setAction(async () => {
    const PPVesting = await artifacts.require('PPVesting');
    const CVP = await artifacts.require('IERC20');

    const {web3} = PPVesting;

    const [deployer] = await web3.eth.getAccounts();
    const sendOptions = {from: deployer};

    const members = getAddresses('testers-beta').concat(getAddresses('testers-gamma'));

    const configByNetworkId = {
      '1': {
        cvpAddress: '0x38e4adb44ef08f22f5b5b76a8f0c2d0dcbe7dca1',
        startV: 10966820,
        durationV: 2372500,
        startT: 12465437,
        durationT: 3555500
      },
      '42': {
        cvpAddress: '0x86D0FFCf65eE225217e0Fe85DDB2B79A8CE7eDE2',
        startV: await getBlockNumber(300),
        durationV: 5000,
        startT: await getBlockNumber(600),
        durationT: 5000
      }
    };

    const networkId = parseInt(await web3.eth.net.getId());
    const config = configByNetworkId[networkId];
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

    async function getBlockNumber(addBlocks) {
      return (await web3.eth.getBlockNumber()) + addBlocks;
    }

    function getAddresses(filename) {
      const addresses = [];
      const membersCsv = fs.readFileSync('data/' + filename + '.csv', {encoding: 'utf8'});
      membersCsv.split(/\r\n|\r|\n/g).forEach((line) => {
        const split = line.split(',');
        if (web3.utils.isAddress(split[0])) {
          addresses.push(split[0]);
        }
      });
      return addresses;
    }
  });
