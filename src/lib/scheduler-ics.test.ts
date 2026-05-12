import { describe, it, expect } from 'vitest';
import { buildIcs, googleCalendarUrl, type IcsEvent } from './scheduler-ics';

const base: IcsEvent = {
  uid: 'abc-123',
  title: 'Discovery Call',
  startIso: '2025-06-10T17:00:00.000Z',
  endIso: '2025-06-10T17:30:00.000Z',
};

describe('buildIcs', () => {
  it('produces a valid VCALENDAR with required RFC 5545 fields', () => {
    const ics = buildIcs(base);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:abc-123@dealzflow.ca');
    expect(ics).toContain('DTSTART:20250610T170000Z');
    expect(ics).toContain('DTEND:20250610T173000Z');
    expect(ics).toContain('SUMMARY:Discovery Call');
    expect(ics).toMatch(/END:VEVENT\r\nEND:VCALENDAR$/);
  });

  it('uses CRLF line endings as required by RFC 5545', () => {
    const ics = buildIcs(base);
    expect(ics.split('\r\n').length).toBeGreaterThan(8);
    expect(ics).not.toMatch(/[^\r]\n/); // no bare LFs
  });

  it('escapes commas, semicolons, backslashes and newlines in text fields', () => {
    const ics = buildIcs({
      ...base,
      title: 'Tour, Phase 1; with notes\\backslash\nnewline',
      description: 'Bring; ID, please\nThanks',
      location: '123 Main St, Suite #4',
    });
    expect(ics).toContain('SUMMARY:Tour\\, Phase 1\\; with notes\\\\backslash\\nnewline');
    expect(ics).toContain('DESCRIPTION:Bring\\; ID\\, please\\nThanks');
    expect(ics).toContain('LOCATION:123 Main St\\, Suite #4');
  });

  it('omits optional fields when not provided', () => {
    const ics = buildIcs(base);
    expect(ics).not.toContain('DESCRIPTION:');
    expect(ics).not.toContain('LOCATION:');
    expect(ics).not.toContain('ORGANIZER');
  });

  it('emits ORGANIZER with CN when organizer email is provided', () => {
    const ics = buildIcs({
      ...base,
      organizerName: 'Sarb Sandhu',
      organizerEmail: 'sarb@presaleproperties.com',
    });
    expect(ics).toContain('ORGANIZER;CN=Sarb Sandhu:mailto:sarb@presaleproperties.com');
  });

  it('falls back to email as CN when organizer name is missing', () => {
    const ics = buildIcs({ ...base, organizerEmail: 'agent@example.com' });
    expect(ics).toContain('ORGANIZER;CN=agent@example.com:mailto:agent@example.com');
  });
});

describe('googleCalendarUrl', () => {
  it('builds a TEMPLATE url with compact UTC date range', () => {
    const url = googleCalendarUrl(base);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE');
    expect(parsed.searchParams.get('text')).toBe('Discovery Call');
    expect(parsed.searchParams.get('dates')).toBe('20250610T170000Z/20250610T173000Z');
  });

  it('encodes title, location and description into the query string', () => {
    const url = googleCalendarUrl({
      ...base,
      title: 'Tour & Sign',
      location: '123 Main St, Suite #4',
      description: 'Bring ID + deposit',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('text')).toBe('Tour & Sign');
    expect(parsed.searchParams.get('location')).toBe('123 Main St, Suite #4');
    expect(parsed.searchParams.get('details')).toBe('Bring ID + deposit');
    // raw URL must percent-encode the `&` and `#`
    expect(url).toContain('Tour+%26+Sign');
    expect(url).toContain('%23');
  });

  it('emits empty details/location params when not supplied', () => {
    const parsed = new URL(googleCalendarUrl(base));
    expect(parsed.searchParams.get('details')).toBe('');
    expect(parsed.searchParams.get('location')).toBe('');
  });
});
