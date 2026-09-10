import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import PlatformPolicy from '../../../models/PlatformPolicy.model.js';

// Helper to get or initialize the singleton policy document
const getOrCreatePolicyDoc = async () => {
    let doc = await PlatformPolicy.findOne();
    if (!doc) {
        doc = await PlatformPolicy.create({
            privacy: { title: 'Customer Privacy Policy', content: '' },
            deliveryPrivacy: { title: 'Delivery Partner Privacy Policy', content: '' },
            sellerPrivacy: { title: 'Seller Partner Privacy Policy', content: '' },
            refund: { title: 'Refund Policy', content: '' },
            terms: { title: 'Terms & Conditions', content: '' },
            sellerTerms: { title: 'Seller Terms & Conditions', content: '' },
            faq: { title: 'Frequently Asked Questions', items: [] }
        });
    } else {
        let needsSave = false;
        if (!doc.deliveryPrivacy) {
            doc.deliveryPrivacy = { title: 'Delivery Partner Privacy Policy', content: '' };
            needsSave = true;
        }
        if (!doc.sellerPrivacy) {
            doc.sellerPrivacy = { title: 'Seller Partner Privacy Policy', content: '' };
            needsSave = true;
        }
        if (needsSave) {
            await doc.save();
        }
    }
    return doc;
};

const POLICY_KEY_MAP = {
    'privacy': 'privacy',
    'privacy-policy': 'privacy',
    'customer-privacy': 'privacy',
    'delivery-privacy': 'deliveryPrivacy',
    'delivery-privacy-policy': 'deliveryPrivacy',
    'delivery': 'deliveryPrivacy',
    'seller-privacy': 'sellerPrivacy',
    'seller-privacy-policy': 'sellerPrivacy',
    'vendor-privacy': 'sellerPrivacy',
    'refund': 'refund',
    'refund-policy': 'refund',
    'terms': 'terms',
    'terms-conditions': 'terms',
    'seller-terms': 'sellerTerms',
    'faq': 'faq'
};

// GET /api/admin/policies/:type
export const getPolicy = asyncHandler(async (req, res) => {
    const { type } = req.params;
    const doc = await getOrCreatePolicyDoc();
    
    const docKey = POLICY_KEY_MAP[type];
    if (!docKey) {
        throw new ApiError(400, 'Invalid policy type.');
    }

    if (!doc[docKey]) {
        doc[docKey] = { title: type, content: '' };
    }

    const policy = doc[docKey];

    res.status(200).json(new ApiResponse(200, policy, 'Policy fetched.'));
});

// PUT /api/admin/policies/:type
export const updatePolicy = asyncHandler(async (req, res) => {
    const { type } = req.params;
    const { content, items } = req.body;

    if (type !== 'faq' && content === undefined) {
        throw new ApiError(400, 'Content is required.');
    }
    if (type === 'faq' && items === undefined) {
        throw new ApiError(400, 'Items array is required for FAQ.');
    }

    const doc = await getOrCreatePolicyDoc();
    const now = new Date();

    const docKey = POLICY_KEY_MAP[type];
    if (!docKey) {
        throw new ApiError(400, 'Invalid policy type.');
    }

    if (!doc[docKey]) {
        doc[docKey] = { title: type, content: '' };
    }

    if (docKey === 'faq') {
        doc[docKey].items = items;
    } else {
        doc[docKey].content = content;
    }
    doc[docKey].lastUpdated = now;

    await doc.save();
    
    const updatedPolicy = doc[docKey];

    res.status(200).json(new ApiResponse(200, updatedPolicy, 'Policy updated.'));
});
