const { ether: etherBN, time } = require('@openzeppelin/test-helpers');
const assert = require('assert');

const getCounter = (n => () => n++)(1);

module.exports = {
  evmIncreaseTime: buildEndpoint('evm_increaseTime'),
  evmMine: buildEndpoint('evm_mine'),
  evmSetNextBlockTimestamp: buildEndpoint('evm_setNextBlockTimestamp'),
  logBlock,
  logLatestBlock,
  increaseTimeTo,
  getBlockTimestampByRes,
  getLatestBlockTimestamp,
  getLatestBlockNumber,
  ether
};

function buildEndpoint(endpoint) {
  return async function(...args) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: endpoint,
          params: args,
          id: getCounter(),
        },
        async (err, res) => {
          if (err) {
            return reject(err);
          }
          if (res.error && res.error.message && res.error.message.length > 0) {
            let err = new Error(`'${endpoint}' call failed`);
            err.stack = res.error.data.stack;
            err.name = res.error.data.name;
            return reject(err);
          }
          return resolve(res.result);
        },
      );
    });
  }
}

async function increaseTimeTo(value) {
  assert(typeof value === 'number');
  const evmIncreaseTime = buildEndpoint('evm_increaseTime');
  const latestTimestamp = parseInt((await web3.eth.getBlock('latest')).timestamp, 10);
  return evmIncreaseTime(value - latestTimestamp);
}

/**
 * Returns the latest block timestamp
 * @returns {Promise<number>}
 */
async function getLatestBlockTimestamp() {
  let block = (await time.latestBlock()).toNumber();
  return parseInt((await web3.eth.getBlock(block)).timestamp, 10);
}

async function getLatestBlockNumber() {
  const block = await web3.eth.getBlock('latest');
  return parseInt(block.number, 10);
}

async function getBlockTimestampByRes(res) {
  return (await web3.eth.getBlock(res.receipt.blockNumber)).timestamp;
}

async function logBlock(block) {
  let timestamp = (await web3.eth.getBlock(block)).timestamp;
  console.log(`Block #${block} at ${timestamp}`)
}

async function logLatestBlock(msg) {
  let block = (await time.latestBlock()).toNumber();
  let timestamp = (await web3.eth.getBlock(block)).timestamp;
  console.log(`${msg ? msg : 'Latest'}: block #${block} at ${timestamp}`)
}

function ether(value) {
  return etherBN(String(value)).toString();
}
