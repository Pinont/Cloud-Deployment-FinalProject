import mongoose, { Schema } from 'mongoose';
import { DEFAULT_LIST_NAME, type Favorite } from './app';

export const FavoriteSchema = new Schema<Favorite>(
  {
    userId: { type: String, required: true, trim: true },
    restaurantId: { type: String, required: true, trim: true },
    listName: { type: String, trim: true, default: DEFAULT_LIST_NAME }
  },
  { versionKey: false }
);
FavoriteSchema.index({ userId: 1, restaurantId: 1, listName: 1 }, { unique: true });

export const FavoriteModel =
  mongoose.models.Favorite || mongoose.model<Favorite>('Favorite', FavoriteSchema);

export function syncFavoriteIndexes(): Promise<string[]> {
  return FavoriteModel.syncIndexes();
}
