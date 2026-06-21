import { describe, it, expect } from 'vitest';
import { missingClause } from './deliberation';

describe('missingClause', () => {
	it('returns an empty string when every MAGI responded', () => {
		expect(missingClause([], 'query')).toBe('');
	});

	it('uses singular wording and the context noun for a single absence', () => {
		const clause = missingClause(['MELCHIOR'], 'debate');
		expect(clause).toContain('Unavailable for this debate: MELCHIOR.');
		expect(clause).toContain('this absence');
		expect(clause).toContain('a perspective');
		expect(clause).not.toContain('these absences');
	});

	it('uses plural wording and joins the labels for multiple absences', () => {
		const clause = missingClause(['MELCHIOR', 'BALTHASAR'], 'query');
		expect(clause).toContain('Unavailable for this query: MELCHIOR, BALTHASAR.');
		expect(clause).toContain('these absences');
		expect(clause).toContain('perspectives');
	});
});
