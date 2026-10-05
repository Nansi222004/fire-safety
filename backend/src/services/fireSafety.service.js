import crypto from 'crypto';
import ApiError from '../utils/ApiError.js';

// Shared helpers for the Fire Safety Inspection module.

export const generateFireSafetyNumber = (prefix) =>
    `${prefix}-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

export const CONDITION_LABELS = {
    not_inspected: 'Not inspected yet',
    ok: 'Working properly',
    needs_refill: 'Needs refill',
    needs_maintenance: 'Needs maintenance',
    not_working: 'Not working',
    damaged: 'Damaged',
    needs_replacement: 'Needs replacement',
};

// System suggestion only — Admin reviews/edits the issue and chooses any recommendation.
export const SUGGESTED_ISSUE = {
    needs_refill: { title: 'Requires refill', severity: 'medium' },
    needs_maintenance: { title: 'Requires maintenance', severity: 'medium' },
    not_working: { title: 'Not working — requires maintenance or replacement', severity: 'high' },
    damaged: { title: 'Damaged — requires repair or replacement', severity: 'high' },
    needs_replacement: { title: 'Requires replacement', severity: 'high' },
};

export const toDateOrNull = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, `Invalid date: ${value}`);
    return d;
};

export const sanitizeLocation = (raw = {}) => ({
    label: String(raw.label || '').trim().slice(0, 150),
    address: String(raw.address || '').trim().slice(0, 300),
    city: String(raw.city || '').trim().slice(0, 100),
    state: String(raw.state || '').trim().slice(0, 100),
    zipCode: String(raw.zipCode || '').trim().slice(0, 20),
});

export const formatLocation = (loc = {}) =>
    [loc.label, loc.address, loc.city, loc.state, loc.zipCode].filter(Boolean).join(', ');

export const isObjectId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ''));

export const assertObjectId = (value, label = 'id') => {
    if (!isObjectId(value)) throw new ApiError(400, `Invalid ${label}.`);
};
