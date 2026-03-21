import {
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  parseAbi,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { TOKENS } from "./blockchain.js";
import { logTransaction, getUserByTelegramId } from "../db/index.js";
import dotenv from "dotenv";

dotenv.config();

const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(privateKey);

const walletClient = createWalletClient({
  account,
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || "https://forno.celo.org"),
});

// ABI for ERC20 transfer
const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const FEE_CURRENCIES: Record<string, `0x${string}`> = {
  cUSD: "0x765de816845861e75a25fca122bb6898b8b1282a",
  cEUR: "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73",
  cREAL: "0xe8537a3d056da446677b9e9d6c5db704eaab4787",
  cXOF: "0x73F93dcc49cb8a239e2032663e9475dd5ef29A08",
  cKES: "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0",
  cPHP: "0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B",
  cCOP: "0x8a567e2ae79ca692bd748ab832081c45de4041ea",
  cGHS: "0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313",
  cGBP: "0xCCF663b1fF11028f0b19058d0f7B674004a40746",
  cZAR: "0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6",
  cCAD: "0xff4Ab19391af240c311c54200a492233052B6325",
  cAUD: "0x7175504C455076F15c04A2F90a8e352281F492F9",
  cCHF: "0xb55a79F398E759E43C95b979163f30eC87Ee131D",
  cJPY: "0xc45eCF20f3CD864B32D9794d6f76814aE8892e20",
  cNGN: "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71",
  USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  USDT: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e",
};

/**
 * Prepares a transaction object for WalletConnect signing.
 */
export async function prepareStablecoinTransfer(
  to: `0x${string}`,
  amount: string,
  tokenSymbol: keyof typeof TOKENS,
  feeSymbol: keyof typeof FEE_CURRENCIES = "cUSD",
) {
  const token = TOKENS[tokenSymbol];
  const amountBN = parseUnits(amount, token.decimals);
  const feeCurrency = FEE_CURRENCIES[feeSymbol];

  if (tokenSymbol === "CELO") {
    return {
      to,
      value: amountBN.toString(),
      feeCurrency: feeCurrency as `0x${string}`,
    };
  } else {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to, amountBN],
    });

    return {
      to: token.address as `0x${string}`,
      data,
      feeCurrency: feeCurrency as `0x${string}`,
    };
  }
}

export async function sendStablecoinTransfer(
  userId: string,
  to: `0x${string}`,
  amount: string,
  tokenSymbol: keyof typeof TOKENS,
  feeSymbol: keyof typeof FEE_CURRENCIES = "cUSD",
  senderAddress?: `0x${string}`, // Optional: If provided, use transferFrom
) {
  try {
    const token = TOKENS[tokenSymbol];
    const amountBN = parseUnits(amount, token.decimals);
    const feeCurrency = FEE_CURRENCIES[feeSymbol];

    console.log(
      `[Transaction] Sending ${amount} ${tokenSymbol} to ${to} (Fee in ${feeSymbol})`,
    );

    let hash: `0x${string}`;

    if (tokenSymbol === "CELO") {
      if (senderAddress) {
        throw new Error(
          "CELO native transferFrom is not supported. Use stablecoins for non-custodial transfers.",
        );
      }
      hash = await walletClient.sendTransaction({
        to,
        value: amountBN,
      });
    } else {
      if (senderAddress) {
        console.log(
          `[Transaction] Non-custodial transferFrom: ${senderAddress} -> ${to}`,
        );
        hash = await walletClient.writeContract({
          address: token.address as `0x${string}`,
          abi: BROKER_ABI, // Contains transferFrom
          functionName: "transferFrom",
          args: [senderAddress, to, amountBN],
          feeCurrency: feeCurrency as `0x${string}`,
        } as any);
      } else {
        hash = await walletClient.writeContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [to, amountBN],
          feeCurrency: feeCurrency as `0x${string}`,
        } as any);
      }
    }

    // Log to database
    try {
      await logTransaction({
        user_id: userId,
        from_address: account.address,
        to_address: to,
        amount: parseFloat(amount),
        currency: tokenSymbol,
        tx_hash: hash,
        status: "confirmed",
        executed_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error("[Transaction] Database logging failed:", logError);
      // Don't throw here as the on-chain tx succeeded
    }

    return {
      success: true,
      hash,
      explorerUrl: `https://celoscan.io/tx/${hash}`,
      amount,
      tokenSymbol,
      recipient: to,
    };
  } catch (error: any) {
    console.error("[Transaction] Transfer error:", error);
    throw new Error(`Failed to send transfer: ${error.message}`);
  }
}

