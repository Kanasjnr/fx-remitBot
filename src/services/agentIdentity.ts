import { createWalletClient, createPublicClient, http, parseEventLogs } from 'viem';
import type { PublicClient, WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

// Official ERC-8004 Identity Registry contract on Celo Mainnet
// Source: https://github.com/erc-8004/erc-8004-contracts
const IDENTITY_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;

// Correct ABI based on official skill documentation — register(string agentURI) = ERC721 NFT mint
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

if (!privateKey) {
  console.warn('AGENT_PRIVATE_KEY is missing. Agent registration will not work.');
}

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

export async function registerRemittanceAgent(): Promise<string> {
  if (!walletClient || !account) {
    throw new Error('Agent wallet not configured. Please set AGENT_PRIVATE_KEY in .env');
  }

  // 1. Check if already registered (balance > 0 means has an NFT token)
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

  console.log(`Registering Remittance Bot as an ERC-8004 Agent on Celo Mainnet...`);
  console.log(`Agent address: ${account.address}`);

  // 2. Submit the registration transaction
  const { request } = await publicClient.simulateContract({
    account,
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: 'register',
    args: ['ipfs://bafybeibfawjahbpw3zxltilzwrjvpbpbpbpbpbpbpbpbp'], // placeholder metadata URI
  });

  const txHash = await walletClient.writeContract(request as any);
  console.log(`Registration transaction submitted: ${txHash}`);

  // 3. Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  console.log('Registration confirmed in block:', receipt.blockNumber.toString());

  // 4. Parse the Transfer event to get the tokenId (agentId)
  const transferEvents = parseEventLogs({
    abi: identityRegistryAbi,
    logs: receipt.logs,
    eventName: 'Transfer',
  });

  if (transferEvents.length > 0) {
    const agentId = (transferEvents[0] as any).args.tokenId;
    console.log(`Successfully registered! Agent ID (Token ID): ${agentId.toString()}`);
    return agentId.toString();
  }

  console.log('Registration confirmed but could not parse agent ID from logs.');
  return 'registered';
}
