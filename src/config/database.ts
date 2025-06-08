import mongoose from 'mongoose';
import { logger } from '../utils/logger';

/**
 * Database configuration and connection management
 */
export class DatabaseConfig {
  private static instance: DatabaseConfig;
  private connection: mongoose.Connection | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseConfig {
    if (!DatabaseConfig.instance) {
      DatabaseConfig.instance = new DatabaseConfig();
    }
    return DatabaseConfig.instance;
  }

  /**
   * Connect to MongoDB with retry logic
   */
  public async connect(uri: string, retries = 5): Promise<void> {
    try {
      await mongoose.connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      this.connection = mongoose.connection;

      this.connection.on('error', (error) => {
        logger.error('MongoDB connection error:', error);
      });

      this.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });

      this.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
      });

      logger.info('Successfully connected to MongoDB');
    } catch (error) {
      if (retries > 0) {
        logger.warn(`MongoDB connection failed, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return this.connect(uri, retries - 1);
      }
      logger.error('Failed to connect to MongoDB after multiple attempts:', error);
      throw error;
    }
  }

  /**
   * Gracefully disconnect from MongoDB
   */
  public async disconnect(): Promise<void> {
    if (this.connection) {
      await mongoose.disconnect();
      logger.info('Disconnected from MongoDB');
    }
  }

  /**
   * Check if database is connected
   */
  public isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }
}