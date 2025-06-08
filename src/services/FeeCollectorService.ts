import { ethers, BigNumber } from 'ethers';
import { ParsedFeeCollectedEvent, ChainConfig } from '../types/index.ts';
import { BlockchainUtils } from '../utils/blockchain.ts';
import { logger } from '../utils/logger.ts';

/**
 * Service for interacting with FeeCollector smart contracts
 */
export class FeeCollectorService {
  private provider: ethers.providers.JsonRpcProvider;
  private contract: ethers.Contract;
  private chainConfig: ChainConfig;

  constructor(chainConfig: ChainConfig) {
    this.chainConfig = chainConfig;
    this.provider = BlockchainUtils.createProvider(chainConfig.rpcUrl);
    
    // Create contract interface for FeeCollector
    // Note: In production, you would import the actual ABI from lifi-contract-types
    const feeCollectorABI = [
      'event FeesCollected(address indexed token, address indexed integrator, uint256 integratorFee, uint256 lifiFee)'
    ];
    
    this.contract = new ethers.Contract(
      chainConfig.contractAddress,
      feeCollectorABI,
      this.provider
    );

    this.contract.on('error', (error) => {
      logger.error('Contract error:', error);
    });
  }

  /**
   * Load fee collector events for a given block range
   */
  public async loadFeeCollectorEvents(
    fromBlock: number,
    toBlock: number
  ): Promise<ethers.Event[]> {
    try {
      logger.info(`Loading events from block ${fromBlock} to ${toBlock} on ${this.chainConfig.name}`);
      
      const filter = this.contract.filters.FeesCollected();
      const events = await this.contract.queryFilter(filter, fromBlock, toBlock);
      
      logger.info(`Found ${events.length} FeesCollected events`);
      return events;
      
    } catch (error) {
      logger.error(`Failed to load events from ${fromBlock} to ${toBlock}:`, error);
      throw new Error(`Event loading failed: ${error}`);
    }
  }

  /**
   * Parse raw events into structured data
   */
  public async parseFeeCollectorEvents(
    events: ethers.Event[]
  ): Promise<ParsedFeeCollectedEvent[]> {
    const parsedEvents: ParsedFeeCollectedEvent[] = [];

    for (const event of events) {
      try {
        const parsedLog = this.contract.interface.parseLog(event);

        if (!parsedLog.args || !parsedLog.args[0] || !parsedLog.args[1]) {
          logger.warn(`Invalid event arguments for ${event.transactionHash}`);
          continue;
        }
        
        // Get block timestamp for the event
        const timestamp = await BlockchainUtils.getBlockTimestamp(
          this.provider,
          event.blockNumber
        );

        const parsedEvent: ParsedFeeCollectedEvent = {
          token: BlockchainUtils.normalizeAddress(parsedLog.args[0]),
          integrator: BlockchainUtils.normalizeAddress(parsedLog.args[1]),
          integratorFee: BigNumber.from(parsedLog.args[2]),
          lifiFee: BigNumber.from(parsedLog.args[3]),
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex || 0,
          timestamp,
        };

        parsedEvents.push(parsedEvent);
        
      } catch (error) {
        logger.warn(`Failed to parse event ${event.transactionHash}:`, error);
        // Continue processing other events instead of failing completely
      }
    }

    return parsedEvents;
  }

  /**
   * Get current block number from the chain
   */
  public async getCurrentBlockNumber(): Promise<number> {
    return BlockchainUtils.getCurrentBlockNumber(this.provider);
  }

  /**
   * Validate that the contract exists at the configured address
   */
  public async validateContract(): Promise<boolean> {
    try {
      const code = await this.provider.getCode(this.chainConfig.contractAddress);
      return code !== '0x';
    } catch (error) {
      logger.error('Failed to validate contract:', error);
      return false;
    }
  }

  /**
   * Get chain configuration
   */
  public getChainConfig(): ChainConfig {
    return this.chainConfig;
  }
}