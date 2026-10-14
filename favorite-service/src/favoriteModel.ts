import mongoose, { Schema } from 'mongoose';
import { DEFAULT_LIST_NAME, type Favorite, type ShareLink } from './app';

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

export const ShareLinkSchema = new Schema<ShareLink>(
  {
    token: { type: String, required: true, unique: true, trim: true },
    ownerId: { type: String, required: true, trim: true },
    listName: { type: String, required: true, trim: true }
  },
  { versionKey: false }
);
ShareLinkSchema.index({ ownerId: 1, listName: 1 }, { unique: true });

export const ShareLinkModel =
  mongoose.models.ShareLink || mongoose.model<ShareLink>('ShareLink', ShareLinkSchema);

export async function syncFavoriteIndexes(): Promise<string[]> {
  await Promise.all([FavoriteModel.syncIndexes(), ShareLinkModel.syncIndexes()]);
  return [];
}
