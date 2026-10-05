import crypto from 'crypto';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import User from '../../../models/User.model.js';
import Address from '../../../models/Address.model.js';
import Service from '../../../models/Service.model.js';
import Product from '../../../models/Product.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Worker from '../../../models/Worker.model.js';
import FireSafetyEquipment, { EQUIPMENT_TYPES } from '../../../models/FireSafetyEquipment.model.js';
import InspectionTask, { INSPECTION_TASK_STATUSES } from '../../../models/InspectionTask.model.js';
import InspectionReport from '../../../models/InspectionReport.model.js';
import InspectionIssue, { ISSUE_STATUSES } from '../../../models/InspectionIssue.model.js';
import { createNotification } from '../../../services/notification.service.js';
import {
    generateFireSafetyNumber,
    sanitizeLocation,
    toDateOrNull,
    assertObjectId,
    isObjectId,
} from '../../../services/fireSafety.service.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUSTOMER_FIELDS = 'name email phone';

const generatePassword = () => `Sf${crypto.randomBytes(6).toString('base64url')}9!`;

// ═══ Workers ═══════════════════════════════════════════════════════════════

// GET /api/admin/fire-safety/workers
export const listWorkers = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'inactive') filter.isActive = false;
    const search = String(req.query.search || '').trim();
    if (search) {
        const rx = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const workers = await Worker.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    const counts = await InspectionTask.aggregate([
        { $match: { workerId: { $in: workers.map((w) => w._id) } } },
        { $group: { _id: { workerId: '$workerId', open: { $in: ['$status', ['assigned', 'in_progress']] } }, count: { $sum: 1 } } },
    ]);
    const byWorker = {};
    counts.forEach((c) => {
        const key = String(c._id.workerId);
        byWorker[key] = byWorker[key] || { openTasks: 0, totalTasks: 0 };
        byWorker[key].totalTasks += c.count;
        if (c._id.open) byWorker[key].openTasks += c.count;
    });
    res.status(200).json(new ApiResponse(200, {
        workers: workers.map((w) => ({ ...w, ...(byWorker[String(w._id)] || { openTasks: 0, totalTasks: 0 }) })),
    }, 'Workers fetched.'));
});

// POST /api/admin/fire-safety/workers
export const createWorker = asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-10);
    let password = String(req.body?.password || '');

    if (name.length < 2) throw new ApiError(400, 'Worker name is required.');
    if (!EMAIL_RE.test(email)) throw new ApiError(400, 'A valid email is required.');
    if (phone && phone.length !== 10) throw new ApiError(400, 'Mobile number must be 10 digits.');
    const generated = !password;
    if (generated) password = generatePassword();
    if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters.');

    if (await Worker.exists({ email })) throw new ApiError(409, 'A worker with this email already exists.');

    const worker = await Worker.create({ name, email, phone, password, isActive: true, createdBy: req.user.id });
    const data = worker.toObject();
    delete data.password;
    // The password is only returned once (at creation) so Admin can hand over credentials.
    res.status(201).json(new ApiResponse(201, { worker: data, credentials: { email, password, generated } }, 'Worker created.'));
});

// GET /api/admin/fire-safety/workers/:id
export const getWorker = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'worker id');
    const worker = await Worker.findById(req.params.id).lean();
    if (!worker) throw new ApiError(404, 'Worker not found.');
    const [tasks, reports] = await Promise.all([
        InspectionTask.find({ workerId: worker._id }).select('taskNumber title status scheduledDate dueDate submittedAt').populate('userId', 'name').sort({ createdAt: -1 }).limit(100).lean(),
        InspectionReport.find({ workerId: worker._id }).select('reportNumber taskId inspectedAt submittedAt reviewStatus items.condition').populate('userId', 'name').sort({ submittedAt: -1 }).limit(100).lean(),
    ]);
    res.status(200).json(new ApiResponse(200, { worker, tasks, reports }, 'Worker fetched.'));
});

