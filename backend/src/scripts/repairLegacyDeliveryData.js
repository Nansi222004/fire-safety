import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import ReturnRequest from '../models/ReturnRequest.model.js';
import Service from '../models/Service.model.js';
import Shipment from '../models/Shipment.model.js';
import VendorService from '../models/VendorService.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const apply = process.argv.includes('--apply');

const main = async () => {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured.');
    await mongoose.connect(process.env.MONGO_URI);

    try {
        const validServiceIds = await Service.distinct('_id');
        const orphanedActiveLinks = await VendorService.find({
            isActive: true,
            serviceId: { $nin: validServiceIds },
        }).select('_id').lean();

        const legacyReturns = await ReturnRequest.find({
            status: 'completed',
            $or: [
                { originalShipmentId: { $exists: false } },
                { originalShipmentId: null },
                { reverseShipmentId: { $exists: false } },
                { reverseShipmentId: null },
            ],
        }).select('_id orderId vendorId updatedAt').lean();

        const repairs = [];
        const skipped = [];
        for (const request of legacyReturns) {
            const [forwardCandidates, reverseCandidates] = await Promise.all([
                Shipment.find({
                    orderId: request.orderId,
                    vendorId: request.vendorId,
                    type: 'forward',
                }).select('_id status').lean(),
                Shipment.find({
                    returnRequestId: request._id,
                    type: 'reverse',
                }).select('_id status').lean(),
            ]);

            if (forwardCandidates.length !== 1 || reverseCandidates.length !== 1) {
                skipped.push({
                    returnRequestId: request._id,
                    forwardCandidates: forwardCandidates.length,
                    reverseCandidates: reverseCandidates.length,
                });
                continue;
            }

            repairs.push({
                request,
                forwardShipment: forwardCandidates[0],
                reverseShipment: reverseCandidates[0],
            });
        }

        console.log(JSON.stringify({
            mode: apply ? 'apply' : 'dry-run',
            orphanedActiveVendorServices: orphanedActiveLinks.length,
            deterministicReturnRepairs: repairs.length,
            skippedAmbiguousReturns: skipped,
        }, null, 2));

        if (!apply) return;

        if (orphanedActiveLinks.length) {
            await VendorService.updateMany(
                { _id: { $in: orphanedActiveLinks.map(link => link._id) }, isActive: true },
                { $set: { isActive: false } }
            );
        }

        for (const repair of repairs) {
            const completedAt = repair.request.updatedAt || new Date();
            await ReturnRequest.updateOne(
                {
                    _id: repair.request._id,
                    $or: [
                        { originalShipmentId: { $exists: false } },
                        { originalShipmentId: null },
                        { reverseShipmentId: { $exists: false } },
                        { reverseShipmentId: null },
                    ],
                },
                {
                    $set: {
                        originalShipmentId: repair.forwardShipment._id,
                        reverseShipmentId: repair.reverseShipment._id,
                    },
                }
            );

            await Shipment.updateOne(
                {
                    _id: repair.reverseShipment._id,
                    returnRequestId: repair.request._id,
                    type: 'reverse',
                    status: { $ne: 'delivered' },
                },
                {
                    $set: { status: 'delivered', deliveredAt: completedAt },
                    $push: {
                        statusHistory: {
                            status: 'delivered',
                            updatedAt: completedAt,
                            updatedBy: 'system',
                            notes: 'Deterministic legacy synchronization from completed return request.',
                        },
                    },
                }
            );
        }

        console.log('Deterministic legacy delivery-data repair completed.');
    } finally {
        await mongoose.disconnect();
    }
};

main().catch((error) => {
    console.error('Legacy delivery-data repair failed:', error.message);
    process.exitCode = 1;
});
