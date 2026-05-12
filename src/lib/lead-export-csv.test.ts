import { describe, it, expect } from 'vitest';
import { buildLeadHistoryCsv, escapeCsvCell } from './lead-export-csv';

describe('escapeCsvCell', () => {
  it('returns empty for null/undefined', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('passes simple strings through', () => {
    expect(escapeCsvCell('hello')).toBe('hello');
  });

  it('quotes commas, newlines, and quotes; doubles internal quotes', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('formats Date as ISO', () => {
    const d = new Date('2025-01-02T03:04:05.000Z');
    expect(escapeCsvCell(d)).toBe('2025-01-02T03:04:05.000Z');
  });

  it('serialises objects as JSON', () => {
    expect(escapeCsvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe('buildLeadHistoryCsv', () => {
  it('renders section header, columns, and rows', () => {
    const csv = buildLeadHistoryCsv([
      {
        name: 'Profile',
        columns: ['id', 'name'],
        rows: [{ id: '1', name: 'Sarb' }],
      },
    ]);
    expect(csv).toContain('## Profile');
    expect(csv).toContain('id,name');
    expect(csv).toContain('1,Sarb');
  });

  it('emits "(no rows)" placeholder for empty rows', () => {
    const csv = buildLeadHistoryCsv([
      { name: 'Notes', columns: ['body'], rows: [] },
    ]);
    expect(csv).toContain('## Notes');
    expect(csv).toContain('body');
    expect(csv).toContain('(no rows)');
  });

  it('blank lines separate multiple sections', () => {
    const csv = buildLeadHistoryCsv([
      { name: 'A', columns: ['x'], rows: [{ x: 1 }] },
      { name: 'B', columns: ['y'], rows: [{ y: 2 }] },
    ]);
    const lines = csv.split('\n');
    const aIdx = lines.indexOf('## A');
    const bIdx = lines.indexOf('## B');
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThan(aIdx);
    // blank line directly before B
    expect(lines[bIdx - 1]).toBe('');
  });

  it('handles missing keys per row as empty cells', () => {
    const csv = buildLeadHistoryCsv([
      {
        name: 'Mixed',
        columns: ['a', 'b', 'c'],
        rows: [{ a: 'x', c: 'z' }],
      },
    ]);
    expect(csv).toMatch(/^## Mixed\na,b,c\nx,,z\n$/);
  });

  it('escapes embedded commas in row values', () => {
    const csv = buildLeadHistoryCsv([
      {
        name: 'X',
        columns: ['note'],
        rows: [{ note: 'hello, world' }],
      },
    ]);
    expect(csv).toContain('"hello, world"');
  });
});
