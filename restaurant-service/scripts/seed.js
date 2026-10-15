// #100 — seeds sample restaurants. Idempotent: re-running updates them, never duplicates.
// Usage (compose): docker compose exec restaurant npm run seed
// Usage (local):   MONGO_URI=mongodb://localhost:27017/restaurant-db npm run seed
const mongoose = require('mongoose');
const Restaurant = require('../src/models/restaurant');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/restaurant';
const OWNER_ID = 'seed-owner';

const restaurants = [
  { name: 'Jay Fai', category: 'thai', priceRange: 4, address: '327 Maha Chai Rd, Phra Nakhon, Bangkok', openTime: '14:00', closeTime: '20:00', lat: 13.7523, lng: 100.5046 },
  { name: 'Thipsamai Pad Thai', category: 'thai', priceRange: 2, address: '313 Maha Chai Rd, Phra Nakhon, Bangkok', openTime: '17:00', closeTime: '23:59', lat: 13.7519, lng: 100.5047 },
  { name: 'Somtum Der', category: 'thai', priceRange: 2, address: '5/1 Convent Rd, Silom, Bangkok', openTime: '11:00', closeTime: '22:00', lat: 13.7266, lng: 100.5337 },
  { name: 'Sushi Masato', category: 'japanese', priceRange: 4, address: 'Sukhumvit 31, Watthana, Bangkok', openTime: '18:00', closeTime: '23:00', lat: 13.7329, lng: 100.5683 },
  { name: 'Ootoya Siam', category: 'japanese', priceRange: 2, address: 'Siam Square One, Pathum Wan, Bangkok', openTime: '10:00', closeTime: '22:00', lat: 13.7457, lng: 100.534 },
  { name: 'Pizza Massilia', category: 'italian', priceRange: 3, address: 'Sukhumvit 31, Watthana, Bangkok', openTime: '11:30', closeTime: '23:00', lat: 13.734, lng: 100.568 },
  { name: 'Roast Coffee & Eatery', category: 'cafe', priceRange: 2, address: 'The Commons Thonglor, Bangkok', openTime: '08:00', closeTime: '22:00', lat: 13.7305, lng: 100.578 },
  { name: 'Bangkok Burger Bar', category: 'western', priceRange: 2, address: 'Ari Soi 4, Phaya Thai, Bangkok', openTime: '11:00', closeTime: '02:00', lat: 13.779, lng: 100.5446 },
  { name: 'Yaowarat Seafood', category: 'chinese', priceRange: 3, address: 'Yaowarat Rd, Samphanthawong, Bangkok', openTime: '17:00', closeTime: '01:00', lat: 13.74, lng: 100.51 },
  { name: 'Veggie Hut', category: 'vegetarian', priceRange: 1, address: 'Phra Athit Rd, Phra Nakhon, Bangkok', openTime: '09:00', closeTime: '20:00', lat: 13.7625, lng: 100.4968 },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  for (const data of restaurants) {
    await Restaurant.findOneAndUpdate(
      { name: data.name, ownerId: OWNER_ID },
      { ...data, ownerId: OWNER_ID },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }
  console.log(`Seeded ${restaurants.length} restaurants into ${mongoose.connection.name}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});
