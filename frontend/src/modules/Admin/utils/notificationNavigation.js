// Central Admin notification destination resolver. Keep navigation based on
// backend-owned IDs where available; title checks support older notifications.
export const getAdminNotificationDestination = (notification = {}) => {
  const data = notification.data || {};
  const title = String(notification.title || '').toLowerCase();
  const applicationId = notification.applicationId || data.applicationId;
  const orderId = notification.orderId || data.orderId;
  const withdrawalId = notification.withdrawalId || data.withdrawalId;
  const deliveryBoyId = notification.deliveryBoyId || data.deliveryBoyId;

  if (applicationId || title.includes('service partner application')) {
    const query = applicationId
      ? `?applicationId=${encodeURIComponent(String(applicationId))}`
      : '';
    return `/admin/vendors/service-partner-applications${query}`;
  }
  if (withdrawalId || title.includes('payout') || title.includes('withdrawal')) {
    return '/admin/delivery/payout-requests';
  }
  if (orderId) return '/admin/orders';
  if (deliveryBoyId || title.includes('delivery') || title.includes('driver')) {
    return '/admin/delivery/delivery-boys';
  }
  return null;
};
