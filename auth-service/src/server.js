const mongoose = require('mongoose');
const app = require('./app');
const User = require('./models/User');

const { PORT = 3001, MONGO_URI } = process.env;

if (!MONGO_URI) {
  console.error('MONGO_URI is required');
  process.exit(1);
}

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
