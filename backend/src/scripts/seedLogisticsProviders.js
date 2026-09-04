import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import LogisticsProvider from '../models/LogisticsProvider.model.js';
import reverseEngine from '../services/reverseEngine.service.js';
import ReturnRequest from '../models/ReturnRequest.model.js';

const seed = async () => {
    await connectDB();

    const providers = [
        {
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
        },
        {
            providerId: 'shiprocket',
            displayName: 'Shiprocket',
            isEnabled: false,
            priority: 2,
            reliabilityScore: 90,
            capabilities: {
                supportsCOD: true,
                supportsReversePickup: true,
                supportsHyperlocal: false,
                supportsInterstate: true,
                maxWeightGrams: 50000,
                maxDistanceKm: 0,
            },
        },
        {
            providerId: 'delhivery',
            displayName: 'Delhivery',
            isEnabled: false,
            priority: 3,
            reliabilityScore: 90,
            capabilities: {
                supportsCOD: true,
                supportsReversePickup: true,
                supportsHyperlocal: false,
                supportsInterstate: true,
                maxWeightGrams: 50000,
                maxDistanceKm: 0,
            },
        },
    ];

    for (const p of providers) {
        await LogisticsProvider.findOneAndUpdate(
            { providerId: p.providerId },
            { $setOnInsert: p },
            { upsert: true, new: true }
        );
        console.log(`Logistics provider ensured: ${p.providerId}`);
    }

    // Now test reverse engine for the active return request
    console.log('\nTesting reverseEngine.processReturn for 6a9a91574ae9cf4e34c145f5...');
    const result = await reverseEngine.processReturn('6a9a91574ae9cf4e34c145f5');
    console.log('REVERSE ENGINE RESULT:', result);

    const ret = await ReturnRequest.findById('6a9a91574ae9cf4e34c145f5')
        .select('status deliveryBoyId deliveryAssignmentStatus')
        .populate('deliveryBoyId', 'name email phone')
        .lean();
    console.log('UPDATED RETURN REQUEST:', JSON.stringify(ret, null, 2));

    process.exit(0);
};

seed().catch(console.error);
