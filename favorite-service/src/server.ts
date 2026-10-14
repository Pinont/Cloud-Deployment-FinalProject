import { createApp, type CreateAppOptions, type Favorite } from './app';
import mongoose, { Schema } from 'mongoose';

const favorites: Favorite[] = [
  { userId: 'user-1', restaurantId: 'rest-1' },
  { userId: 'user-2', restaurantId: 'rest-2' },
  { userId: 'user-1', restaurantId: 'rest-3' }
];

const FavoriteSchema = new Schema<Favorite>(
  {
    userId: { type: String, required: true, trim: true },
    restaurantId: { type: String, required: true, trim: true },
    listName: { type: String, trim: true }
  },
  { versionKey: false }
);
FavoriteSchema.index({ userId: 1, restaurantId: 1 }, { unique: true });
const FavoriteModel = mongoose.models.Favorite || mongoose.model<Favorite>('Favorite', FavoriteSchema);

async function start() {
  const mongoUri = process.env.MONGO_URI;
  const appOptions: CreateAppOptions = { favorites };

  if (mongoUri) {
    await mongoose.connect(mongoUri);
    const persistedFavorites = await FavoriteModel.find({}, { _id: 0 }).lean<Favorite[]>();
    if (persistedFavorites.length > 0) {
      favorites.splice(0, favorites.length, ...persistedFavorites);
    }
    appOptions.persistFavorite = async (favorite) => {
      await FavoriteModel.create(favorite);
    };
    appOptions.deleteFavorite = async (favorite) => {
      await FavoriteModel.deleteOne({
        userId: favorite.userId,
        restaurantId: favorite.restaurantId
      });
    };
  }

  const app = createApp(appOptions);
  const port = process.env.PORT || 3004;

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`favorite-service listening on port ${port}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('favorite-service failed to start', error);
  process.exit(1);
});