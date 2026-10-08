import 'dotenv/config';
import mongoose from 'mongoose';

const MIGRATION_ID = 'canonical-weight-kg-v1';
const apply = process.argv.includes('--apply');

await mongoose.connect(process.env.MONGO_URI);
const session = await mongoose.startSession();

try {
    const db = mongoose.connection.db;
    const migrations = db.collection('safefire_migrations');
    const previous = await migrations.findOne({ migrationId: MIGRATION_ID });
    if (previous) {
        console.log(JSON.stringify({ migrationId: MIGRATION_ID, status: 'already_applied', appliedAt: previous.appliedAt }));
        process.exitCode = 0;
    } else {
        const [shipments, engineRuns, providers] = await Promise.all([
            db.collection('shipments').find({ packageWeight: { $type: 'number' } }, { projection: { packageWeight: 1 } }).toArray(),
            db.collection('deliveryengineruns').find({ packageWeight: { $type: 'number' } }, { projection: { packageWeight: 1 } }).toArray(),
            db.collection('logisticsproviders').find(
                { 'capabilities.maxWeightGrams': { $type: 'number' }, 'capabilities.maxWeightKg': { $exists: false } },
                { projection: { providerId: 1, 'capabilities.maxWeightGrams': 1 } },
            ).toArray(),
        ]);

        const invalid = [
            ...shipments.map((record) => ({ collection: 'shipments', id: record._id, value: record.packageWeight })),
            ...engineRuns.map((record) => ({ collection: 'deliveryengineruns', id: record._id, value: record.packageWeight })),
        ].filter(({ value }) => !Number.isInteger(value) || value < 100);
        if (invalid.length) {
            throw new Error(`Refusing mixed-unit migration: ${invalid.length} record(s) do not match the legacy integer-gram schema.`);
        }

        const report = {
            migrationId: MIGRATION_ID,
            mode: apply ? 'apply' : 'dry-run',
            shipments: shipments.length,
            deliveryEngineRuns: engineRuns.length,
            providers: providers.length,
        };

        if (apply) {
            await session.withTransaction(async () => {
                if (shipments.length) {
                    const result = await db.collection('shipments').bulkWrite(shipments.map((record) => ({
                        updateOne: {
                            filter: { _id: record._id, packageWeight: record.packageWeight },
                            update: { $set: { packageWeight: record.packageWeight / 1000 } },
                        },
                    })), { session });
                    if (result.modifiedCount !== shipments.length) throw new Error('Shipment migration encountered a concurrent update.');
                }
                if (engineRuns.length) {
                    const result = await db.collection('deliveryengineruns').bulkWrite(engineRuns.map((record) => ({
                        updateOne: {
                            filter: { _id: record._id, packageWeight: record.packageWeight },
                            update: { $set: { packageWeight: record.packageWeight / 1000 } },
                        },
                    })), { session });
                    if (result.modifiedCount !== engineRuns.length) throw new Error('Delivery-engine migration encountered a concurrent update.');
                }
                for (const provider of providers) {
                    const legacyWeight = provider.capabilities.maxWeightGrams;
                    const result = await db.collection('logisticsproviders').updateOne(
                        { _id: provider._id, 'capabilities.maxWeightGrams': legacyWeight, 'capabilities.maxWeightKg': { $exists: false } },
                        { $set: { 'capabilities.maxWeightKg': legacyWeight / 1000 }, $unset: { 'capabilities.maxWeightGrams': '' } },
                        { session },
                    );
                    if (result.modifiedCount !== 1) throw new Error(`Provider ${provider.providerId} changed concurrently.`);
                }
                await migrations.insertOne({
                    migrationId: MIGRATION_ID,
                    appliedAt: new Date(),
                    reversibleSnapshot: {
                        shipments: shipments.map(({ _id, packageWeight }) => ({ _id, packageWeight })),
                        deliveryEngineRuns: engineRuns.map(({ _id, packageWeight }) => ({ _id, packageWeight })),
                        providers: providers.map(({ _id, providerId, capabilities }) => ({ _id, providerId, maxWeightGrams: capabilities.maxWeightGrams })),
                    },
                }, { session });
            });
            report.status = 'applied';
        } else {
            report.status = 'validated_not_applied';
        }
        console.log(JSON.stringify(report));
    }
} finally {
    await session.endSession();
    await mongoose.disconnect();
}
