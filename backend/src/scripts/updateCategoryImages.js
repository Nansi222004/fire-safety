import 'dotenv/config';
import mongoose from 'mongoose';
import Category from '../models/Category.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safe-fire';

const CATEGORY_IMAGE_UPDATES = [
  {
    slug: 'abc-fire-extinguishers',
    image: '/products/abc-dry-powder-fire-extinguisher-6kg.webp',
  },
  {
    slug: 'co2-fire-extinguishers',
    image: '/products/co2-fire-extinguisher-4-5kg.webp',
  },
  {
    slug: 'foam-fire-extinguishers',
    image: '/products/afff-foam-fire-extinguisher-9l.jpg',
  },
  {
    slug: 'fire-hoses-hose-reels',
    image: '/products/fire-hose-reel-30m.webp',
  },
  {
    slug: 'smoke-fire-alarms',
    image: '/products/photoelectric-smoke-fire-alarm.jpg',
  },
];

const updateCategoryImages = async () => {
  try {
    console.log(`📡 Connecting to MongoDB Atlas...`);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    for (const item of CATEGORY_IMAGE_UPDATES) {
      const updated = await Category.findOneAndUpdate(
        { slug: item.slug },
        { $set: { image: item.image, 'banner.image': item.image } },
        { new: true }
      );
      if (updated) {
        console.log(`✨ Updated image for Category: "${updated.name}" -> ${item.image}`);
      } else {
        console.warn(`⚠️ Category slug "${item.slug}" not found in database.`);
      }
    }

    console.log('🎉 Category images successfully updated in MongoDB Atlas!');
  } catch (err) {
    console.error('❌ Failed to update category images:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
    process.exit(0);
  }
};

updateCategoryImages();
