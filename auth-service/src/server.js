const mongoose = require('mongoose');
const app = require('./app');

const { PORT = 3001, MONGO_URI, JWT_SECRET } = process.env;

if (!JWT_SECRET) {
  console.error('JWT_SECRET is required');
  process.exit(1);
}
if (!MONGO_URI) {
  console.error('MONGO_URI is required');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`auth-service listening on ${PORT}`)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
