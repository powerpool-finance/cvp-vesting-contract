const getCounter = (n => () => n++)(1);
const { promisify } = require('util');

module.exports = {
  evmMine,
};

function evmMine(timestamp) {
  return promisify(web3.currentProvider.send.bind(web3.currentProvider))({
    jsonrpc: '2.0',
    method: 'evm_mine',
    params: [timestamp],
    id: getCounter(),
  });
}
