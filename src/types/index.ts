import { BigNumber } from 'ethers';

/**
 * Parsed fee collected event data
 */
export interface ParsedFeeCollectedEvent {
  token: string;
  integrator: string;
  integratorFee: BigNumber;
  lifiFee: BigNumber;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp: Date;
}

/**
 * Supported blockchain networks
 */
export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  startBlock: number;
}

/**
 * Scanner configuration
 */
export interface ScannerConfig {
  batchSize: number;
  intervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * API response types
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Event query parameters
 */
export interface EventQueryParams {
  integrator?: string;
  token?: string;
  fromBlock?: number;
  toBlock?: number;
  page?: number;
  limit?: number;
}