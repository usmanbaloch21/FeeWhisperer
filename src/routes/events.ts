import { Router } from 'express';
import { EventController } from '../controllers/EventController';

/**
 * Event-related API routes
 */
export const eventRoutes = Router();

/**
 * GET /api/events
 * Get events with optional filtering and pagination
 * Query parameters:
 * - integrator: Filter by integrator address
 * - token: Filter by token address
 * - fromBlock: Filter events from this block number
 * - toBlock: Filter events up to this block number
 * - page: Page number for pagination (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 */
eventRoutes.get('/', EventController.getEvents);

/**
 * GET /api/events/integrator/:integrator
 * Get all events for a specific integrator
 * Parameters:
 * - integrator: Ethereum address of the integrator
 * Query parameters:
 * - page: Page number for pagination (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 */
eventRoutes.get('/integrator/:integrator', EventController.getEventsByIntegrator);

/**
 * GET /api/events/integrator/:integrator/stats
 * Get aggregated statistics for a specific integrator
 * Parameters:
 * - integrator: Ethereum address of the integrator
 */
eventRoutes.get('/integrator/:integrator/stats', EventController.getIntegratorStats);

/**
 * GET /api/events/scanner/status
 * Get current scanner status and progress
 */
eventRoutes.get('/scanner/status', EventController.getScannerStatus);