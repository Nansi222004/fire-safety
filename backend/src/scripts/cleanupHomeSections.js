import 'dotenv/config';
import mongoose from 'mongoose';
import HomeSection from '../models/HomeSection.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safe-fire';

const cleanup = async () => {
  try {
    console.log('📡 Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    const res = await HomeSection.deleteMany({
      $or: [
        { key: { $in: ['best_sellers', 'seasonal_collection', 'promotional_banner', 'recently_viewed'] } },
        { sectionType: { $in: ['best_sellers', 'seasonal_collection', 'promotional_banner', 'recently_viewed'] } }
      ]
    });
    console.log(`✅ Deleted ${res.deletedCount} unwanted HomeSection documents from database.`);
  } catch (err) {
    console.error('❌ Failed to clean up home sections:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected.');
    process.exit(0);
  }
};

cleanup();
