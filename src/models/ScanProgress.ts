import { prop, getModelForClass, index } from '@typegoose/typegoose';
import { Types } from 'mongoose';

/**
 * Model to track scanning progress for each chain to avoid rescanning blocks
 */
@index({ chain: 1 }, { unique: true })
export class ScanProgress {
  @prop({ type: () => Types.ObjectId, auto: true })
  public _id!: Types.ObjectId;

  @prop({ type: String, required: true })
  public chain!: string;

  @prop({ type: Number, required: true })
  public lastScannedBlock!: number;

  @prop({ type: Date, required: true })
  public lastScanTime!: Date;

  @prop({ type: Number, required: true, default: 0 })
  public totalEventsFound!: number;

  @prop({ type: Number, required: true, default: 0 })
  public totalBlocksScanned!: number;

  @prop({ type: Date, default: Date.now })
  public createdAt!: Date;

  @prop({ type: Date, default: Date.now })
  public updatedAt!: Date;

  /**
   * Update progress with new scan results
   */
  public updateProgress(
    lastBlock: number,
    eventsCount: number,
    blocksScanned: number
  ): void {
    this.lastScannedBlock = Math.max(this.lastScannedBlock, lastBlock);
    this.lastScanTime = new Date();
    this.totalEventsFound += eventsCount;
    this.totalBlocksScanned += blocksScanned;
    this.updatedAt = new Date();
  }

  /**
   * Get scanning statistics
   */
  public getStats(): {
    chain: string;
    lastScannedBlock: number;
    totalEvents: number;
    totalBlocks: number;
    lastScan: Date;
  } {
    return {
      chain: this.chain,
      lastScannedBlock: this.lastScannedBlock,
      totalEvents: this.totalEventsFound,
      totalBlocks: this.totalBlocksScanned,
      lastScan: this.lastScanTime,
    };
  }
}

export const ScanProgressModel = getModelForClass(ScanProgress);