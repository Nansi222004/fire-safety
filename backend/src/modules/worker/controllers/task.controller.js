import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import InspectionTask from '../../../models/InspectionTask.model.js';
import InspectionReport from '../../../models/InspectionReport.model.js';
import InspectionIssue from '../../../models/InspectionIssue.model.js';
import FireSafetyEquipment, { EQUIPMENT_CONDITIONS } from '../../../models/FireSafetyEquipment.model.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';
import {
    uploadLocalFileToCloudinaryAndCleanup,
    deleteFromCloudinary,
    cleanupLocalFiles,
} from '../../../services/upload.service.js';
import {
    generateFireSafetyNumber,
    SUGGESTED_ISSUE,
    CONDITION_LABELS,
    assertObjectId,
    toDateOrNull,
} from '../../../services/fireSafety.service.js';

// Workers never see pending (unassigned) or cancelled tasks.
const WORKER_VISIBLE_STATUSES = ['assigned', 'in_progress', 'submitted', 'reviewed', 'completed'];
const SUBMITTABLE_STATUSES = ['assigned', 'in_progress'];

// Only what the worker needs for the visit — no email, no account data.
const CUSTOMER_FIELDS = 'name phone';
const EQUIPMENT_FIELDS = 'name equipmentType details location currentStatus lastInspectedAt';

/**
 * Loads a task and enforces that it is assigned to the authenticated worker.
 * 404 → no such task; 403 → task exists but belongs to someone else.
 */
const loadOwnTask = async (req, taskId) => {
    assertObjectId(taskId, 'task id');
    const task = await InspectionTask.findById(taskId);
    if (!task) throw new ApiError(404, 'Task not found.');
    if (String(task.workerId) !== String(req.user.id) || !WORKER_VISIBLE_STATUSES.includes(task.status)) {
        throw new ApiError(403, 'This task is not assigned to you.');
    }
    return task;
};

