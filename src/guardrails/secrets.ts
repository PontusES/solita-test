export const REDACTED = "[REDACTED]";

// Employees often paste credentials when asking for help. These patterns are deliberately
// narrow: a false positive only hides a harmless word, a false negative sends a secret to a
// third party and into logs.
const SECRET_PATTERNS: RegExp[] = [
  // "password: x", "password is x", "pwd=x"; the keyword itself is kept, only the value is hidden.
  /\b((?:password|passwd|pwd|passcode|pin)\b(?:\s+is|\s*[:=])\s*)(\S+)/gi,
  // "api key: x", "token = x", "secret: x"
  /\b((?:api[ _-]?key|access[ _-]?token|token|secret)\b(?:\s+is|\s*[:=])\s*)(\S+)/gi,
];

// Well known key formats that are recognisable without a keyword in front.
const KEY_FORMATS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // OpenAI style keys
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, // GitHub tokens
];

// 13 to 19 digits, optionally grouped with spaces or dashes, like a payment card number.
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;

// The Luhn checksum every payment card number satisfies. It keeps long ticket or order
// numbers from being redacted by mistake.
function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function redactSecrets(text: string): { text: string; redacted: boolean } {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (_match, prefix: string) => `${prefix}${REDACTED}`);
  }
  for (const pattern of KEY_FORMATS) {
    result = result.replace(pattern, REDACTED);
  }
  result = result.replace(CARD_CANDIDATE, (match) =>
    passesLuhn(match.replace(/\D/g, "")) ? REDACTED : match,
  );
  return { text: result, redacted: result !== text };
}
