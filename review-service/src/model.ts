import mongoose, { Schema, Model } from 'mongoose';

export interface IReview {
  userId: string;
  restaurantId: string;
  rating: number;
  comment: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ReviewSchema = new Schema<IReview>(
  {
    userId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' }
  },
  {
    timestamps: true
  }
);

ReviewSchema.index({ userId: 1, restaurantId: 1 }, { unique: true });
ReviewSchema.index({ restaurantId: 1, createdAt: -1 });

export const Review: Model<IReview> =
  (mongoose.models.Review as Model<IReview>) || mongoose.model<IReview>('Review', ReviewSchema);

