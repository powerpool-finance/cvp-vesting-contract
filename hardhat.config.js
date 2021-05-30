require('@nomiclabs/hardhat-truffle5');
require('@nomiclabs/hardhat-ethers');
require('solidity-coverage');
require('hardhat-contract-sizer');
require('hardhat-gas-reporter');

require('./tasks/deployVesting');

const fs = require('fs');
const homeDir = require('os').homedir();
const _ = require('lodash');

function getAccounts(network) {
  const fileName = homeDir + '/.ethereum/' + network;
  if (!fs.existsSync(fileName)) {
    return [];
  }
  return [_.trim('0x' + fs.readFileSync(fileName, { encoding: 'utf8' }))];
}

const config = {
  analytics: {
    enabled: false,
  },
  contractSizer: {
    alphaSort: false,
    runOnCompile: true,
  },
  defaultNetwork: 'hardhat',
  gasReporter: {
    currency: 'USD',
    enabled: !!process.env.REPORT_GAS,
  },
  mocha: {},
  networks: {
    hardhat: {
      hardfork: 'berlin',
      chainId: 31337,
      allowUnlimitedContractSize: true,
    },
    local: {
      url: 'http://127.0.0.1:8545',
    },
    mainnet: {
      url: 'https://mainnet-eth.compound.finance',
      gasPrice: 25 * 10 ** 9,
      accounts: getAccounts('mainnet'),
      gasMultiplier: 1.1,
    },
    mainnetfork: {
      url: 'http://127.0.0.1:8545/',
      gasPrice: 25 * 10 ** 9,
      // accounts: getAccounts('mainnet'),
      gasMultiplier: 1.1,
      timeout: 2000000,
    },
    kovan: {
      url: 'https://kovan-eth.compound.finance',
      gasPrice: 10 ** 9,
      accounts: getAccounts('kovan'),
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
  solidity: {
    settings: {
      optimizer: {
        enabled: !!process.env.ETHERSCAN_KEY || process.env.COMPILE_TARGET === 'release',
        runs: 200,
      },
    },
    version: '0.6.12',
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
};

module.exports = config;
