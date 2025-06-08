import { EventScanner } from '../../src/services/EventScanner.ts';
import { FeeEventModel } from '../../src/models/FeeEvent.ts';
import { ScanProgressModel } from '../../src/models/ScanProgress.ts';
import { ChainConfig, ScannerConfig } from '../../src/types/index.ts';
import { jest } from '@jest/globals';

/**
 * Test suite for EventScanner service
 */
describe('EventScanner', () => {
  let scanner: EventScanner;
  let chainConfig: ChainConfig;
  let scannerConfig: ScannerConfig;

  beforeAll(() => {
    chainConfig = {
      name: 'Polygon',
      chainId: 137,
      rpcUrl: 'https://polygon-rpc.com',
      contractAddress: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
      startBlock: 70000000,
    };

    scannerConfig = {
      batchSize: 1000,
      intervalMs: 5000,
      maxRetries: 3,
      retryDelayMs: 1000,
    };

    scanner = new EventScanner(chainConfig, scannerConfig);
  });

  beforeEach(async () => {
    await ScanProgressModel.deleteMany({});
    
    jest.spyOn(scanner['feeCollectorService'], 'validateContract')
      .mockResolvedValue(true);
  });

  afterEach(() => {
    scanner.stop();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize scan progress correctly', async () => {
      // Mock the contract validation to avoid actual RPC calls
      jest.spyOn(scanner['feeCollectorService'], 'validateContract')
        .mockResolvedValue(true);
      
      jest.spyOn(scanner['feeCollectorService'], 'getCurrentBlockNumber')
        .mockResolvedValue(69999999);

      jest.spyOn(scanner['feeCollectorService'], 'loadFeeCollectorEvents')
        .mockResolvedValue([]);

      await scanner.start();

      const progress = await ScanProgressModel.findOne({ chain: 'polygon' });
      expect(progress).toBeTruthy();
      expect(progress!.chain).toBe('polygon');
      expect(progress!.lastScannedBlock).toBe(69999999); // startBlock - 1
    });

    it('should not reinitialize existing scan progress', async () => {
      // Create existing progress
      await ScanProgressModel.create({
        chain: 'polygon',
        lastScannedBlock: 70000050,
        lastScanTime: new Date(),
        totalEventsFound: 10,
        totalBlocksScanned: 50,
      });

      jest.spyOn(scanner['feeCollectorService'], 'validateContract')
        .mockResolvedValue(true);
      
      jest.spyOn(scanner['feeCollectorService'], 'getCurrentBlockNumber')
        .mockResolvedValue(70000049);

      jest.spyOn(scanner['feeCollectorService'], 'loadFeeCollectorEvents')
        .mockResolvedValue([]);

      await scanner.start();

      const progress = await ScanProgressModel.findOne({ chain: 'polygon' });
      expect(progress!.lastScannedBlock).toBe(70000050); // Should not change
    });
  });

  describe('Event scanning', () => {
    beforeEach(async () => {
      // Initialize scan progress
      await ScanProgressModel.create({
        chain: 'polygon',
        lastScannedBlock: 70000000,
        lastScanTime: new Date(),
        totalEventsFound: 0,
        totalBlocksScanned: 0,
      });
    });

    it('should skip scanning when already up to date', async () => {
      jest.spyOn(scanner['feeCollectorService'], 'getCurrentBlockNumber')
        .mockResolvedValue(70000000);

      const loadEventsSpy = jest.spyOn(scanner['feeCollectorService'], 'loadFeeCollectorEvents');

      await scanner.scanForNewEvents();

      expect(loadEventsSpy).not.toHaveBeenCalled();
    });

    it('should scan new blocks and update progress', async () => {
      const mockEvents = [
        {
          blockNumber: 70000001,
          transactionHash: '0xabc123',
          logIndex: 0,
        },
      ];

      const mockParsedEvents = [
        {
          token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
          integrator: '0x1234567890123456789012345678901234567890',
          integratorFee: { toString: () => '1000000' },
          lifiFee: { toString: () => '500000' },
          blockNumber: 70000001,
          transactionHash: '0xabc123',
          logIndex: 0,
          timestamp: new Date(),
        },
      ];

      jest.spyOn(scanner['feeCollectorService'], 'getCurrentBlockNumber')
        .mockResolvedValue(70000001);

      jest.spyOn(scanner['feeCollectorService'], 'loadFeeCollectorEvents')
        .mockResolvedValue(mockEvents as any);

      jest.spyOn(scanner['feeCollectorService'], 'parseFeeCollectorEvents')
        .mockResolvedValue(mockParsedEvents as any);

      await scanner.scanForNewEvents();

      const progress = await ScanProgressModel.findOne({ chain: 'polygon' });
      expect(progress!.lastScannedBlock).toBe(70000001);
      expect(progress!.totalEventsFound).toBe(1);

      const events = await FeeEventModel.find();
      expect(events).toHaveLength(1);
      expect(events[0].blockNumber).toBe(70000001);
    });

    it('should handle batch scanning correctly', async () => {
      // Set small batch size for testing
      scanner['scannerConfig'].batchSize = 2;

      jest.spyOn(scanner['feeCollectorService'], 'getCurrentBlockNumber')
        .mockResolvedValue(70000005);

      jest.spyOn(scanner['feeCollectorService'], 'loadFeeCollectorEvents')
        .mockResolvedValue([]);

      const loadEventsSpy = jest.spyOn(scanner['feeCollectorService'], 'loadFeeCollectorEvents');

      await scanner.scanForNewEvents();

      // Should make multiple calls for batches: 70000001-70000002, 70000003-70000004, 70000005-70000005
      expect(loadEventsSpy).toHaveBeenCalledTimes(3);
      expect(loadEventsSpy).toHaveBeenCalledWith(70000001, 70000002);
      expect(loadEventsSpy).toHaveBeenCalledWith(70000003, 70000004);
      expect(loadEventsSpy).toHaveBeenCalledWith(70000005, 70000005);
    });

    it('should prevent duplicate events', async () => {
      // Insert existing event
      await FeeEventModel.create({
        token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
        integrator: '0x1234567890123456789012345678901234567890',
        integratorFee: '1000000',
        lifiFee: '500000',
        blockNumber: 70000001,
        transactionHash: '0xabc123',
        logIndex: 0,
        timestamp: new Date(),
        chain: 'polygon',
      });

      const mockParsedEvents = [
        {
          token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
          integrator: '0x1234567890123456789012345678901234567890',
          integratorFee: { toString: () => '1000000' },
          lifiFee: { toString: () => '500000' },
          blockNumber: 70000001,
          transactionHash: '0xabc123',
          logIndex: 0,
          timestamp: new Date(),
        },
      ];

      jest.spyOn(scanner['feeCollectorService'], 'getCurrentBlockNumber')
        .mockResolvedValue(70000001);

      jest.spyOn(scanner['feeCollectorService'], 'loadFeeCollectorEvents')
        .mockResolvedValue([{} as any]);

      jest.spyOn(scanner['feeCollectorService'], 'parseFeeCollectorEvents')
        .mockResolvedValue(mockParsedEvents as any);

      await scanner.scanForNewEvents();

      const events = await FeeEventModel.find();
      expect(events).toHaveLength(1); // Should still be 1, no duplicates
    });
  });

  describe('Error handling', () => {
    beforeEach(async () => {
      await ScanProgressModel.create({
        chain: 'polygon',
        lastScannedBlock: 70000000,
        lastScanTime: new Date(),
        totalEventsFound: 0,
        totalBlocksScanned: 0,
      });
    });

    it('should handle RPC errors gracefully', async () => {
      jest.spyOn(scanner['feeCollectorService'], 'getCurrentBlockNumber')
        .mockResolvedValue(70000001);

      jest.spyOn(scanner['feeCollectorService'], 'loadFeeCollectorEvents')
        .mockRejectedValue(new Error('RPC connection failed'));

      // Should not throw, but handle error internally
      await expect(scanner.scanForNewEvents()).rejects.toThrow('RPC connection failed');
    });

    it('should prevent concurrent scanning', async () => {
      jest.spyOn(scanner['feeCollectorService'], 'getCurrentBlockNumber')
        .mockResolvedValue(70000001);

      jest.spyOn(scanner['feeCollectorService'], 'loadFeeCollectorEvents')
        .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 1000)));

      // Start first scan
      const firstScan = scanner.scanForNewEvents();
      
      // Try to start second scan immediately
      await scanner.scanForNewEvents(); // Should return immediately

      await firstScan;
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await ScanProgressModel.create({
        chain: 'polygon',
        lastScannedBlock: 70000010,
        lastScanTime: new Date(),
        totalEventsFound: 5,
        totalBlocksScanned: 10,
      });
    });

    it('should return correct scanner statistics', async () => {
      const stats = await scanner.getStats();

      expect(stats).toMatchObject({
        chain: 'polygon',
        lastScannedBlock: 70000010,
        totalEvents: 5,
        totalBlocks: 10,
        isScanning: false,
      });
      expect(stats.lastScan).toBeInstanceOf(Date);
    });
  });
});