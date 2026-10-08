import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES, countryOptions } from '../countries';
import { ageOn, countryError, dateOfBirthError, latestAdultBirthDate, normalizePhone, phoneError, UNDERAGE_MESSAGE, websiteError } from '../profile';

const TODAY = new Date('2026-10-08T12:00:00Z');

describe('date of birth', () => {
    it('is 18 on the birthday, not the day before', () => {
        expect(dateOfBirthError('2008-10-08', TODAY)).toBeNull();
        expect(dateOfBirthError('2008-10-09', TODAY)).toBe(UNDERAGE_MESSAGE);
    });

    it('treats a leap-day birthday as reached on March 1st', () => {
        expect(ageOn('2008-02-29', new Date('2026-02-28T12:00:00Z'))).toBe(17);
        expect(ageOn('2008-02-29', new Date('2026-03-01T12:00:00Z'))).toBe(18);
    });

    it('refuses empty, malformed and impossible dates', () => {
        expect(dateOfBirthError('', TODAY)).toBe('Enter your date of birth');
        expect(dateOfBirthError('08/10/1990', TODAY)).toBe('Enter a valid date of birth');
        expect(dateOfBirthError('2030-01-01', TODAY)).toBe('Enter a valid date of birth');
        expect(dateOfBirthError('1890-01-01', TODAY)).toBe('Enter a valid date of birth');
    });

    it('caps the date picker at the latest adult birth date', () => {
        expect(latestAdultBirthDate(TODAY)).toBe('2008-10-08');
    });
});

describe('phone', () => {
    it.each([
        ['+234 803 123 4567', '+2348031234567'],
        ['+1 (415) 555-0100', '+14155550100'],
        ['00447911123456', '+447911123456'],
    ])('%s -> %s', (raw, stored) => {
        expect(normalizePhone(raw)).toBe(stored);
    });

    it('needs a country code', () => {
        expect(phoneError('0803 123 4567')).toContain('country code');
        expect(phoneError('')).toBe('Enter your phone number');
    });
});

describe('country and website', () => {
    it('lists the same 249 ISO codes as the API, with names', () => {
        expect(COUNTRY_CODES).toHaveLength(249);
        expect(countryOptions('en').find(c => c.code === 'NG')?.name).toBe('Nigeria');
        expect(countryError('NG')).toBeNull();
        expect(countryError('Nigeria')).toBe('Choose your country');
    });

    it('accepts an empty website or a full address only', () => {
        expect(websiteError('')).toBeNull();
        expect(websiteError('https://example.com')).toBeNull();
        expect(websiteError('example.com')).not.toBeNull();
    });
});
