import { createWalletClient, createPublicClient, http, getContract, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

// Contract Addresses for Mainnet (Assuming deterministic deployment across chains)
const IDENTITY_REGISTRY_ADDRESS = '0xE38B95D0F55cE9b9D1D54992dc7aE456A76E1ebD';

// Minimal ABI for ERC-8004 Registration
const identityRegistryAbi = [
  {
    "inputs": [
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "string", "name": "description", "type": "string" },
      { "internalType": "string", "name": "metadataURI", "type": "string" }
    ],
    "name": "registerAgent",
    "outputs": [{ "internalType": "uint256", "name": "agentId", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "getAgentId",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

// Initialize clients
const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;

if (!privateKey) {
  console.warn('AGENT_PRIVATE_KEY is missing. Agent registration will not work.');
}

export const account = privateKey ? privateKeyToAccount(privateKey) : null;

export const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org')
});

export const walletClient = account ? createWalletClient({
  account,
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org')
}) : null;

export async function registerRemittanceAgent() {
  if (!walletClient || !account) {
    throw new Error("Agent wallet not configured. Please set AGENT_PRIVATE_KEY in .env");
  }

  // 1. Check if already registered
  const existingAgentId = await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: 'getAgentId',
    args: [account.address]
  }) as bigint;

  if (existingAgentId > 0n) {
    console.log(`Agent is already registered with ID: ${existingAgentId.toString()}`);
    return existingAgentId.toString();
  }

  console.log('Registering Remittance Bot as an ERC-8004 Agent...');

  // 2. Perform Registration
  const { request } = await publicClient.simulateContract({
    account,
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: 'registerAgent',
    args: [
      "Remittance Bot", // Name
      "An AI-powered remittance agent for seamless cross-border payments on WhatsApp and Telegram.", // Description
      "ipfs://placeholder-metadata-uri" // Metadata URI (Can be updated later)
    ]
  });

  const txHash = await walletClient.writeContract(request);
  console.log(`Registration transaction submitted: ${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log('Registration confirmed in block:', receipt.blockNumber.toString());

  // 3. Get the new Agent ID
  const newAgentId = await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: 'getAgentId',
    args: [account.address]
  }) as bigint;

  console.log(`Successfully registered! New Agent ID: ${newAgentId.toString()}`);
  return newAgentId.toString();
}