// PATCH /api/admin/fire-safety/workers/:id  { name?, phone?, isActive? }
export const updateWorker = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'worker id');
    const worker = await Worker.findById(req.params.id).select('+refreshTokenHash +refreshTokenExpiresAt');
    if (!worker) throw new ApiError(404, 'Worker not found.');
    if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim();
        if (name.length < 2) throw new ApiError(400, 'Worker name is required.');
        worker.name = name;
    }
    if (req.body?.phone !== undefined) worker.phone = String(req.body.phone).replace(/\D/g, '').slice(-10);
    if (req.body?.isActive !== undefined) {
        worker.isActive = Boolean(req.body.isActive);
        if (!worker.isActive) {
            // Deactivation revokes the refresh session; enforceAccountStatus blocks access tokens.
            worker.refreshTokenHash = undefined;
            worker.refreshTokenExpiresAt = undefined;
        }
    }
    await worker.save();
    const data = worker.toObject();
    delete data.refreshTokenHash;
    delete data.refreshTokenExpiresAt;
    res.status(200).json(new ApiResponse(200, data, 'Worker updated.'));
});

// POST /api/admin/fire-safety/workers/:id/reset-password
export const resetWorkerPassword = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'worker id');
    const worker = await Worker.findById(req.params.id).select('+password +refreshTokenHash +refreshTokenExpiresAt');
    if (!worker) throw new ApiError(404, 'Worker not found.');
    const password = String(req.body?.password || '') || generatePassword();
    if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters.');
    worker.password = password;
    worker.refreshTokenHash = undefined;
    worker.refreshTokenExpiresAt = undefined;
    await worker.save();
    res.status(200).json(new ApiResponse(200, { credentials: { email: worker.email, password } }, 'Worker password reset.'));
});

// ═══ Customers (lookup helpers for the module) ═════════════════════════════

// GET /api/admin/fire-safety/customers?search=
export const searchCustomers = asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const filter = {};
    if (search) {
        const rx = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const customers = await User.find(filter).select(CUSTOMER_FIELDS).sort({ createdAt: -1 }).limit(20).lean();
    res.status(200).json(new ApiResponse(200, { customers }, 'Customers fetched.'));
});

// GET /api/admin/fire-safety/customers/:userId/addresses
export const getCustomerAddresses = asyncHandler(async (req, res) => {
    assertObjectId(req.params.userId, 'customer id');
    const addresses = await Address.find({ userId: req.params.userId }).lean();
    res.status(200).json(new ApiResponse(200, { addresses }, 'Addresses fetched.'));
});

const resolveLocation = async (userId, addressId, rawLocation) => {
    if (addressId) {
        assertObjectId(addressId, 'address id');
        const address = await Address.findOne({ _id: addressId, userId }).lean();
        if (!address) throw new ApiError(400, 'Selected address does not belong to this customer.');
        return {
            addressId: address._id,
            location: sanitizeLocation({ label: rawLocation?.label || address.name, ...address }),
        };
    }
    const location = sanitizeLocation(rawLocation);
    if (!location.address || !location.city) throw new ApiError(400, 'Location address and city are required.');
    return { addressId: null, location };
};

// ═══ Equipment ═════════════════════════════════════════════════════════════

// GET /api/admin/fire-safety/equipment?userId=&status=&type=
export const listEquipment = asyncHandler(async (req, res) => {
    const filter = { isActive: true };
    if (req.query.userId) { assertObjectId(req.query.userId, 'customer id'); filter.userId = req.query.userId; }
    if (req.query.status) filter.currentStatus = req.query.status;
    if (req.query.type) filter.equipmentType = req.query.type;
    const equipment = await FireSafetyEquipment.find(filter).populate('userId', CUSTOMER_FIELDS).sort({ updatedAt: -1 }).limit(500).lean();
    res.status(200).json(new ApiResponse(200, { equipment }, 'Equipment fetched.'));
});

