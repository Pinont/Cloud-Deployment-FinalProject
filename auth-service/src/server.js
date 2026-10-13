const mongoose = require('mongoose');
const app = require('./app');
const User = require('./models/User');

const { PORT = 3001, MONGO_URI, JWT_SECRET } = process.env;

// Tokens cannot be signed without the shared secret, so refuse to start (before connecting).
const missing = [['MONGO_URI', MONGO_URI], ['JWT_SECRET', JWT_SECRET]].find(([, value]) => !value);

if (missing) {
  console.error(`${missing[0]} is required`);
  process.exit(1);
} else {
  mongoose
    .connect(MONGO_URI)
    .then(() => User.init())
    .then(() => app.listen(PORT, (err) => {
      if (err) {
        console.error(err);
        process.exit(1);
        return;
      }
      console.log(`auth-service listening on ${PORT}`);
    }))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