// GET /api/worker/dashboard
export const getDashboard = asyncHandler(async (req, res) => {
    const workerId = req.user.id;
    const [counts, upcoming] = await Promise.all([
        InspectionTask.aggregate([
            { $match: { workerId: new mongoose.Types.ObjectId(String(workerId)), status: { $in: WORKER_VISIBLE_STATUSES } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        InspectionTask.find({ workerId, status: { $in: SUBMITTABLE_STATUSES } })
            .select('taskNumber title status scheduledDate dueDate location')
            .populate('userId', 'name')
            .sort({ scheduledDate: 1, createdAt: 1 })
            .limit(5)
            .lean(),
    ]);
    const stats = Object.fromEntries(WORKER_VISIBLE_STATUSES.map((s) => [s, 0]));
    counts.forEach((c) => { stats[c._id] = c.count; });
    res.status(200).json(new ApiResponse(200, { stats, upcoming }, 'Dashboard fetched.'));
});

// GET /api/worker/tasks?status=
export const getMyTasks = asyncHandler(async (req, res) => {
    const filter = { workerId: req.user.id, status: { $in: WORKER_VISIBLE_STATUSES } };
    if (req.query.status && WORKER_VISIBLE_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.view === 'open') filter.status = { $in: SUBMITTABLE_STATUSES };

    const tasks = await InspectionTask.find(filter)
        .select('taskNumber title status scheduledDate dueDate location equipmentIds submittedAt')
        .populate('userId', 'name')
        .sort({ scheduledDate: 1, createdAt: -1 })
        .limit(200)
        .lean();
    res.status(200).json(new ApiResponse(200, { tasks }, 'Tasks fetched.'));
});

// GET /api/worker/tasks/:id
export const getMyTask = asyncHandler(async (req, res) => {
    const task = await loadOwnTask(req, req.params.id);
    await task.populate([
        { path: 'userId', select: CUSTOMER_FIELDS },
        { path: 'equipmentIds', select: EQUIPMENT_FIELDS },
    ]);
    const report = task.reportId
        ? await InspectionReport.findOne({ _id: task.reportId, workerId: req.user.id }).select('-adminNotes').lean()
        : null;
    const data = task.toObject();
    delete data.statusHistory;
    res.status(200).json(new ApiResponse(200, { task: data, report }, 'Task fetched.'));
});

// PATCH /api/worker/tasks/:id/start
export const startTask = asyncHandler(async (req, res) => {
    const task = await loadOwnTask(req, req.params.id);
    if (task.status !== 'assigned') throw new ApiError(400, `Task cannot be started from status "${task.status}".`);
    task.status = 'in_progress';
    task.startedAt = new Date();
    task.statusHistory.push({ status: 'in_progress', changedBy: req.user.id, changedByType: 'worker' });
    await task.save();
    res.status(200).json(new ApiResponse(200, { status: task.status, startedAt: task.startedAt }, 'Task started.'));
});

// POST /api/worker/uploads/images (multipart, field "images")
export const uploadInspectionImages = asyncHandler(async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) throw new ApiError(400, 'At least one image file is required.');

    const settled = await Promise.allSettled(
        files.map((file) => uploadLocalFileToCloudinaryAndCleanup(file.path, 'fire-safety/inspections'))
    );
    const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
    if (ok.length !== files.length) {
        await Promise.allSettled(ok.map((u) => u?.publicId).filter(Boolean).map((id) => deleteFromCloudinary(id)));
        await cleanupLocalFiles(files.map((f) => f.path));
        throw new ApiError(500, 'Failed to upload one or more images.');
    }
    res.status(200).json(new ApiResponse(200, ok.map((u) => ({ url: u.url, publicId: u.publicId })), 'Images uploaded.'));
});

const isHttpUrl = (value) => /^https?:\/\/\S+$/i.test(String(value || ''));

// POST /api/worker/tasks/:id/report
export const submitReport = asyncHandler(async (req, res) => {
    const task = await loadOwnTask(req, req.params.id);
    if (!SUBMITTABLE_STATUSES.includes(task.status)) {
        throw new ApiError(400, 'A report has already been submitted for this task.');
    }

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const taskEquipmentIds = task.equipmentIds.map(String);
    const seen = new Set();
    const items = rawItems.map((raw) => {
        const equipmentId = String(raw?.equipmentId || '');
        if (!taskEquipmentIds.includes(equipmentId)) throw new ApiError(400, 'Report contains equipment that is not part of this task.');
        if (seen.has(equipmentId)) throw new ApiError(400, 'Each equipment item can only be reported once.');
        seen.add(equipmentId);
        if (!EQUIPMENT_CONDITIONS.includes(raw?.condition)) throw new ApiError(400, 'Please select a valid condition for every equipment item.');
        const photos = (Array.isArray(raw?.photos) ? raw.photos : []).map((p) => String(p).trim()).filter(Boolean);
        if (photos.length > 5) throw new ApiError(400, 'Maximum 5 photos per equipment item.');
        if (photos.some((p) => !isHttpUrl(p))) throw new ApiError(400, 'Invalid photo URL.');
        return {
            equipmentId,
            condition: raw.condition,
            observations: String(raw?.observations || '').trim().slice(0, 2000),
            photos,
        };
    });
    if (items.length !== taskEquipmentIds.length) {
        throw new ApiError(400, 'Please record the condition of every equipment item in this task.');
    }

    const inspectedAt = toDateOrNull(req.body?.inspectedAt) || new Date();
    if (inspectedAt.getTime() > Date.now() + 5 * 60 * 1000) throw new ApiError(400, 'Inspection time cannot be in the future.');

    const equipmentDocs = await FireSafetyEquipment.find({ _id: { $in: taskEquipmentIds }, userId: task.userId }).lean();
    const equipmentMap = Object.fromEntries(equipmentDocs.map((e) => [String(e._id), e]));
    if (equipmentDocs.length !== taskEquipmentIds.length) throw new ApiError(400, 'Some task equipment no longer exists.');

    let report;
    try {
        report = await InspectionReport.create({
            reportNumber: generateFireSafetyNumber('INS'),
            taskId: task._id,
            workerId: req.user.id,
            userId: task.userId,
            location: task.location,
            items: items.map((item) => ({
                ...item,
                equipmentName: equipmentMap[item.equipmentId].name,
                equipmentType: equipmentMap[item.equipmentId].equipmentType,
            })),
            notes: String(req.body?.notes || '').trim().slice(0, 4000),
            inspectedAt,
            submittedAt: new Date(),
        });
    } catch (err) {
        if (err?.code === 11000) throw new ApiError(409, 'A report has already been submitted for this task.');
        throw err;
    }

    task.status = 'submitted';
    task.submittedAt = report.submittedAt;
    task.reportId = report._id;
    task.statusHistory.push({ status: 'submitted', changedBy: req.user.id, changedByType: 'worker' });
    await task.save();

    // Current status reflects the latest inspection; full history stays in InspectionReport.
    await Promise.all(items.map((item) =>
        FireSafetyEquipment.updateOne(
            { _id: item.equipmentId, $or: [{ lastInspectedAt: null }, { lastInspectedAt: { $lte: inspectedAt } }] },
            { $set: { currentStatus: item.condition, lastInspectedAt: inspectedAt, lastReportId: report._id } }
        )
    ));

    // System-suggested issues for non-OK equipment (hidden from the customer until Admin reviews).
    const issueDocs = items
        .filter((item) => item.condition !== 'ok' && SUGGESTED_ISSUE[item.condition])
        .map((item) => ({
            issueNumber: generateFireSafetyNumber('ISS'),
            userId: task.userId,
            equipmentId: item.equipmentId,
            reportId: report._id,
            taskId: task._id,
            workerId: req.user.id,
            condition: item.condition,
            title: `${equipmentMap[item.equipmentId].name}: ${SUGGESTED_ISSUE[item.condition].title}`,
            description: item.observations,
            severity: SUGGESTED_ISSUE[item.condition].severity,
            status: 'open',
            customerVisible: false,
            createdBy: 'system',
        }));
    if (issueDocs.length) await InspectionIssue.insertMany(issueDocs);

    Admin.find({ isActive: true }).select('_id').lean()
        .then((admins) => Promise.all(admins.map((admin) => createNotification({
            recipientId: admin._id,
            recipientType: 'admin',
            title: 'Inspection Report Submitted',
            message: `Report ${report.reportNumber} submitted for task ${task.taskNumber}. ${issueDocs.length} issue(s) flagged: ${
                items.filter((i) => i.condition !== 'ok').map((i) => CONDITION_LABELS[i.condition]).join(', ') || 'none'
            }.`,
            type: 'system',
            data: { reportId: String(report._id), taskId: String(task._id) },
        }).catch(() => null))))
        .catch(() => null);

    res.status(201).json(new ApiResponse(201, { report, issuesFlagged: issueDocs.length }, 'Inspection report submitted.'));
});

// GET /api/worker/reports
export const getMyReports = asyncHandler(async (req, res) => {
    const reports = await InspectionReport.find({ workerId: req.user.id })
        .select('-adminNotes')
        .populate('taskId', 'taskNumber title')
        .populate('userId', 'name')
        .sort({ submittedAt: -1 })
        .limit(200)
        .lean();
    res.status(200).json(new ApiResponse(200, { reports }, 'Reports fetched.'));
});

// GET /api/worker/reports/:id
export const getMyReport = asyncHandler(async (req, res) => {
    assertObjectId(req.params.id, 'report id');
    const report = await InspectionReport.findById(req.params.id)
        .select('-adminNotes')
        .populate('taskId', 'taskNumber title')
        .populate('userId', 'name')
        .lean();
    if (!report) throw new ApiError(404, 'Report not found.');
    if (String(report.workerId) !== String(req.user.id)) throw new ApiError(403, 'This report does not belong to you.');
    res.status(200).json(new ApiResponse(200, report, 'Report fetched.'));
});
