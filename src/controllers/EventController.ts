import { Request, Response } from 'express';
import { FeeEventModel } from '../models/FeeEvent';
import { ScanProgressModel } from '../models/ScanProgress';
import { ApiResponse, EventQueryParams } from '../types/index';
import { logger } from '../utils/logger';
import { BlockchainUtils } from '../utils/blockchain';
import Joi from 'joi';

/**
 * Controller for handling fee event API requests
 */
export class EventController {
  /**
   * Get events with filtering and pagination
   */
  public static async getEvents(req: Request, res: Response): Promise<void> {
    try {
      const params = await EventController.validateQueryParams(req.query);
      
      // Build MongoDB query
      const query: any = {};
      
      if (params.integrator) {
        query.integrator = params.integrator.toLowerCase();
      }
      
      if (params.token) {
        query.token = params.token.toLowerCase();
      }
      
      if (params.fromBlock || params.toBlock) {
        query.blockNumber = {};
        if (params.fromBlock) query.blockNumber.$gte = params.fromBlock;
        if (params.toBlock) query.blockNumber.$lte = params.toBlock;
      }

      // Pagination
      const page = params.page || 1;
      const limit = params.limit || 50;
      const skip = (page - 1) * limit;

      // Execute query with pagination
      const [events, total] = await Promise.all([
        FeeEventModel.find(query)
          .sort({ blockNumber: -1, logIndex: -1 }) // Most recent first
          .skip(skip)
          .limit(limit)
          .lean(),
        FeeEventModel.countDocuments(query)
      ]);

      const response: ApiResponse<typeof events> = {
        success: true,
        data: events,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };

      res.json(response);
      
    } catch (error) {
      logger.error('Failed to get events:', error);
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      };
      res.status(400).json(response);
    }
  }

  /**
   * Get events for a specific integrator
   */
  public static async getEventsByIntegrator(req: Request, res: Response): Promise<void> {
    try {
      const { integrator } = req.params;
      
      if (!integrator || !BlockchainUtils.isValidAddress(integrator)) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Invalid integrator address',
        };
        res.status(400).json(response);
        return;
      }

      const normalizedIntegrator = integrator.toLowerCase();
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const skip = (page - 1) * limit;

      const [events, total] = await Promise.all([
        FeeEventModel.find({ integrator: normalizedIntegrator })
          .sort({ blockNumber: -1, logIndex: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        FeeEventModel.countDocuments({ integrator: normalizedIntegrator })
      ]);

      const response: ApiResponse<typeof events> = {
        success: true,
        data: events,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };

      res.json(response);
      
    } catch (error) {
      logger.error('Failed to get events by integrator:', error);
      const response: ApiResponse<null> = {
        success: false,
        error: 'Internal server error',
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get aggregated statistics for an integrator
   */
  public static async getIntegratorStats(req: Request, res: Response): Promise<void> {
    try {
      const { integrator } = req.params;
      
      if (!integrator || !BlockchainUtils.isValidAddress(integrator)) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Invalid integrator address',
        };
        res.status(400).json(response);
        return;
      }

      const normalizedIntegrator = integrator.toLowerCase();

      const stats = await FeeEventModel.aggregate([
        { $match: { integrator: normalizedIntegrator } },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalIntegratorFees: { $sum: { $toDecimal: '$integratorFee' } },
            totalLifiFees: { $sum: { $toDecimal: '$lifiFee' } },
            uniqueTokens: { $addToSet: '$token' },
            firstTransaction: { $min: '$timestamp' },
            lastTransaction: { $max: '$timestamp' },
          },
        },
        {
          $project: {
            _id: 0,
            totalTransactions: 1,
            totalIntegratorFees: { $toString: '$totalIntegratorFees' },
            totalLifiFees: { $toString: '$totalLifiFees' },
            uniqueTokensCount: { $size: '$uniqueTokens' },
            uniqueTokens: 1,
            firstTransaction: 1,
            lastTransaction: 1,
          },
        },
      ]);

      const response: ApiResponse<typeof stats> = {
        success: true,
        data: stats[0] || {
          totalTransactions: 0,
          totalIntegratorFees: '0',
          totalLifiFees: '0',
          uniqueTokensCount: 0,
          uniqueTokens: [],
          firstTransaction: null,
          lastTransaction: null,
        },
      };

      res.json(response);
      
    } catch (error) {
      logger.error('Failed to get integrator stats:', error);
      const response: ApiResponse<null> = {
        success: false,
        error: 'Internal server error',
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get scanner status and statistics
   */
  public static async getScannerStatus(_req: Request, res: Response): Promise<void> {
    try {
      const progress = await ScanProgressModel.find().lean();
      
      const response: ApiResponse<typeof progress> = {
        success: true,
        data: progress,
      };

      res.json(response);
      
    } catch (error) {
      logger.error('Failed to get scanner status:', error);
      const response: ApiResponse<null> = {
        success: false,
        error: 'Internal server error',
      };
      res.status(500).json(response);
    }
  }

  /**
   * Validate query parameters
   */
  private static async validateQueryParams(query: any): Promise<EventQueryParams> {
    const schema = Joi.object({
      integrator: Joi.string().custom((value, helpers) => {
        if (!BlockchainUtils.isValidAddress(value)) {
          return helpers.message({ custom: 'Invalid integrator address' });
        }
        return value;
      }),
      token: Joi.string().custom((value, helpers) => {
        if (!BlockchainUtils.isValidAddress(value)) {
          return helpers.message({ custom: 'Invalid token address' });
        }
        return value;
      }),
      fromBlock: Joi.number().integer().min(0),
      toBlock: Joi.number().integer().min(0),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(50),
    });

    const { error, value } = schema.validate(query);
    if (error) {
      throw new Error(error.details[0].message);
    }

    return value;
  }
}