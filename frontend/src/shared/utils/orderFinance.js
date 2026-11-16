// One price breakdown for displaying an order (customer order page, admin order page, admin invoice), built
// from the item snapshots saved at checkout, so the lines always add up to the amount actually charged:
//   subtotal − discount + taxAdded + shipping + rounding = total
// - taxAdded is GST charged on top of tax-exclusive prices; GST already inside tax-inclusive prices is reported
//   separately (taxIncludedInPrice) and not added again.
// - Older orders stored a discounted subtotal; the item snapshots give the real pre-discount subtotal.
// - rounding is the COD rupee rounding (or any legacy difference), shown so nothing is silently unexplained.
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export const getOrderPriceBreakdown = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const hasSnapshots = items.length > 0 && items.every((i) => i?.lineSubtotal != null && i?.taxAmount != null);

  const subtotal = hasSnapshots
    ? round2(items.reduce((s, i) => s + Number(i.lineSubtotal || 0), 0))
    : round2(order?.subtotal);
  const discount = round2(order?.couponDiscount ?? order?.discount ?? 0);
  const shipping = round2(order?.shipping);
  const taxAdded = hasSnapshots
    ? round2(items.reduce((s, i) => s + (i.taxIncluded ? 0 : Number(i.taxAmount || 0)), 0))
    : round2(order?.tax);
  const taxIncludedInPrice = hasSnapshots
    ? round2(items.reduce((s, i) => s + (i.taxIncluded ? Number(i.taxAmount || 0) : 0), 0))
    : 0;
  const total = round2(order?.total);
  const rounding = round2(total - (subtotal - discount + taxAdded + shipping));

  return { subtotal, discount, shipping, taxAdded, taxIncludedInPrice, rounding: Math.abs(rounding) >= 0.01 ? rounding : 0, total };
};
