import mongoose, { Schema, Model } from 'mongoose';

export interface IReviewReply {
  comment: string;
  createdAt?: Date;
}

export interface IReview {
  userId: string;
  restaurantId: string;
  rating: number;
  comment: string;
  reply?: IReviewReply;
  likes?: number;
  likedBy?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export const ReviewReplySchema = new Schema<IReviewReply>(
  {
    comment: { type: String, required: true },
    createdAt: { type: Date }
  },
  { _id: false }
);

export const ReviewSchema = new Schema<IReview>(
  {
    userId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
    reply: {
      type: ReviewReplySchema,
      default: undefined
    },
    likes: { type: Number, default: 0 },
    // ponytail: likedBy array grows per review; 16MB document size ceiling (~hundreds of thousands of likes). Upgrade path = separate ReviewLike collection if needed.
    likedBy: { type: [String], default: [], select: false }
  },
  {
    timestamps: true
  }
);

ReviewSchema.index({ userId: 1, restaurantId: 1 }, { unique: true });
ReviewSchema.index({ restaurantId: 1, createdAt: -1 });

export const Review: Model<IReview> =
  (mongoose.models.Review as Model<IReview>) || mongoose.model<IReview>('Review', ReviewSchema);
