import mongoose from 'mongoose';
import { createApp } from './app';
import { Review } from './model';

const port = process.env.PORT || 3003;
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/review-db';

async function startServer(): Promise<void> {
  try {
    await mongoose.connect(mongoUri);
    await Review.init();
    const redactedUri = mongoUri.replace(/\/\/[^@/]*@/, '//***@');
    // eslint-disable-next-line no-console
    console.log(`review-service connected to MongoDB at ${redactedUri}`);

    const app = createApp();
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`review-service listening on port ${port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start review-service:', error);
    process.exit(1);
  }
}

startServer();
