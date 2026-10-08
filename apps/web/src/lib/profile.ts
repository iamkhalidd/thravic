// The profile rules, mirrored from the API (apps/api/app/profile.py) so forms
// can explain a problem before submitting. The API's check is the one that counts.

import { COUNTRY_CODES } from './countries';

export const MINIMUM_AGE = 18;
export const UNDERAGE_MESSAGE = 'You must be 18 or older to use Thravic.';

/** Whole years between a YYYY-MM-DD birth date and `today` (UTC). */
export function ageOn(born: string, today: Date = new Date()): number {
    const [y, m, d] = born.split('-').map(Number);
    const ty = today.getUTCFullYear(), tm = today.getUTCMonth() + 1, td = today.getUTCDate();
    return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/** The latest birth date that is 18 today, for the date input's `max`. */
export function latestAdultBirthDate(today: Date = new Date()): string {
    const y = today.getUTCFullYear() - MINIMUM_AGE;
    const m = String(today.getUTCMonth() + 1).padStart(2, '0');
    const d = String(today.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function dateOfBirthError(value: string, today: Date = new Date()): string | null {
    if (!value) return 'Enter your date of birth';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return 'Enter a valid date of birth';
    const age = ageOn(value, today);
    if (age < 0 || age > 120) return 'Enter a valid date of birth';
    if (age < MINIMUM_AGE) return UNDERAGE_MESSAGE;
    return null;
}

/** "+234 803 123 4567" -> "+2348031234567"; null if it isn't international. */
export function normalizePhone(value: string): string | null {
    let phone = value.trim().replace(/[\s\-().]/g, '');
    if (phone.startsWith('00')) phone = '+' + phone.slice(2);
    return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function phoneError(value: string): string | null {
    if (!value.trim()) return 'Enter your phone number';
    return normalizePhone(value) ? null : 'Include your country code, e.g. +234 803 123 4567';
}

export function countryError(value: string): string | null {
    return COUNTRY_CODES.includes(value) ? null : 'Choose your country';
}

export function websiteError(value: string): string | null {
    if (!value.trim()) return null;
    return /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(value.trim()) ? null : 'Enter a full address starting with https://';
}
