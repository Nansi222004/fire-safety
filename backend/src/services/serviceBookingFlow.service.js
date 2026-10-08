import ApiError from '../utils/ApiError.js';
import ServiceCapacity from '../models/ServiceCapacity.model.js';

/**
 * Single source of truth for the customer service-booking flow:
 * category types (variants), quantity rules, pricing and schedule/slots.
 * Everything here is driven by admin config on Service and provider config on VendorService.
 */

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export const parseHHMM = (str) => {
    const m = String(str || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    const p = m[3] ? m[3].toUpperCase() : null;
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return h * 60 + mins;
};

const formatMinutes = (total) => {
    const h24 = Math.floor(total / 60) % 24;
    const m = total % 60;
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
};

/** IST calendar helpers (bookings are local to India). */
export const istNow = () => {
    const ist = new Date(Date.now() + IST_OFFSET_MS);
    return { dateStr: ist.toISOString().slice(0, 10), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
};
const addDays = (dateStr, n) => {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const dayOfWeek = (dateStr) => DAYS[new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()];

const mapGet = (map, key) => {
    if (!map) return undefined;
    if (typeof map.get === 'function') return map.get(key);
    return map[key];
};

// ─── Category types (variants) ──────────────────────────────────────────────

export const getActiveVariants = (service) =>
    (Array.isArray(service?.variants) ? service.variants : [])
        .filter((v) => v && v.isActive !== false && v.key)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

/** Price a provider charges for one unit of a variant (falls back to their base price). */
export const getVariantUnitPrice = (vendorService, variantKey) => {
    const variantPrice = Number(mapGet(vendorService?.variantPrices, variantKey));
    if (Number.isFinite(variantPrice) && variantPrice > 0) return variantPrice;
    return Number(vendorService?.price) || 0;
};

/** Customer-facing variant list for a provider (only admin-active variants). */
export const buildVariantOptions = (service, vendorService) =>
    getActiveVariants(service).map((v) => ({
        key: v.key,
        label: v.label,
        description: v.description || '',
        unitPrice: getVariantUnitPrice(vendorService, v.key),
    }));

/** Lowest price a customer could pay per unit with this provider. */
export const getStartingUnitPrice = (service, vendorService) => {
    const options = buildVariantOptions(service, vendorService);
    if (!options.length) return Number(vendorService?.price) || 0;
    return Math.min(...options.map((o) => o.unitPrice));
};

// ─── Quantity ───────────────────────────────────────────────────────────────

export const getQuantityRules = (service) => {
    const enabled = service?.serviceSettings?.requiresQuantity === true;
    const cfg = service?.quantityConfig || {};
    const min = Math.max(1, Number(cfg.min) || 1);
    const max = Math.max(min, Number(cfg.max) || 100);
    return {
        enabled,
        label: cfg.label || 'Quantity',
        unitLabel: cfg.unitLabel || 'unit',
        min: enabled ? min : 1,
        max: enabled ? max : 1,
    };
};

// ─── Pricing ────────────────────────────────────────────────────────────────

/**
 * Authoritative quote. Never trusts client-supplied prices.
 * @returns {{ variant, quantity, unitPrice, subtotal, visitCharge, taxRate, tax, total, ... }}
 */
export const computeServiceQuote = (service, vendorService, { variantKey, quantity } = {}) => {
    const variants = getActiveVariants(service);
    let variant = null;
    if (variants.length) {
        const key = String(variantKey || '').trim();
        if (!key) throw new ApiError(400, `Please select a ${(service.variantConfig?.label || 'category type').toLowerCase()}.`);
        const match = variants.find((v) => v.key === key);
        if (!match) throw new ApiError(400, 'Selected option is not available for this service.');
        variant = { key: match.key, label: match.label };
    }

    const rules = getQuantityRules(service);
    let qty = 1;
    if (rules.enabled) {
        qty = Number(quantity);
        if (!Number.isInteger(qty) || qty < rules.min || qty > rules.max) {
            throw new ApiError(400, `${rules.label} must be a whole number between ${rules.min} and ${rules.max}.`);
        }
    }

    const unitPrice = variant ? getVariantUnitPrice(vendorService, variant.key) : Number(vendorService?.price) || 0;
    const subtotal = round2(unitPrice * qty);
    const visitCharge = round2(service?.pricingConfig?.visitCharge || 0);
    const taxRate = Math.min(100, Math.max(0, Number(service?.pricingConfig?.taxRate) || 0));
    const tax = round2(((subtotal + visitCharge) * taxRate) / 100);
    const total = round2(subtotal + visitCharge + tax);

    return {
        variant: variant ? { ...variant, price: unitPrice } : null,
        quantity: qty,
        unitLabel: rules.unitLabel,
        unitPrice,
        subtotal,
        visitCharge,
        taxRate,
        tax,
        total,
        pricingType: service?.pricingType || 'FIXED',
        isEstimate: service?.pricingType === 'CUSTOM_QUOTE' || service?.serviceSettings?.requiresQuote === true,
        priceNote: service?.pricingConfig?.priceNote || '',
    };
};

// ─── Schedule & slots ───────────────────────────────────────────────────────

const getDayWindow = (vendorService, dateStr) => {
    const day = dayOfWeek(dateStr);
    const cfg = vendorService?.workingSchedule?.[day];
    if (cfg && cfg.enabled === false) return null;
    const start = parseHHMM(cfg?.start || vendorService?.workingHours?.start);
    const end = parseHHMM(cfg?.end || vendorService?.workingHours?.end);
    if (start === null || end === null || end <= start) return null;
    return { start, end };
};

/** Slots for one date; past/too-soon slots are excluded for today. */
export const buildSlotsForDate = (service, vendorService, dateStr, now = istNow()) => {
    const window = getDayWindow(vendorService, dateStr);
    if (!window) return [];
    const duration = Math.min(480, Math.max(15, Number(service?.bookingConfig?.slotDurationMinutes) || 60));
    const lead = Math.max(0, Number(service?.bookingConfig?.minLeadMinutes) || 0);
    const slots = [];
    for (let start = window.start; start + duration <= window.end; start += duration) {
        if (dateStr === now.dateStr && start <= now.minutes + lead) continue;
        slots.push({ start: formatMinutes(start), end: formatMinutes(start + duration), label: `${formatMinutes(start)} - ${formatMinutes(start + duration)}` });
    }
    return slots;
};

/** Bookable days (with slots and remaining capacity) within the admin booking window. */
export const buildSchedule = async (service, vendorService, { days } = {}) => {
    const now = istNow();
    const windowDays = Math.min(180, Math.max(1, Number(service?.bookingConfig?.advanceBookingDays) || 30));
    const count = Math.min(windowDays, Math.max(1, Number(days) || windowDays));
    const dates = Array.from({ length: count }, (_, i) => addDays(now.dateStr, i));

    const capacityDocs = await ServiceCapacity.find({ vendorServiceId: vendorService._id, dateStr: { $in: dates } })
        .select('dateStr bookedCount')
        .lean();
    const booked = Object.fromEntries(capacityDocs.map((c) => [c.dateStr, c.bookedCount || 0]));
    const dailyCapacity = Math.max(0, Number(vendorService.dailyCapacity) || 0);

    return dates.map((dateStr) => {
        const open = Boolean(getDayWindow(vendorService, dateStr));
        const slots = open ? buildSlotsForDate(service, vendorService, dateStr, now) : [];
        const remainingCapacity = Math.max(0, dailyCapacity - (booked[dateStr] || 0));
        let unavailableReason = null;
        if (!open) unavailableReason = 'Closed';
        else if (remainingCapacity === 0) unavailableReason = 'Fully booked';
        else if (!slots.length) unavailableReason = 'No slots left';
        return { date: dateStr, day: dayOfWeek(dateStr), slots: unavailableReason ? [] : slots, remainingCapacity, unavailableReason };
    });
};

/** Validates a requested date + slot against the provider's real schedule. */
export const assertBookableSlot = (service, vendorService, dateStr, timeSlot) => {
    const now = istNow();
    const windowDays = Math.min(180, Math.max(1, Number(service?.bookingConfig?.advanceBookingDays) || 30));
    if (dateStr < now.dateStr) throw new ApiError(400, 'Cannot book a service for a past date.');
    if (dateStr > addDays(now.dateStr, windowDays - 1)) {
        throw new ApiError(400, `Bookings can be made up to ${windowDays} day(s) in advance.`);
    }
    if (!getDayWindow(vendorService, dateStr)) {
        throw new ApiError(400, `Selected Service Provider is closed on ${dayOfWeek(dateStr).toUpperCase()}s. Please choose an open date.`);
    }
    const requestedStart = parseHHMM(timeSlot);
    const match = buildSlotsForDate(service, vendorService, dateStr, now).find((s) => parseHHMM(s.start) === requestedStart);
    if (!match) throw new ApiError(400, 'Selected time slot is not available. Please choose another slot.');
    return match;
};
