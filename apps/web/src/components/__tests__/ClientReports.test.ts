import { describe, it, expect } from 'vitest';
import { monthName, parseRecipients } from '../agency/ClientReports';

describe('parseRecipients', () => {
    it('splits on commas, semicolons and new lines, drops blanks and duplicates', () => {
        expect(parseRecipients('A@x.com, b@y.com;\n a@x.com ,, ')).toEqual(['a@x.com', 'b@y.com']);
    });

    it('returns nothing for empty text', () => {
        expect(parseRecipients('  ')).toEqual([]);
    });
});

describe('monthName', () => {
    it('names the month in full', () => {
        expect(monthName('2026-09')).toMatch(/September|Sept/);
        expect(monthName('2026-09')).toContain('2026');
    });

    it('leaves a bad key as it is', () => {
        expect(monthName('oops')).toBe('oops');
    });
});