const sanitizeDetails = (raw = {}) => ({
    brand: String(raw.brand || '').trim().slice(0, 100),
    model: String(raw.model || '').trim().slice(0, 100),
    capacity: String(raw.capacity || '').trim().slice(0, 100),
    serialNumber: String(raw.serialNumber || '').trim().slice(0, 100),
    placement: String(raw.placement || '').trim().slice(0, 200),
    installedOn: toDateOrNull(raw.installedOn),
    expiresOn: toDateOrNull(raw.expiresOn),
});

// POST /api/admin/fire-safety/equipment
export const createEquipment = asyncHandler(async (req, res) => {
    const { userId, addressId, location, equipmentType, name, details } = req.body || {};
    assertObjectId(userId, 'customer id');
    if (!(await User.exists({ _id: userId }))) throw new ApiError(404, 'Customer not found.');
    if (!EQUIPMENT_TYPES.includes(equipmentType)) throw new ApiError(400, 'Invalid equipment type.');
    const trimmedName = String(name || '').trim();
    if (trimmedName.length < 2) throw new ApiError(400, 'Equipment name is required.');

    const resolved = await resolveLocation(userId, addressId, location);
    const equipment = await FireSafetyEquipment.create({
        userId,
        ...resolved,
        equipmentType,
        name: trimmedName,
        details: sanitizeDetails(details),
        createdBy: req.user.id,
    });
    res.status(201).json(new ApiResponse(201, equipment, 'Equipment added.'));
});

// PATCH /api/admin/fire-safety/equipment/:id
export const updateEquipment = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'equipment id');
    const equipment = await FireSafetyEquipment.findById(req.params.id);
    if (!equipment) throw new ApiError(404, 'Equipment not found.');
    const { name, equipmentType, details, location, addressId, isActive } = req.body || {};
    if (name !== undefined) {
        if (String(name).trim().length < 2) throw new ApiError(400, 'Equipment name is required.');
        equipment.name = String(name).trim();
    }
    if (equipmentType !== undefined) {
        if (!EQUIPMENT_TYPES.includes(equipmentType)) throw new ApiError(400, 'Invalid equipment type.');
        equipment.equipmentType = equipmentType;
    }
    if (details !== undefined) equipment.details = sanitizeDetails({ ...equipment.details?.toObject?.(), ...details });
    if (location !== undefined || addressId !== undefined) Object.assign(equipment, await resolveLocation(equipment.userId, addressId, location));
    if (isActive !== undefined) equipment.isActive = Boolean(isActive);
    await equipment.save();
    res.status(200).json(new ApiResponse(200, equipment, 'Equipment updated.'));
});

// GET /api/admin/fire-safety/equipment/:id  (with full inspection history)
export const getEquipment = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'equipment id');
    const equipment = await FireSafetyEquipment.findById(req.params.id).populate('userId', CUSTOMER_FIELDS).lean();
    if (!equipment) throw new ApiError(404, 'Equipment not found.');
    const [reports, issues] = await Promise.all([
        InspectionReport.find({ 'items.equipmentId': equipment._id }).populate('workerId', 'name').sort({ inspectedAt: -1 }).lean(),
        InspectionIssue.find({ equipmentId: equipment._id }).sort({ createdAt: -1 }).lean(),
    ]);
    const history = reports.map((r) => {
        const item = r.items.find((i) => String(i.equipmentId) === String(equipment._id));
        return {
            reportId: r._id, reportNumber: r.reportNumber, inspectedAt: r.inspectedAt, worker: r.workerId,
            condition: item?.condition, observations: item?.observations, photos: item?.photos || [],
        };
    });
    res.status(200).json(new ApiResponse(200, { equipment, history, issues }, 'Equipment fetched.'));
});

// ═══ Inspection tasks ══════════════════════════════════════════════════════

