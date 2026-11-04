import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import { sendOTP } from '../../../services/otp.service.js';
import {
    parseRegistrationAddress,
    prepareRegistrationDocuments,
    createRegistrationDocumentRecords,
    notifyAdminsOfRegistration,
} from '../../vendor/controllers/auth.controller.js';

// The GST registration certificate is the wholesaler's business license document.
const GST_CERTIFICATE_LABEL = 'GST Certificate';

/**
 * @desc    Register a Wholesaler account (separate from retail vendor accounts).
 *          GSTIN is mandatory; the account stays pending until an admin approves it.
 * @route   POST /api/wholesaler/auth/register
 */
export const register = asyncHandler(async (req, res) => {
    const { name, email, password, phone, businessName, gstNumber, businessType, expectedMonthlyVolume, description } = req.body;
    const { street, city, state, zipCode, country } = parseRegistrationAddress(req.body.address);

    const normalizedGstin = String(gstNumber || '').trim().toUpperCase();
    const gstinTaken = await Vendor.exists({ accountType: 'wholesaler', 'wholesaleCapability.businessDetails.gstNumber': normalizedGstin });
    if (gstinTaken) throw new ApiError(409, 'A wholesaler account is already registered with this GSTIN.');

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const docs = await prepareRegistrationDocuments(req, normalizedEmail, { licenseLabel: GST_CERTIFICATE_LABEL });

    const trimmedName = String(name || '').trim();
    const trimmedPhone = String(phone || '').trim();
    const trimmedBusinessName = String(businessName || '').trim();

    const wholesaler = await Vendor.create({
        accountType: 'wholesaler',
        name: trimmedName,
        email: normalizedEmail,
        password,
        phone: trimmedPhone,
        storeName: trimmedBusinessName,
        storeDescription: String(description || '').trim(),
        address: { street, city, state, zipCode, country },
        warehouseAddress: {
            warehouseName: trimmedBusinessName,
            contactPerson: trimmedName,
            contactNumber: trimmedPhone,
            address: street,
            city,
            state,
            pincode: zipCode,
        },
        documents: {
            businessLicense: docs.licenseUrl,
            gst: docs.licenseUrl,
            identity: docs.identityUrl,
        },
        // A wholesaler only sells B2B. wholesaleEnabled is switched on by admin approval.
        vendorCapabilities: { sellsProducts: false, providesServices: false, wholesaleEnabled: false },
        serviceCapability: { status: 'none' },
        wholesaleCapability: {
            status: 'pending',
            businessDetails: {
                businessType: String(businessType || '').trim(),
                gstNumber: normalizedGstin,
                expectedMonthlyVolume: String(expectedMonthlyVolume || '').trim(),
                description: String(description || '').trim(),
            },
            appliedAt: new Date(),
        },
        status: 'pending',
    });

    await createRegistrationDocumentRecords(wholesaler, docs, { licenseLabel: GST_CERTIFICATE_LABEL });
    await sendOTP(wholesaler, 'vendor_verification');
    await notifyAdminsOfRegistration(wholesaler, 'New Wholesaler Registration');

    res.status(201).json(new ApiResponse(201, { email: wholesaler.email }, 'Registration submitted. Please verify your email and await admin approval.'));
});
