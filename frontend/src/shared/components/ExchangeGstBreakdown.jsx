// Shows the GST breakdown of an exchange price difference exactly as the backend saved it
// (calculateExchangeDifference, approved rule 1). Nothing is recalculated here; requests created before the
// breakdown was saved simply show nothing extra.
const SUPPLY_LABEL = {
  intra_state: (s, fmt) => `CGST ${fmt(s.cgst)} + SGST ${fmt(s.sgst)}`,
  inter_state: (s, fmt) => `IGST ${fmt(s.igst)}`,
};

const ExchangeGstBreakdown = ({ exchangeDetails, format }) => {
  const d = exchangeDetails || {};
  if (d.originalAmount == null || d.replacementAmount == null) return null;
  const split = d.gstSplit && SUPPLY_LABEL[d.gstSplit.supplyType];
  return (
    <div className="mt-2 text-xs text-gray-600 space-y-0.5">
      <p>Original items (incl. GST): {format(d.originalAmount)}</p>
      <p>Replacement (incl. GST): {format(d.replacementAmount)}</p>
      <p>
        Difference: {format(d.taxableDifference || 0)} taxable + {format(d.taxDifference || 0)} GST
        {split ? ` (${split(d.gstSplit, format)})` : ''}
      </p>
    </div>
  );
};

export default ExchangeGstBreakdown;
