import { createPublicClient, http, formatUnits, parseUnits } from 'viem';
import { celo } from 'viem/chains';
import { TOKENS } from './blockchain.js';
import { Mento, ChainId } from '@mento-protocol/mento-sdk';
import dotenv from 'dotenv';

dotenv.config();

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org'),
});

let mentoInstance: Mento | null = null;

export async function getMento() {
  if (!mentoInstance) {
    mentoInstance = await Mento.create(ChainId.CELO, publicClient as any);
  }
  return mentoInstance;
}

export async function getExchangeRate(tokenIn: keyof typeof TOKENS, tokenOut: keyof typeof TOKENS, amountIn: string = '1') {
    try {
        const tIn = TOKENS[tokenIn];
        const tOut = TOKENS[tokenOut];

        if (!tIn || !tOut) {
            throw new Error(`Unknown token(s): ${!tIn ? tokenIn : ''} ${!tOut ? tokenOut : ''}`);
        }

        const addrIn = tIn.address as `0x${string}`;
        const addrOut = tOut.address as `0x${string}`;
        
        const mento = await getMento();
        const amountInBN = parseUnits(amountIn, tIn.decimals);

        console.log(`[Mento SDK] Querying rate for ${amountIn} ${tokenIn} ➡️ ${tokenOut}`);

        const amountOutBN = await mento.quotes.getAmountOut(addrIn, addrOut, amountInBN);

        const formattedOut = formatUnits(amountOutBN, tOut.decimals);
        const rate = (Number(formattedOut) / Number(amountIn)).toFixed(6);

        return {
            rate,
            tokenIn,
            tokenOut,
            amountIn,
            estimatedOut: formattedOut
        };
    } catch (error: any) {
        console.error('Error fetching exchange rate:', error.message);
        throw error;
    }
}
