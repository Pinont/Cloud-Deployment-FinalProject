import { createApp, type Favorite } from './app';

const favorites: Favorite[] = [
  { userId: 'user-1', restaurantId: 'rest-1' },
  { userId: 'user-2', restaurantId: 'rest-2' },
  { userId: 'user-1', restaurantId: 'rest-3' }
];

const app = createApp({ favorites });
const port = process.env.PORT || 3004;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`favorite-service listening on port ${port}`);
});