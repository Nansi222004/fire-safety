/**
 * Seeds 2 wholesale (B2B) fire-safety products.
 * Images are the real product photos served from frontend/public/products,
 * so each product shows a picture of exactly what it is.
 *
 * Idempotent: re-running updates the same products (matched by slug) instead of duplicating.
 * Run: node src/scripts/seedWholesaleProducts.js
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

// Approved wholesaler accounts
const VENDOR_SHARMA = new mongoose.Types.ObjectId('6aeb0ba488a421b3a1e2225b'); // Sharma Fire Equipments
const VENDOR_SHIVAM = new mongoose.Types.ObjectId('6aeb3ebd0c60afe47c93dacc'); // Store for wholesale

// Categories
const CAT_EXTINGUISHERS = new mongoose.Types.ObjectId('6a7da0d0cdbb355719e7645b'); // Fire Extinguishers
const CAT_HOSE_REELS = new mongoose.Types.ObjectId('6a7da0d1cdbb355719e7649f'); // Fire Hose Reels
const CAT_SAFETY_JACKETS = new mongoose.Types.ObjectId('6aeb16ba9e356dcf4bfcf0a3'); // Safety Jackets & Body Protection

const products = [
  {
    name: 'CO2 Fire Extinguisher 4.5kg - Bulk Pack of 6 Units',
    slug: 'wholesale-co2-fire-extinguisher-4-5kg-pack-of-6',
    description:
      'ISI marked CO2 fire extinguisher, 4.5kg capacity, with seamless high-pressure steel cylinder and discharge horn. ' +
      'Suitable for Class B and electrical fires: server rooms, electrical panels, labs and industrial plants. ' +
      'Supplied in a bulk pack of 6 units, factory filled, each with a hydrostatic test certificate.',
    price: 21000, // retail-equivalent pack price
    unit: 'Pack (6 pcs)',
    image: '/products/co2-fire-extinguisher-4-5kg.webp',
    images: ['/products/co2-fire-extinguisher-4-5kg.webp'],
    categoryId: CAT_EXTINGUISHERS,
    vendorId: VENDOR_SHARMA,
    stockQuantity: 120,
    lowStockThreshold: 10,
    wholesale: { enabled: true, price: 16200, moq: 2 },
    weight: 60,
    dimensions: { length: 80, breadth: 55, height: 70 },
    tags: ['wholesale', 'b2b', 'bulk', 'co2', 'fire-extinguisher'],
  },
  {
    name: 'Fire Hose Reel Drum 30m with Shut-off Nozzle - Set of 4',
    slug: 'wholesale-fire-hose-reel-30m-set-of-4',
    description:
      'IS:884 compliant wall-mounted swinging fire hose reel with 30m x 19mm high-pressure rubber hose, ' +
      'ball valve and shut-off jet/spray nozzle. Powder-coated red steel drum. ' +
      'Contractor bulk set of 4 for commercial buildings, malls, hotels and factories.',
    price: 26000,
    unit: 'Set (4 pcs)',
    image: '/products/fire-hose-reel-30m.webp',
    images: ['/products/fire-hose-reel-30m.webp'],
    categoryId: CAT_HOSE_REELS,
    vendorId: VENDOR_SHIVAM,
    stockQuantity: 50,
    lowStockThreshold: 5,
    wholesale: { enabled: true, price: 19500, moq: 1 },
    weight: 72,
    dimensions: { length: 75, breadth: 75, height: 40 },
    tags: ['wholesale', 'b2b', 'bulk', 'hose-reel'],
  },
  {
    // Replaces the old placeholder "Test Wholesale ABC Fire Extinguisher 6kg" (same _id, so existing references keep working)
    _id: new mongoose.Types.ObjectId('6aeb25edc0167158bf845cb2'),
    name: 'Fire Resistant Safety Jacket with Reflective Tape - Pack of 5',
    slug: 'wholesale-fire-resistant-safety-jacket-pack-of-5',
    description:
      'Heavy-duty fire resistant firefighter jacket with aramid outer shell, moisture barrier and thermal liner. ' +
      'High-visibility 3M-style reflective tape on chest, arms and hem, storm collar, and wrist cuffs. ' +
      'Bulk pack of 5 jackets (assorted M / L / XL) for fire brigades, industrial ERT teams and safety contractors.',
    price: 42500,
    unit: 'Pack (5 pcs)',
    // Photo: "Bunker Jacket" by Justin DiPierro, Wikimedia Commons, CC BY-SA 2.5
    image: '/products/fire-safety-jacket.jpg',
    images: ['/products/fire-safety-jacket.jpg'],
    categoryId: CAT_SAFETY_JACKETS,
    vendorId: VENDOR_SHARMA,
    stockQuantity: 48,
    lowStockThreshold: 5,
    wholesale: { enabled: true, price: 32500, moq: 2 },
    weight: 15,
    dimensions: { length: 60, breadth: 45, height: 35 },
    tags: ['wholesale', 'b2b', 'bulk', 'safety-jacket', 'ppe'],
  },
];

async function seedWholesale() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');
  const col = mongoose.connection.db.collection('products');
  const now = new Date();

  for (const { _id, ...item } of products) {
    const res = await col.updateOne(
      _id ? { _id } : { slug: item.slug },
      {
        $set: {
          ...item,
          stock: 'in_stock',
          b2cAvailable: false,
          taxRate: 18,
          isActive: true,
          isVisible: true,
          updatedAt: now,
        },
        $setOnInsert: {
          variants: {
            sizes: [], colors: [], materials: [], attributes: [],
            prices: {}, stockMap: {}, imageMap: {}, defaultSelection: {},
          },
          flashSale: false,
          isNewArrival: false,
          isFeatured: false,
          codAllowed: true,
          returnable: true,
          cancelable: true,
          rating: 0,
          reviewCount: 0,
          relatedProducts: [],
          faqs: [],
          createdAt: now,
        },
      },
      { upsert: true }
    );
    console.log(`${res.upsertedCount ? '+ Added' : '~ Updated'}: ${item.name}`);
  }

  const total = await col.countDocuments({ 'wholesale.enabled': true, isActive: true });
  console.log(`Done. Active wholesale products: ${total}`);
  await mongoose.disconnect();
}

seedWholesale().catch((err) => {
  console.error(err);
  process.exit(1);
});
