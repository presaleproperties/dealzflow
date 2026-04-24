const CRM_MULTI_VALUE_DELIMITER_REGEX = /\s+[-–—]\s+|[|/,;\n\r]+/;

function dedupeCaseInsensitive(values: string[]) {
  return Array.from(new Map(values.map(value => [value.toLowerCase(), value])).values());
}

export function splitCrmMultiValue(value: string): string[] {
  return dedupeCaseInsensitive(
    value
      .split(CRM_MULTI_VALUE_DELIMITER_REGEX)
      .map(item => item.trim().replace(/^['"]+|['"]+$/g, ''))
      .filter(Boolean)
  );
}

export function normalizeCrmMultiValueList(values: unknown): string[] {
  if (Array.isArray(values)) {
    return dedupeCaseInsensitive(values.flatMap(value => splitCrmMultiValue(String(value ?? ''))));
  }

  if (typeof values === 'string') {
    return splitCrmMultiValue(values);
  }

  return [];
}

export function normalizeCrmContactArrays<T extends { tags?: unknown; projects?: unknown }>(contact: T) {
  return {
    ...contact,
    tags: normalizeCrmMultiValueList(contact.tags),
    projects: normalizeCrmMultiValueList(contact.projects),
  };
}
