import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5004/api';
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
    throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.');
}

const stamp = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
const password = `SfInspect!${crypto.randomBytes(8).toString('base64url')}9`;
const workerA = { name: 'SafeFire E2E Worker A', email: `safefire.inspector.a.${stamp}@example.com`, phone: '9876543291', password };
const workerB = { name: 'SafeFire E2E Worker B', email: `safefire.inspector.b.${stamp}@example.com`, phone: '9876543292', password: `${password}B` };
const customerA = { name: 'SafeFire E2E Customer A', email: `safefire.inspection.customer.a.${stamp}@example.com`, phone: '9876543293', password: `${password}C` };
const customerB = { name: 'SafeFire E2E Customer B', email: `safefire.inspection.customer.b.${stamp}@example.com`, phone: '9876543294', password: `${password}D` };

const state = {
    adminToken: null,
    workers: [],
    workerTokens: {},
    customers: [],
    customerTokens: {},
    equipment: [],
    tasks: [],
    reports: [],
    issues: [],
    notifications: [],
    supportTickets: [],
};
const checks = {};

const idOf = (value) => String(value?._id || value?.id || value || '');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const request = async (path, { method = 'GET', token, body, expected = [200] } = {}) => {
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* response without JSON */ }
    if (!expected.includes(response.status)) {
        throw new Error(`${method} ${path} returned ${response.status}: ${payload?.message || 'Unknown error'}`);
    }
    return { status: response.status, data: payload?.data, payload };
};

const registerCustomer = async (customer) => {
    await request('/user/auth/register', { method: 'POST', expected: [201], body: customer });
    const verified = await request('/user/auth/verify-otp', {
        method: 'POST',
        body: { email: customer.email, otp: '123456' },
    });
    const userId = idOf(verified.data.user);
    state.customers.push(userId);
    state.customerTokens[userId] = verified.data.accessToken;
    return { userId, token: verified.data.accessToken };
};

const createWorker = async (worker) => {
    const created = await request('/admin/fire-safety/workers', {
        method: 'POST', token: state.adminToken, expected: [201], body: worker,
    });
    const workerId = idOf(created.data.worker);
    state.workers.push(workerId);
    const login = await request('/worker/auth/login', {
        method: 'POST', body: { email: worker.email, password: worker.password },
    });
    state.workerTokens[workerId] = login.data.accessToken;
    return { workerId, token: login.data.accessToken };
};

const createEquipment = async (userId, suffix) => {
    const created = await request('/admin/fire-safety/equipment', {
        method: 'POST', token: state.adminToken, expected: [201],
        body: {
            userId,
            equipmentType: 'fire_extinguisher',
            name: `SafeFire E2E Fire Extinguisher 5 KG ${suffix}`,
            location: {
                label: `SafeFire E2E Inspection Site ${suffix}`,
                address: `${suffix}01 Controlled Inspection Road`,
                city: 'Mumbai', state: 'Maharashtra', zipCode: '400001',
            },
            details: { capacity: '5 KG', serialNumber: `SF-E2E-${stamp}-${suffix}`, placement: 'Ground floor exit' },
        },
    });
    const equipmentId = idOf(created.data);
    state.equipment.push(equipmentId);
    return equipmentId;
};

const createTask = async ({ userId, equipmentId, workerId, title }) => {
    const scheduledDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const created = await request('/admin/fire-safety/tasks', {
        method: 'POST', token: state.adminToken, expected: [201],
        body: {
            userId, equipmentIds: [equipmentId], workerId, title,
            instructions: 'Inspect pressure, seal, body condition, and record the actual equipment condition.',
            scheduledDate, dueDate,
        },
    });
    const taskId = idOf(created.data);
    state.tasks.push(taskId);
    return taskId;
};

const submitInspection = async ({ taskId, workerToken, equipmentId, condition, observations, notes }) => {
    await request(`/worker/tasks/${taskId}/start`, { method: 'PATCH', token: workerToken });
    const submitted = await request(`/worker/tasks/${taskId}/report`, {
        method: 'POST', token: workerToken, expected: [201],
        body: {
            inspectedAt: new Date().toISOString(), notes,
            items: [{ equipmentId, condition, observations, photos: [] }],
        },
    });
    const reportId = idOf(submitted.data.report);
    state.reports.push(reportId);
    return { reportId, issuesFlagged: submitted.data.issuesFlagged };
};

