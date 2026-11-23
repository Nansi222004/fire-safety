/**
 * Top-level order status rolled up from its vendor packages (vendorItems[].status).
 * Shared by the vendor order controller, Seller Delivery and the Shiprocket fallback so every path
 * derives the order status the same way.
 */
export const deriveTopLevelOrderStatus = (vendorItems = [], fallback = 'pending') => {
    const statuses = (vendorItems || [])
        .map((item) => String(item?.status || '').toLowerCase())
        .filter(Boolean);

    if (!statuses.length) return String(fallback || 'pending').toLowerCase();

    if (statuses.every((s) => s === 'cancelled')) return 'cancelled';
    if (statuses.every((s) => s === 'delivered')) return 'delivered';

    const nonCancelled = statuses.filter((s) => s !== 'cancelled');
    if (nonCancelled.length > 0 && nonCancelled.every((s) => s === 'delivered')) {
        return 'partially_delivered';
    }

    if (statuses.includes('shipped')) return 'shipped';
    if (statuses.includes('ready_for_pickup')) return 'ready_for_pickup';
    if (statuses.includes('processing')) return 'processing';
    if (statuses.includes('pending')) return 'pending';
    if (statuses.includes('cancelled')) return 'partially_cancelled';

    return String(fallback || 'pending').toLowerCase();
};

export default deriveTopLevelOrderStatus;