const MENTO_BROKER =
  "0xad766ae797669ba8a2a86a63520199e19865f808" as `0x${string}`;
const EXCHANGE_PROVIDER =
  "0x22d9db95e6ae61c104a7b6f6c78d7993b94ec901" as `0x${string}`; // BiPoolManager

const BROKER_ABI = [
  {
    inputs: [
      { internalType: "address", name: "exchangeProvider", type: "address" },
      { internalType: "bytes32", name: "exchangeId", type: "bytes32" },
      { internalType: "address", name: "tokenIn", type: "address" },
      { internalType: "address", name: "tokenOut", type: "address" },
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "minAmountOut", type: "uint256" },
    ],
    name: "swapIn",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "address", name: "recipient", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const APPROVE_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Helper to get Pool ID (Exchange ID) for Mento.
 * For CELO/stable pairs, it's often the hex of "CELO/stable" padded.
 */
function getMentoPoolId(tokenA: string, tokenB: string): `0x${string}` {
  const pair = `${tokenA}/${tokenB}`;
  let hex = "";
  for (let i = 0; i < pair.length; i++) {
    hex += pair.charCodeAt(i).toString(16);
  }
  return `0x${hex.padEnd(64, "0")}` as `0x${string}`;
}

export async function sendMentoSwap(
  userId: string,
  tokenInSymbol: keyof typeof TOKENS,
  tokenOutSymbol: keyof typeof TOKENS,
  amountIn: string,
  feeSymbol: keyof typeof FEE_CURRENCIES = "cUSD",
) {
  try {
    const tIn = TOKENS[tokenInSymbol];
    const tOut = TOKENS[tokenOutSymbol];
    const addrIn = tIn.address as `0x${string}`;
    const addrOut = tOut.address as `0x${string}`;
    const amountInBN = parseUnits(amountIn, tIn.decimals);
    const feeCurrency = FEE_CURRENCIES[feeSymbol];

    // Use CELO as the base if not swapping CELO directly (contrived for MVP)
    const exchangeId = getMentoPoolId(
      "CELO",
      tokenInSymbol === "CELO" ? tokenOutSymbol : tokenInSymbol,
    );

    console.log(
      `[Swap] Swapping ${amountIn} ${tokenInSymbol} for ${tokenOutSymbol} via Mento`,
    );

    // 1. Approve Broker
    if (tokenInSymbol !== "CELO") {
      const approveHash = await walletClient.writeContract({
        address: addrIn,
        abi: APPROVE_ABI,
        functionName: "approve",
        args: [MENTO_BROKER, amountInBN],
        feeCurrency: feeCurrency as `0x${string}`,
      } as any);
      console.log(`[Swap] Approval Transaction: ${approveHash}`);
    }

    // 2. Execute Swap (with 1% slippage buffer)
    const minAmountOut = 0n; // Simple for MVP, should be based on rate

    const swapHash = await walletClient.writeContract({
      address: MENTO_BROKER,
      abi: BROKER_ABI,
      functionName: "swapIn",
      args: [
        EXCHANGE_PROVIDER,
        exchangeId,
        addrIn,
        addrOut,
        amountInBN,
        minAmountOut,
      ],
      feeCurrency: feeCurrency as `0x${string}`,
    } as any);

    // Log to database
    try {
      await logTransaction({
        user_id: userId,
        from_address: account.address,
        to_address: MENTO_BROKER, // Or some representation of the swap
        amount: parseFloat(amountIn),
        currency: tokenInSymbol,
        tx_hash: swapHash,
        status: "confirmed",
        executed_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error("[Transaction] Database swap logging failed:", logError);
    }

    return {
      success: true,
      hash: swapHash,
      explorerUrl: `https://celoscan.io/tx/${swapHash}`,
      tokenIn: tokenInSymbol,
      tokenOut: tokenOutSymbol,
      amountIn,
    };
  } catch (error: any) {
    console.error("[Swap] Mento swap error:", error);
    throw new Error(`Failed to execute Mento swap: ${error.message}`);
  }
}
