import { FeeCollectorService } from './FeeCollectorService';
import { FeeEventModel } from '../models/FeeEvent';
import { ScanProgressModel } from '../models/ScanProgress';
import { ChainConfig, ScannerConfig, ParsedFeeCollectedEvent } from '../types/index';
import {  createChildLogger } from '../utils/logger';
import { BlockchainUtils } from '../utils/blockchain';

/**
 * Event scanner service that efficiently scans for new events and stores them
 */
export class EventScanner {
  private feeCollectorService: FeeCollectorService;
  private chainConfig: ChainConfig;
  private scannerConfig: ScannerConfig;
  private isScanning = false;
  private scanInterval?: NodeJS.Timeout;
  private scanLogger;

  constructor(chainConfig: ChainConfig, scannerConfig: ScannerConfig) {
    this.chainConfig = chainConfig;
    this.scannerConfig = scannerConfig;
    this.feeCollectorService = new FeeCollectorService(chainConfig);
    this.scanLogger = createChildLogger({ chain: chainConfig.name });
  }

  /**
   * Start the event scanner with periodic scanning
   */
  public async start(): Promise<void> {
    this.scanLogger.info('Starting event scanner', {
      batchSize: this.scannerConfig.batchSize,
      intervalMs: this.scannerConfig.intervalMs,
      startBlock: this.chainConfig.startBlock,
    });
    try {
    // Validate contract before starting
    const isValid = await this.feeCollectorService.validateContract();
    if (!isValid) {
      this.scanLogger.error(`Invalid contract at address ${this.chainConfig.contractAddress}`);
      return; 
    }

    await this.initializeScanProgress();

    // Initialize scan progress if not exists
    await this.scanForNewEvents().catch((error) => {
      this.scanLogger.error('Initial scan failed:', error);
    });

    // Run initial scan
    await this.scanForNewEvents().catch((error) => {
      this.scanLogger.error('Initial scan failed:', error);
    });

    // Set up periodic scanning
    this.scanInterval = setInterval(async () => {
      if (!this.isScanning) {
        await this.scanForNewEvents().catch((error) => {
          this.scanLogger.error('Periodic scan failed:', error);
        });
      }
    }, this.scannerConfig.intervalMs);

    this.scanLogger.info('Event scanner started successfully');
  } 
  catch (error) {
    this.scanLogger.error('Event scanner failed to start:', error);
  }
  }

