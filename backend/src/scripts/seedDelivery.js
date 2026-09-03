import 'dotenv/config';
import mongoose from 'mongoose';
import DeliveryBoy from '../models/DeliveryBoy.model.js';

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI not set in .env');
  process.exit(1);
}

const accountsToSeed = [
  {
    email: 'delivery@safefire.com',
    password: 'Password123!',
    name: 'SafeFire Delivery Agent',
    phone: '+1234567890',
    address: 'Delhi, India',
  },
  {
    email: 'delivery@delivery.com',
    password: 'delivery123',
    name: 'Delivery Agent',
    phone: '+1234567000',
    address: 'Delhi, India',
  },
];

const seedDelivery = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    for (const acc of accountsToSeed) {
      const existing = await DeliveryBoy.findOne({ email: acc.email }).select('+password');
      if (existing) {
        existing.name = acc.name;
        existing.phone = existing.phone || acc.phone;
        existing.address = existing.address || acc.address;
        existing.password = acc.password;
        existing.isActive = true;
        existing.isAvailable = true;
        existing.status = 'available';
        existing.applicationStatus = 'approved';
        existing.vehicleType = existing.vehicleType || 'Bike';
        existing.vehicleNumber = existing.vehicleNumber || 'DL-01-AB-1234';
        await existing.save();
        console.log(`Delivery account updated: ${acc.email} / ${acc.password}`);
      } else {
        await DeliveryBoy.create({
          name: acc.name,
          email: acc.email,
          password: acc.password,
          phone: acc.phone,
          address: acc.address,
          isActive: true,
          isAvailable: true,
          status: 'available',
          applicationStatus: 'approved',
          vehicleType: 'Bike',
          vehicleNumber: 'DL-01-AB-1234',
        });
        console.log(`Delivery account created: ${acc.email} / ${acc.password}`);
      }
    }
  } catch (err) {
    console.error('Seed failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

seedDelivery();
