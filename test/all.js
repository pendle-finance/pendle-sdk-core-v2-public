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
    'Router',
    'VePendle',
    'VotingController',
    'Misc',
];

toTest.forEach((file) => {
    spawnSync('yarn', ['jest', `${file}.spec.ts`], { shell: true, stdio: 'inherit' });
});