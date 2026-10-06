import assert from 'node:assert/strict';
import { getAdminNotificationDestination } from '../notificationNavigation.js';

assert.equal(
  getAdminNotificationDestination({
    title: 'New Service Partner Application',
    data: { applicationId: 'service-app-123', vendorId: 'vendor-123' },
  }),
  '/admin/vendors/service-partner-applications?applicationId=service-app-123'
);

assert.equal(
  getAdminNotificationDestination({ title: 'New Service Partner Application' }),
  '/admin/vendors/service-partner-applications'
);

assert.equal(
  getAdminNotificationDestination({ title: 'Withdrawal requested', data: { withdrawalId: 'w-1' } }),
  '/admin/delivery/payout-requests'
);

assert.equal(getAdminNotificationDestination({ title: 'General update' }), null);

console.log('Admin notification navigation tests passed.');
