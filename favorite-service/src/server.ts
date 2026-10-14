import { createApp, type CreateAppOptions, type Favorite, type ShareLink } from './app';
import { FavoriteModel, ShareLinkModel, syncFavoriteIndexes } from './favoriteModel';
import mongoose from 'mongoose';

const favorites: Favorite[] = [
  { userId: 'user-1', restaurantId: 'rest-1' },
  { userId: 'user-2', restaurantId: 'rest-2' },
  { userId: 'user-1', restaurantId: 'rest-3' }
];
const sharedLinks: ShareLink[] = [];

const favoriteDocumentIds = new WeakMap<Favorite, mongoose.Types.ObjectId>();
type PersistedFavorite = Favorite & { _id: mongoose.Types.ObjectId };

async function start() {
  const mongoUri = process.env.MONGO_URI;
  const appOptions: CreateAppOptions = { favorites };

  if (mongoUri) {
    await mongoose.connect(mongoUri);
    await syncFavoriteIndexes();
    const [persistedFavorites, persistedShareLinks] = await Promise.all([
      FavoriteModel.find({}).lean<PersistedFavorite[]>(),
      ShareLinkModel.find({}).lean<ShareLink[]>()
    ]);
    if (persistedFavorites.length > 0) {
      const loadedFavorites = persistedFavorites.map(({ _id, ...favorite }) => {
        favoriteDocumentIds.set(favorite, _id);
        return favorite;
      });
      favorites.splice(0, favorites.length, ...loadedFavorites);
    }
    sharedLinks.push(...persistedShareLinks);
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
    appOptions.persistShareLink = async (shareLink) => {
      await ShareLinkModel.create(shareLink);
    };
    appOptions.revokeShareLink = async (shareLink) => {
      await ShareLinkModel.deleteOne({ token: shareLink.token });
    };
  }

  const app = createApp({ ...appOptions, sharedLinks });
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