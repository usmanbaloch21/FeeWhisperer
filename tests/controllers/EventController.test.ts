import request from 'supertest';
import express from 'express';
import { FeeEventModel } from '../../src/models/FeeEvent.ts';
import { ScanProgressModel } from '../../src/models/ScanProgress.ts';
import { eventRoutes } from '../../src/routes/events.ts';
import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server/index.js';

/**
 * Test suite for EventController endpoints
 */
describe('EventController', () => {
  let app: express.Application;
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    process.env.MONGODB_URI = mongoUri;
    
    app = express();
    app.use(express.json());
    app.use('/api/events', eventRoutes);
  });

  /**
   * Sample test data
   */
  const sampleEvents = [
    {
      token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      integrator: '0x1234567890123456789012345678901234567890',
      integratorFee: '1000000',
      lifiFee: '500000',
      blockNumber: 70000001,
      transactionHash: '0xabc123',
      logIndex: 0,
      timestamp: new Date('2024-01-01T10:00:00Z'),
      chain: 'polygon',
    },
    {
      token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      integrator: '0x9876543210987654321098765432109876543210',
      integratorFee: '2000000',
      lifiFee: '1000000',
      blockNumber: 70000002,
      transactionHash: '0xdef456',
      logIndex: 1,
      timestamp: new Date('2024-01-01T11:00:00Z'),
      chain: 'polygon',
    },
    {
      token: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
      integrator: '0x1234567890123456789012345678901234567890',
      integratorFee: '3000000',
      lifiFee: '1500000',
      blockNumber: 70000003,
      transactionHash: '0x789abc',
      logIndex: 0,
      timestamp: new Date('2024-01-01T12:00:00Z'),
      chain: 'polygon',
    },
  ];

  beforeEach(async () => {
    // Insert sample data before each test
    await FeeEventModel.insertMany(sampleEvents);
    
    // Insert sample scan progress
    await ScanProgressModel.create({
      chain: 'polygon',
      lastScannedBlock: 70000010,
      lastScanTime: new Date(),
      totalEventsFound: 3,
      totalBlocksScanned: 10,
    });
  });

  describe('GET /api/events', () => {
    it('should return all events with default pagination', async () => {
      const response = await request(app)
        .get('/api/events')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 3,
        pages: 1,
      });
    });

    it('should filter events by integrator', async () => {
      const integrator = '0x1234567890123456789012345678901234567890';
      const response = await request(app)
        .get(`/api/events?integrator=${integrator}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((event: any) => 
        event.integrator === integrator.toLowerCase()
      )).toBe(true);
    });

    it('should filter events by token', async () => {
      const token = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
      const response = await request(app)
        .get(`/api/events?token=${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((event: any) => 
        event.token === token.toLowerCase()
      )).toBe(true);
    });

    it('should filter events by block range', async () => {
      const response = await request(app)
        .get('/api/events?fromBlock=70000002&toBlock=70000003')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((event: any) => 
        event.blockNumber >= 70000002 && event.blockNumber <= 70000003
      )).toBe(true);
    });

    it('should handle pagination correctly', async () => {
      const response = await request(app)
        .get('/api/events?page=1&limit=2')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        pages: 2,
      });
    });

    it('should return events sorted by block number descending', async () => {
      const response = await request(app)
        .get('/api/events')
        .expect(200);

      expect(response.body.success).toBe(true);
      const blockNumbers = response.body.data.map((event: any) => event.blockNumber);
      expect(blockNumbers).toEqual([70000003, 70000002, 70000001]);
    });

    it('should return 400 for invalid integrator address', async () => {
      const response = await request(app)
        .get('/api/events?integrator=invalid-address')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid integrator address');
    });

    it('should return 400 for invalid token address', async () => {
      const response = await request(app)
        .get('/api/events?token=invalid-address')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid token address');
    });
  });

  describe('GET /api/events/integrator/:integrator', () => {
    it('should return events for specific integrator', async () => {
      const integrator = '0x1234567890123456789012345678901234567890';
      const response = await request(app)
        .get(`/api/events/integrator/${integrator}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((event: any) => 
        event.integrator === integrator.toLowerCase()
      )).toBe(true);
    });

    it('should return empty array for non-existent integrator', async () => {
      const integrator = '0x0000000000000000000000000000000000000000';
      const response = await request(app)
        .get(`/api/events/integrator/${integrator}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should return 400 for invalid integrator address', async () => {
      const response = await request(app)
        .get('/api/events/integrator/invalid-address')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid integrator address');
    });

    it('should handle pagination for integrator events', async () => {
      const integrator = '0x1234567890123456789012345678901234567890';
      const response = await request(app)
        .get(`/api/events/integrator/${integrator}?page=1&limit=1`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        pages: 2,
      });
    });
  });

  describe('GET /api/events/integrator/:integrator/stats', () => {
    it('should return correct statistics for integrator', async () => {
      const integrator = '0x1234567890123456789012345678901234567890';
      const response = await request(app)
        .get(`/api/events/integrator/${integrator}/stats`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        totalTransactions: 2,
        totalIntegratorFees: '4000000', // 1000000 + 3000000
        totalLifiFees: '2000000', // 500000 + 1500000
        uniqueTokensCount: 2,
        uniqueTokens: expect.arrayContaining([
          '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
          '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063'
        ]),
      });
      expect(new Date(response.body.data.firstTransaction)).toEqual(new Date('2024-01-01T10:00:00Z'));
      expect(new Date(response.body.data.lastTransaction)).toEqual(new Date('2024-01-01T12:00:00Z'));
    });

    it('should return zero stats for non-existent integrator', async () => {
      const integrator = '0x0000000000000000000000000000000000000000';
      const response = await request(app)
        .get(`/api/events/integrator/${integrator}/stats`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        totalTransactions: 0,
        totalIntegratorFees: '0',
        totalLifiFees: '0',
        uniqueTokensCount: 0,
        uniqueTokens: [],
        firstTransaction: null,
        lastTransaction: null,
      });
    });

    it('should return 400 for invalid integrator address', async () => {
      const response = await request(app)
        .get('/api/events/integrator/invalid-address/stats')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid integrator address');
    });
  });

  describe('GET /api/events/scanner/status', () => {
    it('should return scanner status and progress', async () => {
      const response = await request(app)
        .get('/api/events/scanner/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        chain: 'polygon',
        lastScannedBlock: 70000010,
        totalEventsFound: 3,
        totalBlocksScanned: 10,
      });
      expect(response.body.data[0].lastScanTime).toBeDefined();
    });

    it('should return empty array when no scan progress exists', async () => {
      await ScanProgressModel.deleteMany({});
      
      const response = await request(app)
        .get('/api/events/scanner/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error
      jest.spyOn(FeeEventModel, 'find').mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .get('/api/events')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database connection failed');
    });

    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/api/events?page=0') // Invalid page number
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('"page" must be greater than or equal to 1');
    });

    it('should limit maximum page size', async () => {
      const response = await request(app)
        .get('/api/events?limit=200') // Exceeds max limit of 100
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('"limit" must be less than or equal to 100');
    });
  });
});