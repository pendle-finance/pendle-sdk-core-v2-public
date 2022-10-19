const { spawnSync } = require('child_process');

const toTest = [
    'ERC20',
    'SCY',
    'YT',
    'PT',
    'PY',
    'YieldContractFactory',
    'SDK',
    'Market',
    'MarketFactory',
    'VePendle',
    'VotingController',
    'Misc',
    'Router', // this is last because it runs so slowly
];

toTest.forEach((file) => {
    spawnSync('yarn', ['jest', `${file}.spec.ts`], { shell: true, stdio: 'inherit' });
});
