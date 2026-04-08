/** Email typo detection and suggestion utility */

const DOMAIN_CORRECTIONS: Record<string, string> = {
  // Gmail typos
  'gmail.con': 'gmail.com',
  'gmail.vom': 'gmail.com',
  'gmail.clm': 'gmail.com',
  'gmail.c.om': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'gmail.coom': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmsil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gail.com': 'gmail.com',
  'gamail.com': 'gmail.com',
  'gemail.com': 'gmail.com',
  'gimail.com': 'gmail.com',
  // Hotmail typos
  'hotmail.comm': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmale.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  // Yahoo typos
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.comm': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  'yaoo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  // Outlook typos
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.comm': 'outlook.com',
  'outlookk.com': 'outlook.com',
  'outloook.com': 'outlook.com',
  // iCloud typos
  'icloud.con': 'icloud.com',
  'icloud.comm': 'icloud.com',
  'iclod.com': 'icloud.com',
};

export interface EmailValidation {
  isValid: boolean;
  suggestion: string | null;
  correctedEmail: string | null;
}

export function validateEmail(email: string): EmailValidation {
  const trimmed = email.trim().toLowerCase();

  if (!trimmed) return { isValid: true, suggestion: null, correctedEmail: null };

  // Basic format check
  const hasAt = trimmed.includes('@');
  const parts = trimmed.split('@');
  const domainHasDot = parts.length === 2 && parts[1].includes('.');

  if (!hasAt || !domainHasDot) {
    return { isValid: false, suggestion: null, correctedEmail: null };
  }

  // Check domain against known typos
  const domain = parts[1];
  const correctedDomain = DOMAIN_CORRECTIONS[domain];

  if (correctedDomain) {
    const correctedEmail = `${parts[0]}@${correctedDomain}`;
    return {
      isValid: true,
      suggestion: `Did you mean ${correctedDomain}?`,
      correctedEmail,
    };
  }

  return { isValid: true, suggestion: null, correctedEmail: null };
}
