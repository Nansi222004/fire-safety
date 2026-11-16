// One definition of a vendor's sales figures, shared by the admin and vendor panels so they show the same
// numbers. It matches the backend vendor analytics (vendor/controllers/analytics.controller.js).

// Orders that never produced (or no longer hold) customer money.
export const NON_REVENUE_ORDER_STATUSES = ["cancelled", "payment_pending", "payment_failed", "returned"];

export const isRevenueOrder = (order) =>
  !NON_REVENUE_ORDER_STATUSES.includes(String(order?.status || "").toLowerCase());

// Vendor's net product sales for one package: item total after the coupon share, excluding GST and shipping.
export const getVendorNetSales = (vendorItem) => {
  if (!vendorItem || String(vendorItem.status || "").toLowerCase() === "cancelled") return 0;
  return Math.max(0, Number(vendorItem.subtotal || 0) - Number(vendorItem.discount || 0));
};

// What the vendor earns from one package (after commission; includes the GST they remit).
export const getVendorPackageEarnings = (vendorItem) => {
  if (!vendorItem || String(vendorItem.status || "").toLowerCase() === "cancelled") return 0;
  return Number(vendorItem.vendorEarnings || 0);
};

/**
 * Admin vendor APIs return `commissionRate` as the EFFECTIVE rate (fraction 0–1): the vendor's own rate, else the
 * platform default, else null when neither is configured (approved rule 2). Never shown as a made-up 0% or 10%.
 */
export const formatCommissionRate = (fraction, source) => {
  if (fraction === undefined || fraction === null || fraction === "" || !Number.isFinite(Number(fraction))) {
    return "Not configured";
  }
  const pct = `${(Number(fraction) * 100).toFixed(1)}%`;
  return source === "platform_default" ? `${pct} (default)` : pct;
};

/** Effective rate as a percent string for an edit input; "" when not configured. */
export const commissionRateInputValue = (fraction) =>
  fraction === undefined || fraction === null || fraction === "" || !Number.isFinite(Number(fraction))
    ? ""
    : (Number(fraction) * 100).toFixed(1);
