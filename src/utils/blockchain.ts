import { ethers, BigNumber } from 'ethers';
import { logger } from './logger.ts';

/**
 * Blockchain utility functions
 */
export class BlockchainUtils {
  /**
   * Create a provider with retry logic
   */
  public static createProvider(rpcUrl: string): ethers.providers.JsonRpcProvider {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl, {
      name: 'polygon',
      chainId: 137,
      _defaultProvider: (providers) => new providers.JsonRpcProvider(rpcUrl)
    });
  
    // Add retry logic for network errors
    provider.on('error', (error) => {
      logger.error('Provider error:', error);
    });
  
    return provider;
  }

  /**
   * Get current block number with retry logic
   */
  public static async getCurrentBlockNumber(
    provider: ethers.providers.JsonRpcProvider,
    maxRetries = 3
  ): Promise<number> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await provider.getBlockNumber();
      } catch (error) {
        logger.warn(`Failed to get block number (attempt ${attempt}/${maxRetries}):`, error);
        if (attempt === maxRetries) {
          throw new Error(`Failed to get current block number after ${maxRetries} attempts`);
        }
        await this.delay(1000 * attempt);
      }
    }
    throw new Error('Unexpected error in getCurrentBlockNumber');
  }

  /**
   * Get block timestamp
   */
  public static async getBlockTimestamp(
    provider: ethers.providers.JsonRpcProvider,
    blockNumber: number
  ): Promise<Date> {
    try {
      const block = await provider.getBlock(blockNumber);
      return new Date(block.timestamp * 1000);
    } catch (error) {
      logger.error(`Failed to get block timestamp for block ${blockNumber}:`, error);
      // Fallback to current time if block fetch fails
      return new Date();
    }
  }

  /**
   * Convert BigNumber to string for database storage
   */
  public static bigNumberToString(bn: BigNumber): string {
    return bn.toString();
  }

  /**
   * Convert string back to BigNumber
   */
  public static stringToBigNumber(str: string): BigNumber {
    return BigNumber.from(str);
  }

  /**
   * Utility delay function
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate Ethereum address
   */
  public static isValidAddress(address: string): boolean {
    try {
      return ethers.utils.isAddress(address);
    } catch {
      return false;
    }
  }

  /**
   * Normalize Ethereum address to checksum format
   */
  public static normalizeAddress(address: string): string {
    return ethers.utils.getAddress(address.toLowerCase());
  }
}