const cleanup = async () => {
    const mongoose = (await import('mongoose')).default;
    const [
        { default: Worker }, { default: FireSafetyEquipment }, { default: InspectionTask },
        { default: InspectionReport }, { default: InspectionIssue }, { default: Notification },
        { default: SupportTicket }, { default: User }, { default: Wallet },
    ] = await Promise.all([
        import('../models/Worker.model.js'), import('../models/FireSafetyEquipment.model.js'), import('../models/InspectionTask.model.js'),
        import('../models/InspectionReport.model.js'), import('../models/InspectionIssue.model.js'), import('../models/Notification.model.js'),
        import('../models/SupportTicket.model.js'), import('../models/User.model.js'), import('../models/UserWallet.model.js'),
    ]);
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGO_URI);
    const objectIds = (values) => values.filter(Boolean).map((id) => new mongoose.Types.ObjectId(id));
    await Promise.all([
        SupportTicket.deleteMany({ _id: { $in: objectIds(state.supportTickets) } }),
        Notification.deleteMany({
            $or: [
                { _id: { $in: objectIds(state.notifications) } },
                { recipientId: { $in: objectIds(state.customers) } },
                { 'data.taskId': { $in: state.tasks } },
                { 'data.reportId': { $in: state.reports } },
                { 'data.fireSafetyIssueId': { $in: state.issues } },
            ],
        }),
        InspectionIssue.deleteMany({ _id: { $in: objectIds(state.issues) } }),
        InspectionReport.deleteMany({ _id: { $in: objectIds(state.reports) } }),
        InspectionTask.deleteMany({ _id: { $in: objectIds(state.tasks) } }),
        FireSafetyEquipment.deleteMany({ _id: { $in: objectIds(state.equipment) } }),
        Worker.deleteMany({ _id: { $in: objectIds(state.workers) } }),
    ]);
    await Promise.all([
        Wallet.deleteMany({ userId: { $in: objectIds(state.customers) } }),
        User.deleteMany({ _id: { $in: objectIds(state.customers) } }),
    ]);
    const remaining = {
        workers: await Worker.countDocuments({ _id: { $in: objectIds(state.workers) } }),
        customers: await User.countDocuments({ _id: { $in: objectIds(state.customers) } }),
        equipment: await FireSafetyEquipment.countDocuments({ _id: { $in: objectIds(state.equipment) } }),
        tasks: await InspectionTask.countDocuments({ _id: { $in: objectIds(state.tasks) } }),
        reports: await InspectionReport.countDocuments({ _id: { $in: objectIds(state.reports) } }),
        issues: await InspectionIssue.countDocuments({ _id: { $in: objectIds(state.issues) } }),
        tickets: await SupportTicket.countDocuments({ _id: { $in: objectIds(state.supportTickets) } }),
        notifications: await Notification.countDocuments({
            $or: [
                { _id: { $in: objectIds(state.notifications) } },
                { recipientId: { $in: objectIds(state.customers) } },
                { 'data.taskId': { $in: state.tasks } },
                { 'data.reportId': { $in: state.reports } },
                { 'data.fireSafetyIssueId': { $in: state.issues } },
            ],
        }),
        wallets: await Wallet.countDocuments({ userId: { $in: objectIds(state.customers) } }),
    };
    await mongoose.disconnect();
    return remaining;
};

