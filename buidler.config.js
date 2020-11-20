const { usePlugin } = require('@nomiclabs/buidler/config');

usePlugin('@nomiclabs/buidler-truffle5');
usePlugin('solidity-coverage');
usePlugin('buidler-contract-sizer');
usePlugin('buidler-gas-reporter');

require('./tasks/deployVesting');

const fs = require('fs');
const homeDir = require('os').homedir();
const _ = require('lodash');

function getAccounts(network) {
  const fileName = homeDir + '/.ethereum/' + network;
  if(!fs.existsSync(fileName)) {
    return [];
  }
  return [_.trim('0x' + fs.readFileSync(fileName, {encoding: 'utf8'}))];
}

const config = {
  analytics: {
    enabled: false,
  },
  contractSizer: {
    alphaSort: false,
    runOnCompile: false,
  },
  defaultNetwork: 'buidlerevm',
  gasReporter: {
    currency: 'USD',
    enabled: !!process.env.REPORT_GAS,
  },
  mocha: {},
  networks: {
    buidlerevm: {
      chainId: 31337,
    },
    local: {
      url: 'http://127.0.0.1:8545',
    },
    mainnet: {
      url: 'https://mainnet-eth.compound.finance',
      gasPrice: 99 * 10 ** 9,
      accounts: getAccounts('mainnet'),
      gasMultiplier: 2,
    },
    kovan: {
      url: 'https://kovan-eth.compound.finance',
      gasPrice: 10 ** 9,
      accounts: getAccounts('kovan')
    },
    coverage: {
      url: 'http://127.0.0.1:8555',
    },
  },
  paths: {
    artifacts: './artifacts',
    cache: './cache',
    coverage: './coverage',
    coverageJson: './coverage.json',
    root: './',
    sources: './contracts',
    tests: './test',
  },
  solc: {
    /* https://buidler.dev/buidler-evm/#solidity-optimizer-support */
    optimizer: {
      enabled: true,
      runs: 200,
    },
    version: '0.6.12',
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
};

module.exports = config;