const assertActiveWorker = async (workerId) => {
    assertObjectId(workerId, 'worker id');
    const worker = await Worker.findById(workerId).select('isActive name').lean();
    if (!worker) throw new ApiError(404, 'Worker not found.');
    if (!worker.isActive) throw new ApiError(400, 'Cannot assign tasks to a deactivated worker.');
    return worker;
};

// GET /api/admin/fire-safety/tasks?status=&workerId=&userId=
export const listTasks = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status && INSPECTION_TASK_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.workerId && isObjectId(req.query.workerId)) filter.workerId = req.query.workerId;
    if (req.query.userId && isObjectId(req.query.userId)) filter.userId = req.query.userId;
    const tasks = await InspectionTask.find(filter)
        .populate('userId', CUSTOMER_FIELDS)
        .populate('workerId', 'name email')
        .populate('equipmentIds', 'name equipmentType')
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();
    res.status(200).json(new ApiResponse(200, { tasks }, 'Tasks fetched.'));
});

// POST /api/admin/fire-safety/tasks
export const createTask = asyncHandler(async (req, res) => {
    const { userId, equipmentIds = [], workerId, title, instructions = '', scheduledDate, dueDate, location } = req.body || {};
    assertObjectId(userId, 'customer id');
    if (!(await User.exists({ _id: userId }))) throw new ApiError(404, 'Customer not found.');
    const trimmedTitle = String(title || '').trim();
    if (trimmedTitle.length < 3) throw new ApiError(400, 'Task title is required.');
    if (!Array.isArray(equipmentIds) || equipmentIds.length === 0) throw new ApiError(400, 'Select at least one equipment item to inspect.');
    equipmentIds.forEach((id) => assertObjectId(id, 'equipment id'));

    const equipment = await FireSafetyEquipment.find({ _id: { $in: equipmentIds }, userId, isActive: true }).lean();
    if (equipment.length !== new Set(equipmentIds.map(String)).size) {
        throw new ApiError(400, "All equipment must be active and belong to the selected customer.");
    }
    if (workerId) await assertActiveWorker(workerId);

    const scheduled = toDateOrNull(scheduledDate);
    const due = toDateOrNull(dueDate);
    if (scheduled && due && due < scheduled) throw new ApiError(400, 'Due date cannot be before the inspection date.');

    const status = workerId ? 'assigned' : 'pending';
    const task = await InspectionTask.create({
        taskNumber: generateFireSafetyNumber('TSK'),
        userId,
        location: location ? sanitizeLocation(location) : equipment[0].location,
        equipmentIds: equipment.map((e) => e._id),
        workerId: workerId || null,
        title: trimmedTitle,
        instructions: String(instructions).trim().slice(0, 4000),
        scheduledDate: scheduled,
        dueDate: due,
        status,
        createdBy: req.user.id,
        statusHistory: [{ status, changedBy: req.user.id, changedByType: 'admin' }],
    });
    res.status(201).json(new ApiResponse(201, task, 'Inspection task created.'));
});

// GET /api/admin/fire-safety/tasks/:id
export const getTask = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'task id');
    const task = await InspectionTask.findById(req.params.id)
        .populate('userId', CUSTOMER_FIELDS)
        .populate('workerId', 'name email phone')
        .populate('equipmentIds', 'name equipmentType details currentStatus lastInspectedAt location')
        .lean();
    if (!task) throw new ApiError(404, 'Task not found.');
    const report = task.reportId ? await InspectionReport.findById(task.reportId).lean() : null;
    res.status(200).json(new ApiResponse(200, { task, report }, 'Task fetched.'));
});

