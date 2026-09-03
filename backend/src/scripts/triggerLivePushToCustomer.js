import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import User from '../models/User.model.js';
import { createNotification } from '../services/notification.service.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/safe-fire';

async function sendLiveCustomerPush() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');

    const user = await User.findOne({ email: 'customer@safefire.com' });
    if (!user) {
        console.error('Customer not found');
        return;
    }

    console.log(`Sending live push notification to user ${user._id} (${user.email})...`);
    console.log(`Registered Web Tokens: ${user.fcmTokens.length}`);
    console.log(`Registered Mobile Tokens: ${user.fcmTokenMobile.length}`);

    const notif = await createNotification({
        recipientId: user._id,
        recipientType: 'user',
        title: '🔥 SafeFire Flash Alert: 25% Off Refills!',
        message: 'Your fire extinguishers are due for annual maintenance. Claim 25% discount today.',
        type: 'system',
        data: {
            link: '/shop',
            promoCode: 'SAFETY25',
            timestamp: new Date().toISOString(),
        },
    });

    console.log('✅ Notification created in DB and dispatched to Push & Socket.IO:');
    console.log({
        id: notif._id,
        title: notif.title,
        message: notif.message,
        recipient: notif.recipientId,
    });

    await mongoose.disconnect();
}

sendLiveCustomerPush().catch(console.error);
