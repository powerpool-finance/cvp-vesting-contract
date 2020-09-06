const { usePlugin } = require('@nomiclabs/buidler/config');

usePlugin('@nomiclabs/buidler-truffle5');
usePlugin('solidity-coverage');

const config = {
  analytics: {
    enabled: false,
  },
  defaultNetwork: 'buidlerevm',
  mocha: {},
  networks: {
    buidlerevm: {
      chainId: 31337,
    },
    local: {
      url: 'http://127.0.0.1:9545',
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
      enabled: false,
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