// PATCH /api/admin/fire-safety/tasks/:id  { workerId?, status?, title?, instructions?, scheduledDate?, dueDate? }
export const updateTask = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'task id');
    const task = await InspectionTask.findById(req.params.id);
    if (!task) throw new ApiError(404, 'Task not found.');
    const { workerId, status, title, instructions, scheduledDate, dueDate } = req.body || {};
    const locked = ['submitted', 'reviewed', 'completed'].includes(task.status);

    if (workerId !== undefined) {
        if (locked) throw new ApiError(400, 'Cannot reassign a task after its report was submitted.');
        if (task.status === 'cancelled') throw new ApiError(400, 'Cannot assign a cancelled task.');
        if (workerId) {
            await assertActiveWorker(workerId);
            task.workerId = workerId;
            task.status = 'assigned';
            task.startedAt = null;
        } else {
            task.workerId = null;
            task.status = 'pending';
        }
        task.statusHistory.push({ status: task.status, changedBy: req.user.id, changedByType: 'admin', note: workerId ? 'Worker assigned' : 'Worker unassigned' });
    }
    if (title !== undefined) {
        if (String(title).trim().length < 3) throw new ApiError(400, 'Task title is required.');
        task.title = String(title).trim();
    }
    if (instructions !== undefined) task.instructions = String(instructions).trim().slice(0, 4000);
    if (scheduledDate !== undefined) task.scheduledDate = toDateOrNull(scheduledDate);
    if (dueDate !== undefined) task.dueDate = toDateOrNull(dueDate);

    if (status !== undefined && status !== task.status) {
        const allowed = {
            pending: ['cancelled'],
            assigned: ['cancelled'],
            in_progress: ['cancelled'],
            submitted: ['reviewed', 'completed'],
            reviewed: ['completed'],
            cancelled: [],
            completed: [],
        };
        if (!(allowed[task.status] || []).includes(status)) {
            throw new ApiError(400, `Cannot change task status from "${task.status}" to "${status}".`);
        }
        task.status = status;
        if (status === 'reviewed') { task.reviewedAt = new Date(); task.reviewedBy = req.user.id; }
        if (status === 'completed') {
            task.completedAt = new Date();
            if (!task.reviewedAt) { task.reviewedAt = new Date(); task.reviewedBy = req.user.id; }
        }
        task.statusHistory.push({ status, changedBy: req.user.id, changedByType: 'admin' });
        if (['reviewed', 'completed'].includes(status) && task.reportId) {
            await InspectionReport.updateOne({ _id: task.reportId }, { $set: { reviewStatus: 'reviewed', reviewedAt: new Date(), reviewedBy: req.user.id } });
        }
    }
    await task.save();
    res.status(200).json(new ApiResponse(200, task, 'Task updated.'));
});

// ═══ Inspection reports ════════════════════════════════════════════════════

// GET /api/admin/fire-safety/reports?reviewStatus=&workerId=&userId=
export const listReports = asyncHandler(async (req, res) => {
    const filter = {};
    if (['pending_review', 'reviewed'].includes(req.query.reviewStatus)) filter.reviewStatus = req.query.reviewStatus;
    if (req.query.workerId && isObjectId(req.query.workerId)) filter.workerId = req.query.workerId;
    if (req.query.userId && isObjectId(req.query.userId)) filter.userId = req.query.userId;
    const reports = await InspectionReport.find(filter)
        .populate('userId', CUSTOMER_FIELDS)
        .populate('workerId', 'name email')
        .populate('taskId', 'taskNumber title status')
        .sort({ submittedAt: -1 })
        .limit(500)
        .lean();
    res.status(200).json(new ApiResponse(200, { reports }, 'Reports fetched.'));
});

// GET /api/admin/fire-safety/reports/:id
export const getReport = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'report id');
    const report = await InspectionReport.findById(req.params.id)
        .populate('userId', CUSTOMER_FIELDS)
        .populate('workerId', 'name email phone')
        .populate('taskId', 'taskNumber title status instructions scheduledDate')
        .lean();
    if (!report) throw new ApiError(404, 'Report not found.');
    const issues = await InspectionIssue.find({ reportId: report._id }).lean();
    res.status(200).json(new ApiResponse(200, { report, issues }, 'Report fetched.'));
});

