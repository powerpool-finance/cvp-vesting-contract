usePlugin('@nomiclabs/buidler-truffle5');

const fs = require('fs');

task('deploy-vesting', 'Deploy Vesting')
  .setAction(async () => {
    const PPVesting = await artifacts.require('PPVesting');
    const CVP = await artifacts.require('IERC20');

    const {web3} = PPVesting;

    const [deployer] = await web3.eth.getAccounts();
    const sendOptions = {from: deployer};

    const members = [];
    const membersCsv = fs.readFileSync('data/vestingMembers_42.csv', {encoding: 'utf8'});
    membersCsv.split(/\r\n|\r|\n/g).forEach((line) => {
      const split = line.split(',');
      if (web3.utils.isAddress(split[0])) {
        members.push(split[0]);
      }
    });

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

    const config = configByNetworkId[await web3.eth.net.getId()];
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

    await cvp.transfer(vesting.address, web3.utils.toWei('500000', 'ether'));

    console.log('vesting.address', vesting.address);
    console.log('memberCount', (await vesting.memberCount()).toString());

    async function getBlockNumber(addBlocks) {
      return (await web3.eth.getBlockNumber()) + addBlocks;
    }
  });
