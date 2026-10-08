const CHANNELS = [
  { value: 'b2c', label: 'B2C', description: 'Retail customers' },
  { value: 'b2b', label: 'B2B', description: 'Wholesale buyers' },
  { value: 'both', label: 'B2C + B2B', description: 'Both sales channels' },
];

const ProductSalesChannels = ({
  formData,
  setFormData,
  canSellB2c,
  canUseWholesale,
  fieldErrors = {},
}) => {
  const channel = formData.salesChannel || 'b2c';
  const showWholesaleFields = channel === 'b2b' || channel === 'both';

  const selectChannel = (nextChannel) => {
    const needsB2c = nextChannel === 'b2c' || nextChannel === 'both';
    const needsWholesale = nextChannel === 'b2b' || nextChannel === 'both';
    if ((needsB2c && !canSellB2c) || (needsWholesale && !canUseWholesale)) return;
    setFormData((previous) => ({
      ...previous,
      salesChannel: nextChannel,
      b2cAvailable: needsB2c,
      wholesale: {
        ...(previous.wholesale || {}),
        enabled: needsWholesale,
      },
    }));
  };

  const updateWholesale = (field) => (event) => {
    const value = event.target.value;
    setFormData((previous) => ({
      ...previous,
      wholesale: { ...(previous.wholesale || {}), [field]: value },
    }));
  };

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3 sm:p-4 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-800">Sales Channel</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          This remains one product with shared inventory, media, category and metadata.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {CHANNELS.map((option) => {
          const needsB2c = option.value === 'b2c' || option.value === 'both';
          const needsWholesale = option.value === 'b2b' || option.value === 'both';
          const disabled = (needsB2c && !canSellB2c) || (needsWholesale && !canUseWholesale);
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => selectChannel(option.value)}
              className={`text-left rounded-xl border px-3 py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                channel === option.value
                  ? 'border-sky-500 bg-white text-sky-800 shadow-sm'
                  : 'border-slate-200 bg-white/70 text-slate-600 hover:border-sky-300'
              }`}
            >
              <span className="block text-sm font-bold">{option.label}</span>
              <span className="block text-[11px] mt-0.5">{option.description}</span>
            </button>
          );
        })}
      </div>

      {!canUseWholesale && (
        <p className="text-xs text-slate-500">
          B2B channels require an approved Wholesale/B2B vendor capability.
        </p>
      )}

      {showWholesaleFields && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Wholesale Price (₹) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={formData.wholesale?.price ?? ''}
              onChange={updateWholesale('price')}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${
                fieldErrors['wholesale.price']
                  ? 'border-red-500 bg-red-50 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-sky-500'
              }`}
              placeholder="0.00"
            />
            {fieldErrors['wholesale.price'] && (
              <p className="mt-1 text-xs text-red-600 font-medium">{fieldErrors['wholesale.price']}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Minimum Order Quantity (MOQ) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={formData.wholesale?.moq ?? ''}
              onChange={updateWholesale('moq')}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${
                fieldErrors['wholesale.moq']
                  ? 'border-red-500 bg-red-50 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-sky-500'
              }`}
              placeholder="1"
            />
            {fieldErrors['wholesale.moq'] && (
              <p className="mt-1 text-xs text-red-600 font-medium">{fieldErrors['wholesale.moq']}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductSalesChannels;