// PATCH /api/admin/fire-safety/reports/:id/review  { adminNotes? }
export const reviewReport = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'report id');
    const report = await InspectionReport.findById(req.params.id);
    if (!report) throw new ApiError(404, 'Report not found.');
    if (req.body?.adminNotes !== undefined) report.adminNotes = String(req.body.adminNotes).trim().slice(0, 4000);
    report.reviewStatus = 'reviewed';
    report.reviewedAt = new Date();
    report.reviewedBy = req.user.id;
    await report.save();
    await InspectionTask.updateOne(
        { _id: report.taskId, status: 'submitted' },
        {
            $set: { status: 'reviewed', reviewedAt: new Date(), reviewedBy: req.user.id },
            $push: { statusHistory: { status: 'reviewed', changedBy: req.user.id, changedByType: 'admin' } },
        }
    );
    res.status(200).json(new ApiResponse(200, report, 'Report marked as reviewed.'));
});

// ═══ Issues / alerts ═══════════════════════════════════════════════════════

const sanitizeRecommendations = async (raw) => {
    if (!Array.isArray(raw)) throw new ApiError(400, 'Recommendations must be a list.');
    if (raw.length > 10) throw new ApiError(400, 'Maximum 10 recommendations per issue.');
    const out = [];
    for (const rec of raw) {
        const kind = rec?.kind;
        const note = String(rec?.note || '').trim().slice(0, 300);
        if (kind === 'service') {
            assertObjectId(rec.serviceId, 'service id');
            if (!(await Service.exists({ _id: rec.serviceId }))) throw new ApiError(400, 'Recommended service not found.');
            out.push({ kind, serviceId: rec.serviceId, note });
        } else if (kind === 'product') {
            assertObjectId(rec.productId, 'product id');
            if (!(await Product.exists({ _id: rec.productId }))) throw new ApiError(400, 'Recommended product not found.');
            out.push({ kind, productId: rec.productId, note });
        } else if (kind === 'vendor') {
            assertObjectId(rec.vendorId, 'vendor id');
            if (!(await Vendor.exists({ _id: rec.vendorId, status: 'approved' }))) throw new ApiError(400, 'Recommended vendor not found or not approved.');
            out.push({ kind, vendorId: rec.vendorId, note });
        } else {
            throw new ApiError(400, 'Recommendation kind must be service, product or vendor.');
        }
    }
    return out;
};

const populateIssue = (query) => query
    .populate('userId', CUSTOMER_FIELDS)
    .populate('equipmentId', 'name equipmentType location currentStatus')
    .populate('workerId', 'name')
    .populate('reportId', 'reportNumber inspectedAt')
    .populate('recommendations.serviceId', 'name slug')
    .populate('recommendations.productId', 'name price')
    .populate('recommendations.vendorId', 'storeName');

// GET /api/admin/fire-safety/issues?status=&userId=&equipmentId=
export const listIssues = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status && ISSUE_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.userId && isObjectId(req.query.userId)) filter.userId = req.query.userId;
    if (req.query.equipmentId && isObjectId(req.query.equipmentId)) filter.equipmentId = req.query.equipmentId;
    const issues = await populateIssue(InspectionIssue.find(filter)).sort({ createdAt: -1 }).limit(500).lean();
    res.status(200).json(new ApiResponse(200, { issues }, 'Issues fetched.'));
});

