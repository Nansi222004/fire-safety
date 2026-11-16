import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function seedWholesale() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;

  const vendorSharma = new mongoose.Types.ObjectId('6aeb0ba488a421b3a1e2225b');
  const vendorShivam = new mongoose.Types.ObjectId('6aeb3ebd0c60afe47c93dacc');

  // Categories
  const catExtinguishers = new mongoose.Types.ObjectId('6a7da0d0cdbb355719e7645b');
  const catBlankets = new mongoose.Types.ObjectId('6a7da0d0cdbb355719e76495');
  const catSmokeDetectors = new mongoose.Types.ObjectId('6a7da0d1cdbb355719e764ae');
  const catHoseReels = new mongoose.Types.ObjectId('6a7da0d1cdbb355719e7649f');
  const catHelmets = new mongoose.Types.ObjectId('6a7da0d1cdbb355719e764bc');
  const catHydrantValve = new mongoose.Types.ObjectId('6aca6601fda32be0ce584815');
  const catExitSignage = new mongoose.Types.ObjectId('6a7da0d1cdbb355719e764ca');
  const catSafetyJackets = new mongoose.Types.ObjectId('6aeb16ba9e356dcf4bfcf0a3');

  const productsData = [
    {
      name: 'ABC Dry Powder Fire Extinguisher 4kg (Bulk Carton of 10 Units)',
      description: 'Commercial grade ISI certified ABC dry powder fire extinguisher carton. Ideal for commercial projects, building developers, and bulk resellers. Comes pressurized with factory hydrostatic test certificates.',
      price: 12000,
      unit: 'Carton (10 pcs)',
      image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80',
      images: [
        'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80'
      ],
      categoryId: catExtinguishers,
      vendorId: vendorSharma,
      stock: 'in_stock',
      stockQuantity: 150,
      lowStockThreshold: 10,
      b2cAvailable: false,
      wholesale: {
        enabled: true,
        price: 8500,
        moq: 5
      },
      weight: 48,
      dimensions: { length: 65, breadth: 45, height: 50 },
      taxRate: 18,
      isActive: true,
      isVisible: true
    },
    {
      name: 'CO2 Fire Extinguisher 4.5kg - High Pressure (Pallet of 6 Units)',
      description: 'Seamless manganese steel cylinder CO2 fire extinguishers with heavy-duty discharge horn. Bulk wholesale supply for server rooms, industrial panels, and power plants.',
      price: 18000,
      unit: 'Pallet (6 pcs)',
      image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=600&q=80',
      images: [
        'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=600&q=80'
      ],
      categoryId: catExtinguishers,
      vendorId: vendorShivam,
      stock: 'in_stock',
      stockQuantity: 80,
      lowStockThreshold: 5,
      b2cAvailable: false,
      wholesale: {
        enabled: true,
        price: 13800,
        moq: 3
      },
      weight: 54,
      dimensions: { length: 80, breadth: 60, height: 75 },
      taxRate: 18,
      isActive: true,
      isVisible: true
    },
    {
      name: 'Heavy-Duty Fiberglass Emergency Fire Blanket 1.2m x 1.8m (Master Case of 25 pcs)',
      description: 'Flame retardant woven fiberglass fabric coated with silicone. Quick-release pull tabs, heat resistance up to 550°C. Standard bulk carton for hospitals, hotels, and schools.',
      price: 11250,
      unit: 'Case (25 pcs)',
      image: 'https://images.unsplash.com/photo-1599839575945-a9e5af0c3fa5?auto=format&fit=crop&w=600&q=80',
      images: [
        'https://images.unsplash.com/photo-1599839575945-a9e5af0c3fa5?auto=format&fit=crop&w=600&q=80'
      ],
      categoryId: catBlankets,
      vendorId: vendorSharma,
      stock: 'in_stock',
      stockQuantity: 120,
      lowStockThreshold: 10,
      b2cAvailable: false,
      wholesale: {
        enabled: true,
        price: 7200,
        moq: 4
      },
      weight: 22,
      dimensions: { length: 50, breadth: 40, height: 35 },
      taxRate: 18,
      isActive: true,
      isVisible: true
    },
    {
      name: 'Wireless Interconnected Smoke & Heat Detectors (Carton of 20 pcs)',
      description: 'Dual-sensor photoelectric optical smoke detector with loud 85dB sounder and battery backup. Wholesale distributor pack for multi-story residential and commercial towers.',
      price: 16000,
      unit: 'Carton (20 pcs)',
      image: 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=600&q=80',
      images: [
        'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=600&q=80'
      ],
      categoryId: catSmokeDetectors,
      vendorId: vendorShivam,
      stock: 'in_stock',
      stockQuantity: 95,
      lowStockThreshold: 8,
      b2cAvailable: false,
      wholesale: {
        enabled: true,
        price: 11500,
        moq: 5
      },
      weight: 12,
      dimensions: { length: 45, breadth: 35, height: 30 },
      taxRate: 18,
      isActive: true,
      isVisible: true
    },
    {
      name: 'Wall-Mounted Swinging Fire Hose Reel Drum 30m with Jet Spray Nozzle (Set of 4)',
      description: 'IS:884 compliant swinging type fire hose reel with 30m high-pressure braided rubber tubing and 19mm shut-off nozzle. Contractor bulk supply pack for commercial complexes.',
      price: 24000,
      unit: 'Crate (4 sets)',
      image: 'https://images.unsplash.com/photo-1542013936693-884638332954?auto=format&fit=crop&w=600&q=80',
      images: [
        'https://images.unsplash.com/photo-1542013936693-884638332954?auto=format&fit=crop&w=600&q=80'
      ],
      categoryId: catHoseReels,
      vendorId: vendorSharma,
      stock: 'in_stock',
      stockQuantity: 45,
      lowStockThreshold: 4,
      b2cAvailable: false,
      wholesale: {
        enabled: true,
        price: 17500,
        moq: 2
      },
      weight: 42,
      dimensions: { length: 70, breadth: 70, height: 60 },
      taxRate: 18,
      isActive: true,
      isVisible: true
    },
    {
      name: 'Industrial Construction Safety Helmets with Ratchet - ISI (Box of 30 pcs)',
      description: 'High-density polyethylene (HDPE) shell with 6-point textile suspension and adjustable ratchet wheel. High impact resistance. Bulk procurement box for site engineers and workers.',
      price: 7500,
      unit: 'Box (30 pcs)',
      image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80',
      images: [
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80'
      ],
      categoryId: catHelmets,
      vendorId: vendorShivam,
      stock: 'in_stock',
      stockQuantity: 140,
      lowStockThreshold: 10,
      b2cAvailable: false,
      wholesale: {
        enabled: true,
        price: 4950,
        moq: 5
      },
      weight: 18,
      dimensions: { length: 60, breadth: 50, height: 45 },
      taxRate: 18,
      isActive: true,
      isVisible: true
    },
    {
      name: 'Gunmetal Single Outlet Oblique Fire Hydrant Landing Valve (Crate of 6 units)',
      description: 'IS:5290 Type A gunmetal fire hydrant landing valve with instantaneous female coupling outlet and blank cap. Tested to 21 kgf/cm² hydraulic pressure. Certified for building risers.',
      price: 22500,
      unit: 'Crate (6 units)',
      image: 'https://images.unsplash.com/photo-1590765798363-22830303f8a4?auto=format&fit=crop&w=600&q=80',
      images: [
        'https://images.unsplash.com/photo-1590765798363-22830303f8a4?auto=format&fit=crop&w=600&q=80'
      ],
      categoryId: catHydrantValve,
      vendorId: vendorSharma,
      stock: 'in_stock',
      stockQuantity: 60,
      lowStockThreshold: 5,
      b2cAvailable: false,
      wholesale: {
        enabled: true,
        price: 16200,
        moq: 2
      },
      weight: 36,
      dimensions: { length: 55, breadth: 40, height: 35 },
      taxRate: 18,
      isActive: true,
      isVisible: true
    },
    {
      name: 'LED Illuminated Emergency Exit Sign Board with Battery Backup (Carton of 12 pcs)',
      description: 'Ceiling/wall mountable ultra-bright green acrylic emergency exit signage with 3-hour lithium-ion power backup and auto battery cutoff. Compliant with NBC fire escape guidelines.',
      price: 12000,
      unit: 'Carton (12 pcs)',
      image: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80',
      images: [
        'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80'
      ],
      categoryId: catExitSignage,
      vendorId: vendorShivam,
      stock: 'in_stock',
      stockQuantity: 90,
      lowStockThreshold: 6,
      b2cAvailable: false,
      wholesale: {
        enabled: true,
        price: 7800,
        moq: 3
      },
      weight: 15,
      dimensions: { length: 45, breadth: 35, height: 30 },
      taxRate: 18,
      isActive: true,
      isVisible: true
    },
    {
      name: 'High-Visibility Neon Safety Reflective Jackets - Class 2 (Bulk Bundle of 50 pcs)',
      description: '120 GSM breathable polyester mesh safety vest with 2-inch wide 3M micro-prismatic reflective stripes. Zipper front closure with multi-pocket layout for site staff and security.',
      price: 9000,
      unit: 'Bundle (50 pcs)',
      image: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=600&q=80',
      images: [
        'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=600&q=80'
      ],
      categoryId: catSafetyJackets,
      vendorId: vendorSharma,
      stock: 'in_stock',
      stockQuantity: 180,
      lowStockThreshold: 10,
      b2cAvailable: false,
      wholesale: {
        enabled: true,
        price: 5500,
        moq: 4
      },
      weight: 14,
      dimensions: { length: 50, breadth: 40, height: 25 },
      taxRate: 18,
      isActive: true,
      isVisible: true
    }
  ];

  console.log(`Inserting ${productsData.length} wholesale fire-safety products...`);

  for (const item of productsData) {
    const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
    await db.collection('products').insertOne({
      ...item,
      slug,
      variants: {
        sizes: [],
        colors: [],
        materials: [],
        attributes: [],
        prices: {},
        stockMap: {},
        imageMap: {},
        defaultSelection: {}
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
      tags: ['wholesale', 'b2b', 'bulk', 'firesafety'],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log(`+ Added wholesale product: ${item.name}`);
  }

  const finalCount = await db.collection('products').countDocuments({ 'wholesale.enabled': true });
  console.log(`Done! Total wholesale products now: ${finalCount}`);

  await mongoose.disconnect();
}

seedWholesale().catch((err) => {
  console.error(err);
  process.exit(1);
});

