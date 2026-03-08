import { createPublicClient, http, parseAbi } from 'viem';
import { celo } from 'viem/chains';
import { TOKENS } from './blockchain.js';
import dotenv from 'dotenv';

dotenv.config();

// Minimal Mento Broker ABI for pricing/swapping
// Note: This is a placeholder, in a real scenario we'd use the Mento SDK or full ABIs
const BROKER_ABI = parseAbi([
    'function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)',
]);

const BIPOOL_MANAGER = '0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901' as `0x${string}`;

const BIPOOL_ABI = [
  {
    "inputs": [
      { "internalType": "bytes32", "name": "exchangeId", "type": "bytes32" },
      { "internalType": "address", "name": "tokenIn", "type": "address" },
      { "internalType": "address", "name": "tokenOut", "type": "address" },
      { "internalType": "uint256", "name": "amountIn", "type": "uint256" }
    ],
    "name": "getAmountOut",
    "outputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org'),
});

/**
 * Returns the pool ID for a central asset (CELO) and a stable asset.
 * Mento pool IDs are often keccak256 or simple hex tags.
 * For CELO/stable pairs, they are typically the hex of "CELO/stable"
 */
function getPoolId(tokenA: string, tokenB: string): `0x${string}` {
    const pair = `${tokenA}/${tokenB}`;
    // Common Mento pool IDs are the string padded to 32 bytes
    let hex = '';
    for (let i = 0; i < pair.length; i++) {
        hex += pair.charCodeAt(i).toString(16);
    }
    return `0x${hex.padEnd(64, '0')}` as `0x${string}`;
}

export async function getExchangeRate(tokenIn: keyof typeof TOKENS, tokenOut: keyof typeof TOKENS, amountIn: string = '1') {
    try {
        const tIn = TOKENS[tokenIn];
        const tOut = TOKENS[tokenOut];
        const addrIn = tIn.address as `0x${string}`;
        const addrOut = tOut.address as `0x${string}`;
        
        // Convert amountIn to big int with proper decimals
        const amountInBN = BigInt(Math.floor(parseFloat(amountIn) * (10 ** tIn.decimals)));

        // For Mento, we usually route through CELO if it's not a direct pool
        // But for this MVP, we'll assume a direct BiPool exists (e.g. CELO/cUSD)
        const exchangeId = getPoolId('CELO', tokenIn === 'CELO' ? tokenOut : tokenIn);

        const amountOutBN = await publicClient.readContract({
            address: BIPOOL_MANAGER,
            abi: BIPOOL_ABI,
            functionName: 'getAmountOut',
            args: [exchangeId, addrIn, addrOut, amountInBN],
        });

        const formattedOut = (Number(amountOutBN) / (10 ** tOut.decimals)).toString();
        const rate = (Number(amountOutBN) / Number(amountInBN) * (10 ** tIn.decimals) / (10 ** tOut.decimals)).toFixed(6);

        return {
            rate,
            tokenIn,
            tokenOut,
            amountIn,
            estimatedOut: formattedOut
        };
    } catch (error) {
        console.error('Error fetching exchange rate:', error);
        // Fallback to mock for testing if RPC fails during implementation
        // return {
        //     rate: '1.00',
        //     tokenIn,
        //     tokenOut,
        //     estimatedOut: amountIn,
        //     isMock: true
        // };
    }
}
