import { createPublicClient, createWalletClient, http, formatEther, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

// Standard ERC20 ABI for balance checking
const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

// Mento Broker ABI
const BROKER_ABI = parseAbi([
  "function swapIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address[] calldata path) returns (uint256)",
  "function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)",
]);

const MENTO_BROKER = "0xad766ae797669ba8a2a86a63520199e19865f808";

// Celo Mainnet Addresses
export const TOKENS = {
  CELO: { address: "0x471EcE3750Da237f93B8E339c536989b8978a438", decimals: 18 },
  cUSD: { address: "0x765de816845861e75a25fca122bb6898b8b1282a", decimals: 18 },
  USDm: { address: "0x765de816845861e75a25fca122bb6898b8b1282a", decimals: 18 },
  cEUR: { address: "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73", decimals: 18 },
  cREAL: {
    address: "0xe8537a3d056da446677b9e9d6c5db704eaab4787",
    decimals: 18,
  },
  cXOF: { address: "0x73F93dcc49cb8a239e2032663e9475dd5ef29A08", decimals: 18 },
  cKES: { address: "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0", decimals: 18 },
  cPHP: { address: "0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B", decimals: 18 },
  cCOP: { address: "0x8a567e2ae79ca692bd748ab832081c45de4041ea", decimals: 18 },
  cGHS: { address: "0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313", decimals: 18 },
  cGBP: { address: "0xCCF663b1fF11028f0b19058d0f7B674004a40746", decimals: 18 },
  cZAR: { address: "0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6", decimals: 18 },
  cCAD: { address: "0xff4Ab19391af240c311c54200a492233052B6325", decimals: 18 },
  cAUD: { address: "0x7175504C455076F15c04A2F90a8e352281F492F9", decimals: 18 },
  cCHF: { address: "0xb55a79F398E759E43C95b979163f30eC87Ee131D", decimals: 18 },
  cJPY: { address: "0xc45eCF20f3CD864B32D9794d6f76814aE8892e20", decimals: 18 },
  cNGN: { address: "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71", decimals: 18 },
  USDC: { address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6 },
  USDT: { address: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e", decimals: 6 },
};

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || "https://forno.celo.org"),
});

export async function getBalance(
  address: string,
  tokenSymbol: keyof typeof TOKENS = "CELO",
) {
  try {
    const token = TOKENS[tokenSymbol];
    const tokenAddress = token.address as `0x${string}`;

    if (tokenSymbol === "CELO") {
      const balance = await publicClient.getBalance({
        address: address as `0x${string}`,
      });
      return {
        symbol: "CELO",
        formatted: Number(formatEther(balance)).toFixed(4),
        value: balance.toString(),
      };
    }

    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });

    return {
      symbol: tokenSymbol,
      formatted: (Number(balance) / 10 ** token.decimals).toFixed(4),
      value: balance.toString(),
    };
  } catch (error) {
    console.error("Transfer Error:", error);
    throw error;
  }
}

export async function swapTokens(
  privateKey: `0x${string}`,
  fromToken: keyof typeof TOKENS,
  toToken: keyof typeof TOKENS,
  amount: string,
) {
  try {
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(process.env.CELO_RPC_URL || "https://forno.celo.org"),
    });

    const tokenIn = TOKENS[fromToken];
    const tokenOut = TOKENS[toToken];
    const amountIn = BigInt(
      Math.floor(parseFloat(amount) * 10 ** tokenIn.decimals),
    );

    // 1. Get Quote
    const amountOut = await publicClient.readContract({
      address: MENTO_BROKER,
      abi: BROKER_ABI,
      functionName: "getAmountOut",
      args: [tokenIn.address as `0x${string}`, tokenOut.address as `0x${string}`, amountIn],
    });

    // 2. Approve if not CELO (CELO is native and handled differently in some pools, but Mento ERC20 CELO needs approval)
    const approveTx = await walletClient.writeContract({
      address: tokenIn.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [MENTO_BROKER, amountIn],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    // 3. Execute Swap (path is empty for direct pools)
    const hash = await walletClient.writeContract({
      address: MENTO_BROKER,
      abi: BROKER_ABI,
      functionName: "swapIn",
      args: [
        tokenIn.address as `0x${string}`,
        tokenOut.address as `0x${string}`,
        amountIn,
        (amountOut * 98n) / 100n, // 2% slippage
        [],
      ],
    });

    return {
      hash,
      amountIn: amount,
      amountOut: (Number(amountOut) / 10 ** tokenOut.decimals).toFixed(4),
    };
  } catch (error) {
    console.error("Swap Error:", error);
    throw error;
  }
}

export async function getAllBalances(address: string) {
  const symbols = Object.keys(TOKENS) as (keyof typeof TOKENS)[];
  const results = await Promise.all(
    symbols.map((s) => getBalance(address, s).catch(() => null)),
  );
  return results.filter((r) => r !== null);
}

export async function getAllowance(
  userAddress: string,
  spenderAddress: string,
  tokenSymbol: keyof typeof TOKENS,
) {
  try {
    const token = TOKENS[tokenSymbol];
    if (tokenSymbol === "CELO") return { symbol: "CELO", value: "infinite" }; // Native CELO doesn't use allowance for transfers

    const allowance = await publicClient.readContract({
      address: token.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [userAddress as `0x${string}`, spenderAddress as `0x${string}`],
    });

    return {
      symbol: tokenSymbol,
      value: allowance.toString(),
      formatted: (Number(allowance) / 10 ** token.decimals).toFixed(4),
    };
  } catch (error) {
    console.error(`Error fetching allowance for ${tokenSymbol}:`, error);
    throw error;
  }
}
