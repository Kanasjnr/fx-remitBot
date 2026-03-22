import { createWalletClient, createPublicClient, http, parseEventLogs } from 'viem';
import type { PublicClient, WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

// Official ERC-8004 Identity Registry contract on Celo Mainnet
const IDENTITY_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;

const identityRegistryAbi = [
  {
    inputs: [
      { internalType: 'string', name: 'agentURI', type: 'string' },
    ],
    name: 'register',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'string', name: 'agentURI', type: 'string' },
    ],
    name: 'setAgentURI',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
] as const;

const rpcUrl = process.env.CELO_RPC_URL || 'https://forno.celo.org';
const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;

export const account = privateKey ? privateKeyToAccount(privateKey) : null;

export const publicClient = createPublicClient({
  chain: celo,
  transport: http(rpcUrl),
}) as unknown as PublicClient;

export const walletClient: WalletClient | null = account
  ? (createWalletClient({
      account,
      chain: celo,
      transport: http(rpcUrl),
    }) as unknown as WalletClient)
  : null;

/**
 * Registers a new agent (NFT mint).
 */
export async function registerRemittanceAgent(): Promise<string> {
  if (!walletClient || !account) {
    throw new Error('Agent wallet not configured. Please set AGENT_PRIVATE_KEY in .env');
  }

  const balance = (await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: 'balanceOf',
    args: [account.address],
  })) as bigint;

  if (balance > 0n) {
    console.log(`Agent is already registered. NFT balance: ${balance.toString()}`);
    return 'already-registered';
  }

  const { request } = await publicClient.simulateContract({
    account,
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: 'register',
    args: ['ipfs://placeholder'], 
  });

  const txHash = await walletClient.writeContract(request as any);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  
  const transferEvents = parseEventLogs({
    abi: identityRegistryAbi,
    logs: receipt.logs,
    eventName: 'Transfer',
  });

  return (transferEvents[0] as any).args.tokenId.toString();
}

/**
 * Updates the metadata URI for an existing agent.
 */
export async function updateAgentURI(tokenId: string, newURI: string): Promise<string> {
  if (!walletClient || !account) {
    throw new Error('Agent wallet not configured.');
  }

  console.log(`Updating Agent ${tokenId} URI to: ${newURI}...`);

  const { request } = await publicClient.simulateContract({
    account,
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: 'setAgentURI',
    args: [BigInt(tokenId), newURI],
  });

  const txHash = await walletClient.writeContract(request as any);
  console.log(`Update transaction submitted: ${txHash}`);
  
  await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  console.log('Update confirmed!');
  return txHash;
}
