// Customer-facing names for payment method codes (used in error messages).
const LABELS = {
    cod: 'Cash on Delivery',
    cash: 'Cash on Delivery',
    card: 'Card payment',
    razorpay: 'Online payment',
    upi: 'UPI',
    online: 'Online payment',
    wallet: 'SafeFire Wallet',
    bank: 'Bank transfer',
};

export const describePaymentMethod = (method) => {
    const key = String(method || '').trim().toLowerCase();
    return LABELS[key] || (key ? `Payment method "${key}"` : 'The selected payment method');
};

export default describePaymentMethod;
