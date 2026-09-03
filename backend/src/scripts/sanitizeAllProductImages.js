import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.model.js';
import Category from '../models/Category.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safe-fire';

const DEFAULT_FIRE_IMAGES_BY_CAT = {
  'abc-fire-extinguishers': '/products/abc-dry-powder-fire-extinguisher-6kg.webp',
  'co2-fire-extinguishers': '/products/co2-fire-extinguisher-4-5kg.webp',
  'foam-fire-extinguishers': '/products/afff-foam-fire-extinguisher-9l.jpg',
  'water-based-extinguishers': '/products/abc-dry-powder-fire-extinguisher-6kg.webp',
  'fire-blankets-equipment': '/products/afff-foam-fire-extinguisher-9l.jpg',
  'fire-hoses-hose-reels': '/products/fire-hose-reel-30m.webp',
  'smoke-fire-alarms': '/products/photoelectric-smoke-fire-alarm.jpg',
  'safety-helmets-ppe': '/products/photoelectric-smoke-fire-alarm.jpg',
  'emergency-exit-signs': '/products/photoelectric-smoke-fire-alarm.jpg',
  'fire-safety-accessories': '/products/fire-hose-reel-30m.webp',
};

const sanitizeProducts = async () => {
  try {
    console.log(`📡 Connecting to MongoDB Atlas...`);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    const categories = await Category.find({}).lean();
    const catMap = {};
    categories.forEach(c => {
      catMap[c._id.toString()] = c.slug;
    });

    const products = await Product.find({});
    console.log(`📦 Found ${products.length} products to check.`);

    let updatedCount = 0;
    for (const p of products) {
      const catSlug = catMap[p.categoryId?.toString()] || '';
      const isUnsplashOrBad = !p.image || p.image.includes('unsplash.com') || p.image.includes('placeholder');
      
      if (isUnsplashOrBad) {
        const cleanImage = DEFAULT_FIRE_IMAGES_BY_CAT[catSlug] || '/products/abc-dry-powder-fire-extinguisher-6kg.webp';
        p.image = cleanImage;
        p.images = [cleanImage];
        await p.save();
        console.log(`✨ Replaced image for "${p.name}" (${catSlug}) -> ${cleanImage}`);
        updatedCount++;
      }
    }

    console.log(`✅ Finished! Updated ${updatedCount} products with genuine fire safety assets.`);
  } catch (err) {
    console.error('❌ Failed to sanitize products:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
    process.exit(0);
  }
};

sanitizeProducts();
