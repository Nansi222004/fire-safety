import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.model.js';
import Admin from '../models/Admin.model.js';
import Vendor from '../models/Vendor.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safe-fire';

const upsertCustomer = async (email, name, phone, password) => {
  let customer = await User.findOne({ email });
  if (customer) {
    customer.name = name;
    customer.password = password;
    customer.phone = phone;
    customer.isVerified = true;
    customer.isActive = true;
    await customer.save();
  } else {
    await User.create({
      name,
      email,
      password,
      phone,
      role: 'customer',
      isVerified: true,
      isActive: true,
    });
  }
};

const upsertDelivery = async (email, name, phone, password) => {
  let deliveryUser = await User.findOne({ email });
  if (deliveryUser) {
    deliveryUser.name = name;
    deliveryUser.password = password;
    deliveryUser.phone = phone;
    deliveryUser.role = 'delivery';
    deliveryUser.isVerified = true;
    deliveryUser.isActive = true;
    await deliveryUser.save();
  } else {
    await User.create({
      name,
      email,
      password,
      phone,
      role: 'delivery',
      isVerified: true,
      isActive: true,
    });
  }

  let deliveryBoy = await DeliveryBoy.findOne({ email }).select('+password');
  if (deliveryBoy) {
    deliveryBoy.name = name;
    deliveryBoy.password = password;
    deliveryBoy.phone = phone;
    deliveryBoy.applicationStatus = 'approved';
    deliveryBoy.isActive = true;
    deliveryBoy.isAvailable = true;
    deliveryBoy.status = 'available';
    await deliveryBoy.save();
  } else {
    await DeliveryBoy.create({
      name,
      email,
      password,
      phone,
      vehicleType: 'Bike',
      vehicleNumber: 'DL-01-SF-100',
      address: '101 Safety Street, Mumbai',
      applicationStatus: 'approved',
      isActive: true,
      isAvailable: true,
      status: 'available',
      documents: {
        drivingLicense: '/uploads/delivery-docs/sample-license.pdf',
        aadharCard: '/uploads/delivery-docs/sample-aadhar.pdf',
      },
    });
  }
};

const upsertAdmin = async (email, name, password) => {
  let admin = await Admin.findOne({ email });
  if (admin) {
    admin.name = name;
    admin.password = password;
    admin.role = 'superadmin';
    admin.isActive = true;
    await admin.save();
  } else {
    await Admin.create({
      name,
      email,
      password,
      role: 'superadmin',
      isActive: true,
    });
  }
};

const upsertVendor = async (email, name, phone, storeName, password) => {
  let vendor = await Vendor.findOne({ email });
  if (vendor) {
    vendor.name = name;
    vendor.password = password;
    vendor.phone = phone;
    vendor.storeName = storeName;
    vendor.storeDescription = 'Authorized supplier of certified fire protection and safety equipment.';
    vendor.status = 'approved';
    vendor.isVerified = true;
    await vendor.save();
  } else {
    await Vendor.create({
      name,
      email,
      password,
      phone,
      storeName,
      storeDescription: 'Authorized supplier of certified fire protection and safety equipment.',
      status: 'approved',
      isVerified: true,
      address: {
        street: '101 Safety Highway',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'India',
      },
      documents: {
        businessLicense: 'LIC-SAFEFIRE-99',
        identity: 'ID-SAFEFIRE-99',
      },
    });
  }
};

const seedTestUsers = async () => {
  try {
    console.log(`📡 Connecting to MongoDB Atlas at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    // Seed customer accounts (.demo & .com)
    await upsertCustomer('customer@safefire.demo', 'Demo Customer', '9876543210', 'Password123!');
    await upsertCustomer('customer@safefire.com', 'Demo Customer', '9876543210', 'Password123!');

    // Seed delivery accounts (.demo & .com)
    await upsertDelivery('delivery@safefire.demo', 'Demo Delivery Partner', '9876543212', 'Password123!');
    await upsertDelivery('delivery@safefire.com', 'Demo Delivery Partner', '9876543212', 'Password123!');

    // Seed admin accounts (.demo & .com)
    await upsertAdmin('sfsappdevelopment@gmail.com', 'Super Admin', 'admin123');
    await upsertAdmin('admin@safefire.demo', 'Safe Fire Admin', 'Password123!');
    await upsertAdmin('admin@safefire.com', 'Safe Fire Admin', 'Password123!');

    // Seed vendor accounts (.demo & .com)
    await upsertVendor('vendor@safefire.demo', 'Demo Safety Supplier', '9876543211', 'Safe Fire Equipment Store', 'Password123!');
    await upsertVendor('vendor@safefire.com', 'Demo Safety Supplier', '9876543211', 'Safe Fire Equipment Store', 'Password123!');

    console.log('\n🎉 Test Users Seeding Completed Successfully!');
    console.log('----------------------------------------------------------------------');
    console.log('👤 Customer: customer@safefire.demo / customer@safefire.com | Password123!');
    console.log('🛡️ Admin:    sfsappdevelopment@gmail.com                    | admin123');
    console.log('🛡️ Admin:    admin@safefire.demo    / admin@safefire.com    | Password123!');
    console.log('🏭 Vendor:   vendor@safefire.demo   / vendor@safefire.com   | Password123!');
    console.log('🚚 Delivery: delivery@safefire.demo / delivery@safefire.com | Password123!');
    console.log('----------------------------------------------------------------------');
  } catch (err) {
    console.error('❌ Failed to seed test users:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
    process.exit(0);
  }
};

seedTestUsers();
