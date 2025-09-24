// Popular ERC-20 tokens for different chains
export interface TokenInfo {
    address: `0x${string}`;
    symbol: string;
    name: string;
    decimals: number;
    chainId: number;
}

// ERC-20 ABI for balanceOf function
export const ERC20_ABI = [
    {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'symbol',
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'name',
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// Popular tokens by chain
export const POPULAR_TOKENS: { [chainId: number]: TokenInfo[] } = {
    // Ethereum Mainnet
    1: [
        {
            address: '0xA0b86a33E6441c8C06Cdd7C1a89c0e9e6d9C2a1d',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            chainId: 1,
        },
        {
            address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            symbol: 'USDT',
            name: 'Tether USD',
            decimals: 6,
            chainId: 1,
        },
        {
            address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            symbol: 'DAI',
            name: 'Dai Stablecoin',
            decimals: 18,
            chainId: 1,
        },
        {
            address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
            symbol: 'WBTC',
            name: 'Wrapped Bitcoin',
            decimals: 8,
            chainId: 1,
        },
        {
            address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            symbol: 'UNI',
            name: 'Uniswap',
            decimals: 18,
            chainId: 1,
        },
        {
            address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 1,
        },
    ],
    // Sepolia Testnet
    11155111: [
        {
            address: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 11155111,
        },
    ],
    // Polygon Mainnet
    137: [
        {
            address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            chainId: 137,
        },
        {
            address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            symbol: 'USDT',
            name: 'Tether USD',
            decimals: 6,
            chainId: 137,
        },
        {
            address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
            symbol: 'DAI',
            name: 'Dai Stablecoin',
            decimals: 18,
            chainId: 137,
        },
        {
            address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 137,
        },
    ],
    // BSC Mainnet
    56: [
        {
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 18,
            chainId: 56,
        },
        {
            address: '0x55d398326f99059fF775485246999027B3197955',
            symbol: 'USDT',
            name: 'Tether USD',
            decimals: 18,
            chainId: 56,
        },
        {
            address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
            symbol: 'DAI',
            name: 'Dai Stablecoin',
            decimals: 18,
            chainId: 56,
        },
        {
            address: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 56,
        },
    ],
    // Arbitrum One
    42161: [
        {
            address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            chainId: 42161,
        },
        {
            address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
            symbol: 'USDT',
            name: 'Tether USD',
            decimals: 6,
            chainId: 42161,
        },
        {
            address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 42161,
        },
    ],
    // Optimism
    10: [
        {
            address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            chainId: 10,
        },
        {
            address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
            symbol: 'USDT',
            name: 'Tether USD',
            decimals: 6,
            chainId: 10,
        },
        {
            address: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 10,
        },
    ],
    // Base
    8453: [
        {
            address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            chainId: 8453,
        },
        {
            address: '0x88DfaAABaf46f273465f50C8B0B122530eab049d',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 8453,
        },
    ],
    // BSC Testnet
    97: [
        {
            address: '0x84b9b910527ad5c03a9ca831909e21e236ea7b06',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 97,
        },
    ],
    // Polygon Mumbai
    80001: [
        {
            address: '0x326C977E6efc84E512bB9C30f76E30c160eD06FB',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 80001,
        },
    ],
    // Arbitrum Sepolia
    421614: [
        {
            address: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 421614,
        },
    ],
    // Optimism Sepolia
    11155420: [
        {
            address: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 11155420,
        },
    ],
    // Avalanche Fuji
    43113: [
        {
            address: '0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 43113,
        },
    ],
    // Base Sepolia
    84532: [
        {
            address: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 84532,
        },
    ],
    // Fantom Testnet
    4002: [
        {
            address: '0x6Fb7e470dAe4C8b0d4C8a1B0e4B8e4B8e4B8e4B8',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 4002,
        },
    ],
    // Celo Alfajores
    44787: [
        {
            address: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 44787,
        },
    ],
    // Gnosis Chiado
    10200: [
        {
            address: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
            symbol: 'LINK',
            name: 'ChainLink Token',
            decimals: 18,
            chainId: 10200,
        },
    ],
};

// Get popular tokens for a specific chain
export const getPopularTokens = (chainId?: number): TokenInfo[] => {
    if (!chainId || !POPULAR_TOKENS[chainId]) {
        return [];
    }
    return POPULAR_TOKENS[chainId];
};

// Format token balance
export const formatTokenBalance = (balance: bigint, decimals: number): string => {
    const divisor = BigInt(10 ** decimals);
    const wholePart = balance / divisor;
    const fractionalPart = balance % divisor;

    if (fractionalPart === 0n) {
        return wholePart.toString();
    }

    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');

    if (trimmedFractional === '') {
        return wholePart.toString();
    }

    return `${wholePart}.${trimmedFractional}`;
};