// POST /api/admin/fire-safety/issues  { reportId, equipmentId, title, description?, severity? }
export const createIssue = asyncHandler(async (req, res) => {
    const { reportId, equipmentId, title, description = '', severity = 'medium', internalNotes = '' } = req.body || {};
    assertObjectId(reportId, 'report id');
    assertObjectId(equipmentId, 'equipment id');
    const report = await InspectionReport.findById(reportId).lean();
    if (!report) throw new ApiError(404, 'Report not found.');
    const item = report.items.find((i) => String(i.equipmentId) === String(equipmentId));
    if (!item) throw new ApiError(400, 'Equipment is not part of this report.');
    if (String(title || '').trim().length < 3) throw new ApiError(400, 'Issue title is required.');
    if (!['low', 'medium', 'high', 'critical'].includes(severity)) throw new ApiError(400, 'Invalid severity.');

    const issue = await InspectionIssue.create({
        issueNumber: generateFireSafetyNumber('ISS'),
        userId: report.userId,
        equipmentId,
        reportId,
        taskId: report.taskId,
        workerId: report.workerId,
        condition: item.condition,
        title: String(title).trim(),
        description: String(description).trim().slice(0, 2000),
        internalNotes: String(internalNotes).trim().slice(0, 2000),
        severity,
        createdBy: 'admin',
    });
    res.status(201).json(new ApiResponse(201, issue, 'Issue created.'));
});

// GET /api/admin/fire-safety/issues/:id
export const getIssue = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'issue id');
    const issue = await populateIssue(InspectionIssue.findById(req.params.id)).lean();
    if (!issue) throw new ApiError(404, 'Issue not found.');
    res.status(200).json(new ApiResponse(200, issue, 'Issue fetched.'));
});

// PATCH /api/admin/fire-safety/issues/:id
export const updateIssue = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'issue id');
    const issue = await InspectionIssue.findById(req.params.id);
    if (!issue) throw new ApiError(404, 'Issue not found.');
    const { title, description, internalNotes, severity, status, customerVisible, recommendations } = req.body || {};
    if (title !== undefined) {
        if (String(title).trim().length < 3) throw new ApiError(400, 'Issue title is required.');
        issue.title = String(title).trim();
    }
    if (description !== undefined) issue.description = String(description).trim().slice(0, 2000);
    if (internalNotes !== undefined) issue.internalNotes = String(internalNotes).trim().slice(0, 2000);
    if (severity !== undefined) {
        if (!['low', 'medium', 'high', 'critical'].includes(severity)) throw new ApiError(400, 'Invalid severity.');
        issue.severity = severity;
    }
    if (status !== undefined) {
        if (!ISSUE_STATUSES.includes(status)) throw new ApiError(400, 'Invalid issue status.');
        issue.status = status;
        issue.resolvedAt = ['resolved', 'closed'].includes(status) ? (issue.resolvedAt || new Date()) : null;
    }
    if (customerVisible !== undefined) issue.customerVisible = Boolean(customerVisible);
    if (recommendations !== undefined) issue.recommendations = await sanitizeRecommendations(recommendations);
    await issue.save();
    const populated = await populateIssue(InspectionIssue.findById(issue._id)).lean();
    res.status(200).json(new ApiResponse(200, populated, 'Issue updated.'));
});

// POST /api/admin/fire-safety/issues/:id/notify  { message? }
// Publishes the issue to the customer and sends an alert via the existing notification system.
export const notifyCustomer = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'issue id');
    const issue = await InspectionIssue.findById(req.params.id).populate('equipmentId', 'name');
    if (!issue) throw new ApiError(404, 'Issue not found.');
    const custom = String(req.body?.message || '').trim().slice(0, 500);
    const equipmentName = issue.equipmentId?.name || 'Your equipment';

    issue.customerVisible = true;
    issue.notifiedAt = new Date();
    issue.notificationCount = (issue.notificationCount || 0) + 1;
    await issue.save();

    await createNotification({
        recipientId: issue.userId,
        recipientType: 'user',
        title: 'Fire Safety Alert',
        message: custom || `${equipmentName}: ${issue.title}. Tap to view details.`,
        type: 'service',
        data: {
            fireSafetyEquipmentId: String(issue.equipmentId?._id || issue.equipmentId),
            fireSafetyIssueId: String(issue._id),
            link: `/my-fire-safety/${issue.equipmentId?._id || issue.equipmentId}?issue=${issue._id}`,
        },
    });

    res.status(200).json(new ApiResponse(200, { notifiedAt: issue.notifiedAt, notificationCount: issue.notificationCount }, 'Customer notified.'));
});
