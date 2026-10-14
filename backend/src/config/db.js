import mongoose from 'mongoose';

// The notification dedupe index used to be `sparse`, which (for a compound index) still indexed notifications
// without an eventKey and let each recipient keep only one of them. Replace it with the partial index declared in
// Notification.model.js. Idempotent: does nothing once the old index is gone.
export const migrateNotificationDedupeIndex = async (db) => {
  try {
    const collection = db.collection('notifications');
    const indexes = await collection.indexes().catch(() => []);
    const legacy = indexes.find((i) =>
      i.key?.recipientId === 1 && i.key?.recipientType === 1 && i.key?.eventKey === 1 && !i.partialFilterExpression);
    if (!legacy) return;
    await collection.dropIndex(legacy.name);
    const { default: Notification } = await import('../models/Notification.model.js');
    await Notification.createIndexes();
    console.log(`✅ Replaced legacy notification index "${legacy.name}" with a partial eventKey index.`);
  } catch (error) {
    console.error(`⚠️ Notification index migration failed: ${error.message}`);
  }
};

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
                    maxWeightKg: 50,
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

    await migrateNotificationDedupeIndex(conn.connection.db);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    console.warn(`⚠️ Warning: Server running in fallback mode without DB connection. Check network/IP Whitelist.`);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ [MongoDB] Disconnected. Attempting automatic reconnection...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ [MongoDB] Reconnected successfully.');
});

export default connectDB;
