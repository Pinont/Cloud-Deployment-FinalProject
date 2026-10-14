import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { FavoriteModel, syncFavoriteIndexes } from '../src/favoriteModel';

test('MongoDB favorite index allows different lists and rejects duplicates in one list', async () => {
  const mongoServer = await MongoMemoryServer.create();

  try {
    await mongoose.connect(mongoServer.getUri());
    await FavoriteModel.collection.createIndex(
      { userId: 1, restaurantId: 1 },
      { unique: true, name: 'old_user_restaurant_unique' }
    );

    await syncFavoriteIndexes();

    const indexes = await FavoriteModel.collection.indexes();
    assert.equal(
      indexes.some(
        (index) =>
          index.unique &&
          index.key.userId === 1 &&
          index.key.restaurantId === 1 &&
          index.key.listName === 1
      ),
      true
    );
    assert.equal(indexes.some((index) => index.name === 'old_user_restaurant_unique'), false);

    await FavoriteModel.create({
      userId: 'user-1',
      restaurantId: 'rest-1',
      listName: 'คาเฟ่อยากไป'
    });
    await FavoriteModel.create({
      userId: 'user-1',
      restaurantId: 'rest-1',
      listName: 'ร้านที่เคยไป'
    });

    await assert.rejects(
      FavoriteModel.create({
        userId: 'user-1',
        restaurantId: 'rest-1',
        listName: 'คาเฟ่อยากไป'
      }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
    );
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
});
