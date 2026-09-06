require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/safefire';

async function run() {
  await mongoose.connect(uri);
  const hash = await bcrypt.hash('Vendor@123', 10);
  
  // Vendor A: Service-only
  await mongoose.connection.db.collection('vendors').updateOne(
    { email: 'vuser1_mto396jt@safefire.test' },
    { $set: { password: hash, isVerified: true, status: 'approved', vendorCapabilities: { sellsProducts: false, providesServices: true } } }
  );

  // Vendor B: Product-only (Safe Fire Equipment Store)
  await mongoose.connection.db.collection('vendors').updateOne(
    { email: 'vendor@safefire.demo' },
    { $set: { password: hash, isVerified: true, status: 'approved', vendorCapabilities: { sellsProducts: true, providesServices: false } } }
  );

  // Vendor C: Hybrid (Shield Fire Solutions)
  await mongoose.connection.db.collection('vendors').updateOne(
    { email: 'vuser2_mto396jt@safefire.test' },
    { $set: { password: hash, isVerified: true, status: 'approved', vendorCapabilities: { sellsProducts: true, providesServices: true } } }
  );

  console.log('SUCCESS_VENDORS_CONFIGURED');
  console.log('- Vendor A (Service-only): vuser1_mto396jt@safefire.test / Vendor@123');
  console.log('- Vendor B (Product-only): vendor@safefire.demo / Vendor@123');
  console.log('- Vendor C (Hybrid): vuser2_mto396jt@safefire.test / Vendor@123');

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
