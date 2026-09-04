import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const maxPoolSize = Math.max(Number(process.env.MONGO_MAX_POOL_SIZE) || 20, 5);
    const minPoolSize = Math.max(Number(process.env.MONGO_MIN_POOL_SIZE) || 5, 0);
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize,
      minPoolSize,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Self-healing migration: Fix malformed currentLocation fields on DeliveryBoy
    await conn.connection.db.collection('deliveryboys').updateMany(
        {
            $or: [
                { 'currentLocation.coordinates': { $exists: false } },
                { 'currentLocation.coordinates': { $size: 0 } },
                { 'currentLocation': null },
                { 'currentLocation.type': { $exists: true }, 'currentLocation.coordinates': { $exists: false } }
            ]
        },
        { $set: { currentLocation: { type: 'Point', coordinates: [72.8777, 19.0760] } } }
    );

    // Self-healing migration: Fix malformed address.location fields on Vendor
    await conn.connection.db.collection('vendors').updateMany(
        {
            $or: [
                { 'address.location.coordinates': { $exists: false } },
                { 'address.location.coordinates': { $size: 0 } },
                { 'address.location': null },
                { 'address.location.type': { $exists: true }, 'address.location.coordinates': { $exists: false } }
            ]
        },
        { $set: { 'address.location': { type: 'Point', coordinates: [72.8777, 19.0760] } } }
    );

    // Self-healing migration: Ensure default LogisticsProvider (own_fleet) exists
    await conn.connection.db.collection('logisticsproviders').updateOne(
        { providerId: 'own_fleet' },
        {
            $setOnInsert: {
                providerId: 'own_fleet',
                displayName: 'Own Delivery Fleet',
                isEnabled: true,
                priority: 1,
                reliabilityScore: 100,
                capabilities: {
                    supportsCOD: true,
                    supportsReversePickup: true,
                    supportsHyperlocal: true,
                    supportsInterstate: true,
                    maxWeightGrams: 50000,
                    maxDistanceKm: 0,
                },
                scoringWeights: {
                    serviceability: 50,
                    eta: 20,
                    margin: 20,
                    reliability: 10,
                },
                createdAt: new Date(),
                updatedAt: new Date()
            }
        },
        { upsert: true }
    );

    console.log(`✅ Self-healing coordinates & logistics migration complete.`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    console.warn(`⚠️ Warning: Server running in fallback mode without DB connection. Check network/IP Whitelist.`);
  }
};

export default connectDB;
