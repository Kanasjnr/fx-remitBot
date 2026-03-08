import { createPublicClient, http, formatEther, parseAbi } from 'viem';
import { celo } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

// Standard ERC20 ABI for balance checking
const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

// Celo Mainnet Addresses 
export const TOKENS = {
  CELO: { address: '0x471EcE3750Da237f93B8E339c536989b8978a438', decimals: 18 },
  cUSD: { address: '0x765de816845861e75a25fca122bb6898b8b1282a', decimals: 18 }, // also called USDm
  cEUR: { address: '0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73', decimals: 18 }, // also called EURm
  cREAL: { address: '0xe8537a3d056da446677b9e9d6c5db704eaab4787', decimals: 18 }, // also called BRLm
  USDC: { address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', decimals: 6 },
  USDT: { address: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e', decimals: 6 },
};

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org'),
});

export async function getBalance(address: string, tokenSymbol: keyof typeof TOKENS = 'CELO') {
  try {
    const token = TOKENS[tokenSymbol];
    const tokenAddress = token.address as `0x${string}`;
    
    if (tokenSymbol === 'CELO') {
        const balance = await publicClient.getBalance({ address: address as `0x${string}` });
        return {
            symbol: 'CELO',
            formatted: formatEther(balance),
            value: balance.toString()
        };
    }

    const balance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
    });

    return {
      symbol: tokenSymbol,
      formatted: (Number(balance) / 10 ** token.decimals).toFixed(4),
      value: balance.toString(),
    };
  } catch (error) {
    console.error(`Error fetching ${tokenSymbol} balance:`, error);
    throw error;
  }
}

export async function getAllBalances(address: string) {
    const symbols = Object.keys(TOKENS) as (keyof typeof TOKENS)[];
    const results = await Promise.all(symbols.map(s => getBalance(address, s).catch(() => null)));
    return results.filter(r => r !== null);
}

export async function getAllowance(userAddress: string, spenderAddress: string, tokenSymbol: keyof typeof TOKENS) {
    try {
        const token = TOKENS[tokenSymbol];
        if (tokenSymbol === 'CELO') return { symbol: 'CELO', value: 'infinite' }; // Native CELO doesn't use allowance for transfers

        const allowance = await publicClient.readContract({
            address: token.address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [userAddress as `0x${string}`, spenderAddress as `0x${string}`],
        });

        return {
            symbol: tokenSymbol,
            value: allowance.toString(),
            formatted: (Number(allowance) / 10 ** token.decimals).toFixed(4)
        };
    } catch (error) {
        console.error(`Error fetching allowance for ${tokenSymbol}:`, error);
        throw error;
    }
}