  /**
   * Stop the event scanner
   */
  public stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }
    this.scanLogger.info('Event scanner stopped');
  }

  /**
   * Scan for new events since last scan
   */
  public async scanForNewEvents(): Promise<void> {
    if (this.isScanning) {
      this.scanLogger.warn('Scan already in progress, skipping');
      return;
    }

    this.isScanning = true;
    const startTime = Date.now();

    try {
      const progress = await this.getScanProgress();
      const currentBlock = await this.feeCollectorService.getCurrentBlockNumber();
      
      if (progress.lastScannedBlock >= currentBlock) {
        this.scanLogger.debug('Already up to date', {
          lastScanned: progress.lastScannedBlock,
          currentBlock,
        });
        return;
      }

      let fromBlock = progress.lastScannedBlock + 1;
      let totalEventsFound = 0;
      let totalBlocksScanned = 0;

      // Scan in batches to avoid RPC limits and memory issues
      while (fromBlock <= currentBlock) {
        const toBlock = Math.min(fromBlock + this.scannerConfig.batchSize - 1, currentBlock);
        
        try {
          const batchResult = await this.scanBatch(fromBlock, toBlock);
          totalEventsFound += batchResult.eventsCount;
          totalBlocksScanned += (toBlock - fromBlock + 1);

          // Update progress after each successful batch
          progress.updateProgress(toBlock, batchResult.eventsCount, toBlock - fromBlock + 1);
          await progress.save();

          fromBlock = toBlock + 1;

          // Add small delay between batches to be respectful to RPC providers
          if (fromBlock <= currentBlock) {
            await this.delay(500);
          }

        } catch (error) {
          this.scanLogger.error(`Failed to scan batch ${fromBlock}-${toBlock}:`, error);
          
          // Implement exponential backoff for retries
          await this.retryWithBackoff(async () => {
            const retryResult = await this.scanBatch(fromBlock, toBlock);
            totalEventsFound += retryResult.eventsCount;
            totalBlocksScanned += (toBlock - fromBlock + 1);
            progress.updateProgress(toBlock, retryResult.eventsCount, toBlock - fromBlock + 1);
            await progress.save();
          });

          fromBlock = toBlock + 1;
        } 
      }

      const duration = Date.now() - startTime;
      this.scanLogger.info('Scan completed', {
        totalEvents: totalEventsFound,
        totalBlocks: totalBlocksScanned,
        durationMs: duration,
        blocksPerSecond: totalBlocksScanned / (duration / 1000),
      });

    } catch (error) {
      this.scanLogger.error('Scan failed:', error);
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Scan a specific batch of blocks
   */
  private async scanBatch(fromBlock: number, toBlock: number): Promise<{ eventsCount: number }> {
    this.scanLogger.debug(`Scanning batch: ${fromBlock} to ${toBlock}`);

    const events = await this.feeCollectorService.loadFeeCollectorEvents(fromBlock, toBlock);
    
    if (events.length === 0) {
      return { eventsCount: 0 };
    }

    const parsedEvents = await this.feeCollectorService.parseFeeCollectorEvents(events);
    await this.storeEvents(parsedEvents);

    return { eventsCount: parsedEvents.length };
  }

  /**
   * Store parsed events in the database with duplicate prevention
   */
  private async storeEvents(events: ParsedFeeCollectedEvent[]): Promise<void> {
    if (events.length === 0) return;

    const feeEvents = events.map(event => ({
      token: event.token,
      integrator: event.integrator,
      integratorFee: BlockchainUtils.bigNumberToString(event.integratorFee),
      lifiFee: BlockchainUtils.bigNumberToString(event.lifiFee),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      timestamp: event.timestamp,
      chain: this.chainConfig.name.toLowerCase(),
    }));

    try {
      // Use insertMany with ordered:false to continue on duplicates
      await FeeEventModel.insertMany(feeEvents, { ordered: false });
      this.scanLogger.debug(`Stored ${events.length} new events`);
    } catch (error: any) {
      // MongoDB duplicate key errors are expected and can be ignored
      if (error.code === 11000) {
        const insertedCount = events.length - (error.writeErrors?.length || 0);
        this.scanLogger.debug(`Stored ${insertedCount} new events (${error.writeErrors?.length || 0} duplicates skipped)`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Initialize scan progress for this chain
   */
  private async initializeScanProgress(): Promise<void> {
    const existing = await ScanProgressModel.findOne({ chain: this.chainConfig.name.toLowerCase() });
    
    if (!existing) {
      await ScanProgressModel.create({
        chain: this.chainConfig.name.toLowerCase(),
        lastScannedBlock: this.chainConfig.startBlock - 1, // Start scanning from startBlock
        lastScanTime: new Date(),
        totalEventsFound: 0,
        totalBlocksScanned: 0,
      });
      this.scanLogger.info(`Initialized scan progress starting from block ${this.chainConfig.startBlock}`);
    }
  }

  /**
   * Get current scan progress
   */
  private async getScanProgress() {
    const progress = await ScanProgressModel.findOne({ chain: this.chainConfig.name.toLowerCase() });
    if (!progress) {
      throw new Error(`Scan progress not found for chain ${this.chainConfig.name}`);
    }
    return progress;
  }

  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff(operation: () => Promise<void>): Promise<void> {
    for (let attempt = 1; attempt <= this.scannerConfig.maxRetries; attempt++) {
      try {
        await operation();
        return;
      } catch (error) {
        if (attempt === this.scannerConfig.maxRetries) {
          throw error;
        }
        
        const delay = this.scannerConfig.retryDelayMs * Math.pow(2, attempt - 1);
        this.scanLogger.warn(`Retry attempt ${attempt} failed, waiting ${delay}ms:`, error);
        await this.delay(delay);
      }
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get scanner statistics
   */
  public async getStats() {
    const progress = await this.getScanProgress();
    return {
      ...progress.getStats(),
      isScanning: this.isScanning,
    };
  }
}