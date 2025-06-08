import { prop, getModelForClass, index, pre, modelOptions, Severity } from '@typegoose/typegoose';
import { Types } from 'mongoose';

@modelOptions({
  schemaOptions: {
    collection: 'feeevents',
    timestamps: true
  },
  options: {
    allowMixed: Severity.ALLOW
  }
})
@pre<FeeEvent>('save', function() {
  // Normalize addresses to lowercase for consistent querying
  this.token = this.token.toLowerCase();
  this.integrator = this.integrator.toLowerCase();
})
@index({ integrator: 1, blockNumber: -1 })
@index({ token: 1, blockNumber: -1 })
@index({ blockNumber: -1 })
@index({ transactionHash: 1, logIndex: 1 }, { unique: true })
@index({ createdAt: -1 })
export class FeeEvent {
  @prop({ type: () => Types.ObjectId, auto: true })
  public _id!: Types.ObjectId;

  @prop({ type: String, required: true })
  public token!: string;

  @prop({ type: String, required: true })
  public integrator!: string;

  @prop({ type: String, required: true })
  public integratorFee!: string;

  @prop({ type: String, required: true })
  public lifiFee!: string;

  @prop({ type: Number, required: true })
  public blockNumber!: number;

  @prop({ type: String, required: true })
  public transactionHash!: string;

  @prop({ type: Number, required: true })
  public logIndex!: number;

  @prop({ type: Date, required: true })
  public timestamp!: Date;

  @prop({ type: String, required: true, default: 'polygon' })
  public chain!: string;

  @prop({ type: Date, default: Date.now })
  public createdAt!: Date;

  @prop({ type: Date, default: Date.now })
  public updatedAt!: Date;

  /**
   * Get total fee amount (integrator + lifi)
   */
  public getTotalFee(): string {
    const integrator = BigInt(this.integratorFee);
    const lifi = BigInt(this.lifiFee);
    return (integrator + lifi).toString();
  }

  /**
   * Check if this is a high-value transaction (for monitoring/alerting)
   */
  public isHighValue(threshold = '1000000000000000000'): boolean { // 1 ETH equivalent
    return BigInt(this.getTotalFee()) > BigInt(threshold);
  }
}

export const FeeEventModel = getModelForClass(FeeEvent);