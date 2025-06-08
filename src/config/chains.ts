import { ChainConfig } from '../types/index';

/**
 * Blockchain network configurations
 */
export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  polygon: {
    name: 'Polygon',
    chainId: 137,
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    contractAddress: process.env.FEE_COLLECTOR_ADDRESS || '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
    startBlock: parseInt(process.env.STARTING_BLOCK || '70000000', 10),
  },
  // Future chains can be added here
  // ethereum: { ... },
  // arbitrum: { ... },
};

/**
 * Get chain configuration by name
 */
export function getChainConfig(chainName: string): ChainConfig {
  const config = SUPPORTED_CHAINS[chainName.toLowerCase()];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }
  return config;
}

/**
 * Get all supported chain names
 */
export function getSupportedChains(): string[] {
  return Object.keys(SUPPORTED_CHAINS);
}