let cleanupResult = null;
let failure = null;
try {
    const adminLogin = await request('/admin/auth/login', { method: 'POST', body: { email: adminEmail, password: adminPassword } });
    state.adminToken = adminLogin.data.accessToken;

    const customerAAccount = await registerCustomer(customerA);
    const customerBAccount = await registerCustomer(customerB);
    checks.customerCreation = true;

    const inspectorA = await createWorker(workerA);
    const inspectorB = await createWorker(workerB);
    await request('/worker/auth/login', {
        method: 'POST', expected: [401], body: { email: workerA.email, password: `${workerA.password}-wrong` },
    });
    checks.workerCreationAndLogin = true;

    const equipmentA = await createEquipment(customerAAccount.userId, 'A');
    const equipmentB = await createEquipment(customerBAccount.userId, 'B');
    checks.equipmentCreation = true;

    const healthyTask = await createTask({
        userId: customerAAccount.userId, equipmentId: equipmentA, workerId: inspectorA.workerId,
        title: 'SafeFire E2E Initial Healthy Inspection',
    });
    const refillTask = await createTask({
        userId: customerAAccount.userId, equipmentId: equipmentA, workerId: inspectorA.workerId,
        title: 'SafeFire E2E Monthly Fire Safety Inspection',
    });
    const isolatedTask = await createTask({
        userId: customerBAccount.userId, equipmentId: equipmentB, workerId: inspectorB.workerId,
        title: 'SafeFire E2E Worker B Isolation Inspection',
    });
    checks.taskAssignment = true;

    const aTasks = await request('/worker/tasks', { token: inspectorA.token });
    const aTaskIds = aTasks.data.tasks.map(idOf);
    assert(aTaskIds.includes(healthyTask) && aTaskIds.includes(refillTask), 'Worker A did not receive both assigned tasks.');
    assert(!aTaskIds.includes(isolatedTask), 'Worker A list exposed Worker B task.');
    const bTasks = await request('/worker/tasks', { token: inspectorB.token });
    assert(bTasks.data.tasks.map(idOf).includes(isolatedTask), 'Worker B did not receive assigned task.');
    assert(!bTasks.data.tasks.map(idOf).includes(refillTask), 'Worker B list exposed Worker A task.');
    const taskDetail = await request(`/worker/tasks/${refillTask}`, { token: inspectorA.token });
    assert(taskDetail.data.task.userId.name === customerA.name, 'Worker task customer was incorrect.');
    assert(idOf(taskDetail.data.task.equipmentIds[0]) === equipmentA, 'Worker task equipment was incorrect.');
    await request(`/worker/tasks/${isolatedTask}`, { token: inspectorA.token, expected: [403] });
    checks.workerTaskIsolation = true;

    for (const path of ['/admin/settings', '/admin/vendors', '/admin/orders', '/admin/fire-safety/workers']) {
        await request(path, { token: inspectorA.token, expected: [403] });
    }
    await request('/admin/fire-safety/tasks', { method: 'POST', token: inspectorA.token, body: {}, expected: [403] });
    await request('/admin/fire-safety/reports/000000000000000000000000/review', { method: 'PATCH', token: inspectorA.token, body: {}, expected: [403] });
    await request('/admin/fire-safety/issues/000000000000000000000000/notify', { method: 'POST', token: inspectorA.token, body: {}, expected: [403] });
    await request('/user/fire-safety/equipment', { token: inspectorA.token, expected: [403] });
    checks.workerRestrictedAuthorization = true;

    const healthy = await submitInspection({
        taskId: healthyTask, workerToken: inspectorA.token, equipmentId: equipmentA,
        condition: 'ok', observations: 'Pressure, seal, and body condition are normal.', notes: 'Equipment is working properly.',
    });
    assert(healthy.issuesFlagged === 0, 'Healthy equipment incorrectly generated an issue.');
    let issues = await request(`/admin/fire-safety/issues?equipmentId=${equipmentA}`, { token: state.adminToken });
    assert(issues.data.issues.length === 0, 'Healthy inspection created an issue record.');
    checks.healthyCondition = true;

    const refill = await submitInspection({
        taskId: refillTask, workerToken: inspectorA.token, equipmentId: equipmentA,
        condition: 'needs_refill', observations: 'Pressure is low and extinguisher requires refilling.',
        notes: 'Seal intact; refill is required before the equipment returns to service.',
    });
    assert(refill.issuesFlagged === 1, 'Needs-refill inspection did not flag exactly one issue.');
    checks.workerInspectionSubmission = true;

    const adminReport = await request(`/admin/fire-safety/reports/${refill.reportId}`, { token: state.adminToken });
    assert(adminReport.data.report.items[0].condition === 'needs_refill', 'Admin report condition was incorrect.');
    assert(adminReport.data.report.items[0].observations.includes('Pressure is low'), 'Admin report observation was missing.');
    await request(`/admin/fire-safety/reports/${refill.reportId}/review`, {
        method: 'PATCH', token: state.adminToken, body: { adminNotes: 'Verified refill requirement and approved customer alert.' },
    });
    checks.adminReview = true;

    issues = await request(`/admin/fire-safety/issues?equipmentId=${equipmentA}`, { token: state.adminToken });
    const issue = issues.data.issues.find((item) => idOf(item.reportId) === refill.reportId);
    assert(issue && issue.createdBy === 'system' && issue.customerVisible === false, 'Hidden system issue was not created correctly.');
    const issueId = idOf(issue);
    state.issues.push(issueId);

    const services = await request('/admin/services?status=ACTIVE&limit=20', { token: state.adminToken });
    const service = services.data.services?.find((item) => item.isActive !== false);
    assert(service, 'No active existing Service Master record is available for a recommendation.');
    const updatedIssue = await request(`/admin/fire-safety/issues/${issueId}`, {
        method: 'PATCH', token: state.adminToken,
        body: {
            title: 'Extinguisher requires refill',
            description: 'Low pressure detected. The extinguisher must be refilled before use.',
            severity: 'medium', status: 'open', customerVisible: false,
            recommendations: [{ kind: 'service', serviceId: idOf(service), note: 'Schedule the recommended refill service.' }],
        },
    });
    assert(updatedIssue.data.recommendations.length === 1, 'Admin recommendation was not stored.');
    checks.issueAndRecommendation = true;

    await request(`/admin/fire-safety/issues/${issueId}/notify`, {
        method: 'POST', token: state.adminToken,
        body: { message: 'Your fire extinguisher requires refilling. Please review your equipment status.' },
    });
    const customerANotifications = await request('/user/notifications?limit=50', { token: customerAAccount.token });
    const notification = customerANotifications.data.notifications.find((item) => String(item.data?.fireSafetyIssueId) === issueId);
    assert(notification, 'Fire Safety Alert was not delivered to Customer A.');
    state.notifications.push(idOf(notification));
    const expectedLink = `/my-fire-safety/${equipmentA}?issue=${issueId}`;
    assert(notification.data.link === expectedLink, `Notification deep link was incorrect: ${notification.data.link}`);
    const customerBNotifications = await request('/user/notifications?limit=50', { token: customerBAccount.token });
    assert(!customerBNotifications.data.notifications.some((item) => String(item.data?.fireSafetyIssueId) === issueId), 'Fire Safety Alert leaked to Customer B.');
    await request(`/user/notifications/${idOf(notification)}/read`, { method: 'PUT', token: customerAAccount.token });
    checks.notificationDeliveryAndDeepLink = true;

    const myEquipment = await request('/user/fire-safety/equipment', { token: customerAAccount.token });
    const customerEquipment = myEquipment.data.equipment.find((item) => idOf(item) === equipmentA);
    assert(customerEquipment?.currentStatus === 'needs_refill' && customerEquipment.openIssues === 1, 'My Fire Safety status/issue count was incorrect.');
    const detail = await request(`/user/fire-safety/equipment/${equipmentA}`, { token: customerAAccount.token });
    assert(detail.data.history.length === 2, 'Inspection history did not preserve both reports.');
    assert(detail.data.history[0].condition === 'needs_refill' && detail.data.history[1].condition === 'ok', 'Inspection history/current order was incorrect.');
    const visibleIssue = detail.data.issues.find((item) => idOf(item) === issueId);
    assert(visibleIssue?.recommendations?.[0]?.serviceId, 'Customer recommendation was not populated.');
    const issueDetail = await request(`/user/fire-safety/issues/${issueId}`, { token: customerAAccount.token });
    assert(issueDetail.data.title === 'Extinguisher requires refill', 'Customer issue details were incorrect.');
    checks.myFireSafety = true;

    await request(`/user/fire-safety/equipment/${equipmentA}`, { token: customerBAccount.token, expected: [404] });
    await request(`/user/fire-safety/issues/${issueId}`, { token: customerBAccount.token, expected: [404] });
    const customerBEquipment = await request('/user/fire-safety/equipment', { token: customerBAccount.token });
    assert(!customerBEquipment.data.equipment.some((item) => idOf(item) === equipmentA), 'Customer A equipment leaked into Customer B list.');
    checks.customerIsolation = true;

    const contacted = await request(`/user/fire-safety/issues/${issueId}/contact`, {
        method: 'POST', token: customerAAccount.token, expected: [201],
        body: { message: 'Please arrange the recommended extinguisher refill visit.' },
    });
    const ticketId = idOf(contacted.data.ticketId);
    state.supportTickets.push(ticketId);
    const adminTicket = await request(`/admin/support/tickets/${ticketId}`, { token: state.adminToken });
    assert(adminTicket.data?.subject?.includes('Fire Safety') || adminTicket.data?.ticket?.subject?.includes('Fire Safety'), 'Support ticket did not preserve fire-safety context.');
    checks.contactSafeFire = true;

    const equipmentHistory = await request(`/admin/fire-safety/equipment/${equipmentA}`, { token: state.adminToken });
    assert(equipmentHistory.data.history.length === 2, 'Admin equipment history did not preserve both reports.');
    checks.inspectionHistory = true;

    await request(`/admin/fire-safety/workers/${inspectorA.workerId}`, {
        method: 'PATCH', token: state.adminToken, body: { isActive: false },
    });
    await request('/worker/dashboard', { token: inspectorA.token, expected: [403] });
    checks.deactivatedWorkerDenied = true;
} catch (err) {
    failure = err;
} finally {
    try { cleanupResult = await cleanup(); } catch (cleanupError) {
        failure = failure || cleanupError;
    }
}

const result = {
    success: !failure,
    checks,
    testData: {
        workerA: { name: workerA.name, email: workerA.email, password: workerA.password },
        workerB: { name: workerB.name, email: workerB.email, password: workerB.password },
        customerA: { name: customerA.name, email: customerA.email, password: customerA.password },
        customerB: { name: customerB.name, email: customerB.email, password: customerB.password },
        equipmentIds: state.equipment,
        taskIds: state.tasks,
        reportIds: state.reports,
        issueIds: state.issues,
    },
    cleanup: cleanupResult,
    error: failure?.message || null,
};
console.log(JSON.stringify(result, null, 2));
if (failure) process.exitCode = 1;
