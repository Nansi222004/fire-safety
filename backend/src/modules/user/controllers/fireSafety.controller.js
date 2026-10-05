import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import FireSafetyEquipment from '../../../models/FireSafetyEquipment.model.js';
import InspectionReport from '../../../models/InspectionReport.model.js';
import InspectionIssue from '../../../models/InspectionIssue.model.js';
import SupportTicket from '../../../models/SupportTicket.model.js';
import TicketType from '../../../models/TicketType.model.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { assertObjectId, CONDITION_LABELS, formatLocation } from '../../../services/fireSafety.service.js';

// Customer-facing projections — no worker identity, admin notes or internal notes.
const EQUIPMENT_FIELDS = 'name equipmentType details location currentStatus lastInspectedAt createdAt';
const ISSUE_FIELDS = 'issueNumber equipmentId reportId title description severity status condition recommendations notifiedAt createdAt resolvedAt';

const populateRecommendations = (query) => query
    .populate('recommendations.serviceId', 'name slug shortDescription image')
    .populate('recommendations.productId', 'name price image images')
    .populate('recommendations.vendorId', 'storeName storeLogo');

// Loads equipment owned by the logged-in customer; any other owner → 404 (no existence leak).
const loadOwnEquipment = async (req, equipmentId) => {
    assertObjectId(equipmentId, 'equipment id');
    const equipment = await FireSafetyEquipment.findOne({ _id: equipmentId, userId: req.user.id, isActive: true })
        .select(EQUIPMENT_FIELDS)
        .lean();
    if (!equipment) throw new ApiError(404, 'Equipment not found.');
    return equipment;
};

// GET /api/user/fire-safety/equipment
export const getMyEquipment = asyncHandler(async (req, res) => {
    const equipment = await FireSafetyEquipment.find({ userId: req.user.id, isActive: true })
        .select(EQUIPMENT_FIELDS)
        .sort({ createdAt: 1 })
        .lean();
    const openIssues = await InspectionIssue.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(String(req.user.id)), customerVisible: true, status: { $in: ['open', 'in_progress'] } } },
        { $group: { _id: '$equipmentId', count: { $sum: 1 } } },
    ]);
    const issueCount = Object.fromEntries(openIssues.map((i) => [String(i._id), i.count]));
    res.status(200).json(new ApiResponse(200, {
        equipment: equipment.map((e) => ({
            ...e,
            statusLabel: CONDITION_LABELS[e.currentStatus] || e.currentStatus,
            openIssues: issueCount[String(e._id)] || 0,
        })),
    }, 'Fire safety equipment fetched.'));
});

// GET /api/user/fire-safety/equipment/:id
export const getMyEquipmentDetail = asyncHandler(async (req, res) => {
    const equipment = await loadOwnEquipment(req, req.params.id);
    const [reports, issues] = await Promise.all([
        InspectionReport.find({ userId: req.user.id, 'items.equipmentId': equipment._id })
            .select('reportNumber inspectedAt items')
            .sort({ inspectedAt: -1 })
            .lean(),
        populateRecommendations(
            InspectionIssue.find({ userId: req.user.id, equipmentId: equipment._id, customerVisible: true }).select(ISSUE_FIELDS)
        ).sort({ createdAt: -1 }).lean(),
    ]);

    const history = reports.map((r) => {
        const item = r.items.find((i) => String(i.equipmentId) === String(equipment._id));
        return {
            reportNumber: r.reportNumber,
            inspectedAt: r.inspectedAt,
            condition: item?.condition,
            conditionLabel: CONDITION_LABELS[item?.condition] || item?.condition,
            observations: item?.observations || '',
            photos: item?.photos || [],
        };
    });

    res.status(200).json(new ApiResponse(200, {
        equipment: { ...equipment, statusLabel: CONDITION_LABELS[equipment.currentStatus] || equipment.currentStatus },
        history,
        issues,
    }, 'Equipment details fetched.'));
});

const loadOwnVisibleIssue = async (req, issueId) => {
    assertObjectId(issueId, 'issue id');
    const issue = await populateRecommendations(
        InspectionIssue.findOne({ _id: issueId, userId: req.user.id, customerVisible: true }).select(`${ISSUE_FIELDS} supportTicketIds`)
    ).populate('equipmentId', 'name equipmentType location').lean();
    if (!issue) throw new ApiError(404, 'Issue not found.');
    return issue;
};

// GET /api/user/fire-safety/issues/:id
export const getMyIssue = asyncHandler(async (req, res) => {
    const issue = await loadOwnVisibleIssue(req, req.params.id);
    delete issue.supportTicketIds;
    res.status(200).json(new ApiResponse(200, issue, 'Issue fetched.'));
});

// POST /api/user/fire-safety/issues/:id/contact  { message }
// Reuses the existing support-ticket system, carrying the issue context.
export const contactSafeFire = asyncHandler(async (req, res) => {
    const issue = await loadOwnVisibleIssue(req, req.params.id);
    const message = String(req.body?.message || '').trim();
    if (message.length < 3 || message.length > 1000) throw new ApiError(400, 'Message must be between 3 and 1000 characters.');

    const equipmentName = issue.equipmentId?.name || 'Equipment';
    const subject = `Fire Safety: ${equipmentName} – ${issue.issueNumber}`.slice(0, 100);
    const context = [
        `[Fire Safety Issue ${issue.issueNumber}] ${issue.title}`,
        `Equipment: ${equipmentName}`,
        issue.equipmentId?.location ? `Location: ${formatLocation(issue.equipmentId.location)}` : null,
        issue.condition ? `Reported condition: ${CONDITION_LABELS[issue.condition] || issue.condition}` : null,
        '',
        message,
    ].filter((line) => line !== null).join('\n');

    const ticketType = await TicketType.findOne({ isActive: true, isArchived: false, portals: 'customer' }).select('_id').lean();
    const ticket = await SupportTicket.create({
        userId: req.user.id,
        subject,
        ...(ticketType ? { ticketTypeId: ticketType._id } : {}),
        priority: ['high', 'critical'].includes(issue.severity) ? 'high' : 'medium',
        status: 'open',
        messages: [{ senderId: req.user.id, senderType: 'user', message: context }],
    });
    await InspectionIssue.updateOne({ _id: issue._id }, { $addToSet: { supportTicketIds: ticket._id } });

    Admin.find({ isActive: true }).select('_id').lean()
        .then((admins) => Promise.all(admins.map((admin) => createNotification({
            recipientId: admin._id,
            recipientType: 'admin',
            title: 'Fire Safety Support Request',
            message: `Customer contacted SafeFire about ${issue.issueNumber} (${equipmentName}).`,
            type: 'support',
            data: { ticketId: String(ticket._id), fireSafetyIssueId: String(issue._id) },
        }).catch(() => null))))
        .catch(() => null);

    res.status(201).json(new ApiResponse(201, { ticketId: ticket._id, subject: ticket.subject }, 'Your request has been sent to SafeFire support.'));
});
