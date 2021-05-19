# PowerPool CVP Vesting Contract

[![Actions Status](https://github.com/powerpool-finance/cvp-vesting-contract/workflows/CI/badge.svg)](https://github.com/powerpool-finance/cvp-vesting-contract/actions)

Smart contract provides a temporary lock and following it vesting for the CVP ERC20 tokens received by participants in the Beta and Gamma testing rounds of PowerPool. The contract has a special function, which allows one to vote using tokens locked in the contract.

More details in 👉 
- [`PPVesting.sol`Specification](https://github.com/powerpool-finance/powerpool-docs/blob/master/specifications/ppVesting.md)
- [`PPTimedVesting.sol`Specification](https://github.com/powerpool-finance/powerpool-docs/blob/master/specifications/PPTimedVesting.md)

✅ **Security review status: Audited**

More details in 👉: 
- [`PPVesting.sol` Security Audit Report by Pessimistic](https://github.com/powerpool-finance/powerpool-docs/blob/master/audits/powerPool-vesting-security.pdf);
- [`PPVesting.sol` Security Audit Report V2 by Pessimistic](https://github.com/powerpool-finance/powerpool-docs/blob/master/audits/powerPool-vestingV2-security.pdf);
- [`PPTimedVesting.sol` Security Audit Report by MixBytes](https://github.com/powerpool-finance/powerpool-docs/blob/master/audits/PPTimedVesting_MixBytes.pdf);

## Contracts on Ethereum Main Network

## Active
- `PPVesting ` - [0x60842A6B44cca5Eb7685D1135acF69b1336B28b3](https://etherscan.io/address/0x60842A6B44cca5Eb7685D1135acF69b1336B28b3)

## Deprecated
- `PPVesting ` - [0xFD28bE82e453860F41c36029175377F470aF754b](https://etherscan.io/address/0xFD28bE82e453860F41c36029175377F470aF754b)

## Testing and Development

Use `yarn` or `npm` to run the following npm tasks:

- `yarn compile` - compile contracts
- `yarn test` - run tests
- `yarn coverage` - generate test coverage report
