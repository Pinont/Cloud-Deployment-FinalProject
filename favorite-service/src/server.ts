import { createApp, DEFAULT_LIST_NAME, type CreateAppOptions, type Favorite } from './app';
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
    listName: { type: String, trim: true, default: DEFAULT_LIST_NAME }
  },
  { versionKey: false }
);
FavoriteSchema.index({ userId: 1, restaurantId: 1, listName: 1 }, { unique: true });
const FavoriteModel = mongoose.models.Favorite || mongoose.model<Favorite>('Favorite', FavoriteSchema);
const favoriteDocumentIds = new WeakMap<Favorite, mongoose.Types.ObjectId>();
type PersistedFavorite = Favorite & { _id: mongoose.Types.ObjectId };

async function start() {
  const mongoUri = process.env.MONGO_URI;
  const appOptions: CreateAppOptions = { favorites };

  if (mongoUri) {
    await mongoose.connect(mongoUri);
    await FavoriteModel.syncIndexes();
    const persistedFavorites = await FavoriteModel.find({}).lean<PersistedFavorite[]>();
    if (persistedFavorites.length > 0) {
      const loadedFavorites = persistedFavorites.map(({ _id, ...favorite }) => {
        favoriteDocumentIds.set(favorite, _id);
        return favorite;
      });
      favorites.splice(0, favorites.length, ...loadedFavorites);
    }
    appOptions.persistFavorite = async (favorite) => {
      const createdFavorite = await FavoriteModel.create(favorite);
      favoriteDocumentIds.set(favorite, createdFavorite._id);
    };
    appOptions.deleteFavorite = async (favorite) => {
      const documentId = favoriteDocumentIds.get(favorite);
      if (!documentId) {
        return;
      }
      await FavoriteModel.deleteOne({ _id: documentId });
      favoriteDocumentIds.delete(favorite);
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