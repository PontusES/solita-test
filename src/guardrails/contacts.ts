export interface Contact {
  kind: "email" | "url" | "phone";
  raw: string;
  // Comparable form: lower case, no trailing slash, phone numbers as digits only.
  normalized: string;
}

export const CONTACT_REMOVED = "[contact removed]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL = /https?:\/\/[^\s<>()"'`\]]+/g;
const PHONE = /\+?\d[\d ().-]{6,}\d/g;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Fewer digits than this are more likely extensions, times or counts than phone numbers.
const MIN_PHONE_DIGITS = 8;

function normalizeUrl(url: string): string {
  return url.replace(TRAILING_PUNCTUATION, "").replace(/\/+$/, "").toLowerCase();
}

export function extractContacts(text: string): Contact[] {
  const contacts: Contact[] = [];
  for (const match of text.match(URL) ?? []) {
    const raw = match.replace(TRAILING_PUNCTUATION, "");
    contacts.push({ kind: "url", raw, normalized: normalizeUrl(raw) });
  }
  // Scan for emails and phone numbers only outside URLs, so digits in a link are not a "phone".
  const withoutUrls = text.replace(URL, " ");
  for (const raw of withoutUrls.match(EMAIL) ?? []) {
    contacts.push({ kind: "email", raw, normalized: raw.toLowerCase() });
  }
  const withoutEmails = withoutUrls.replace(EMAIL, " ");
  for (const match of withoutEmails.match(PHONE) ?? []) {
    const raw = match.trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= MIN_PHONE_DIGITS && !ISO_DATE.test(raw)) {
      contacts.push({ kind: "phone", raw, normalized: digits });
    }
  }
  return contacts;
}

// A contact is grounded if it appears in what the model was given: tool results or the user's
// own message. Anything else was made up, and a made up phone number sends people nowhere.
export function removeUngroundedContacts(
  answer: string,
  sources: string[],
): { text: string; removed: Contact[] } {
  const known = new Set(sources.flatMap(extractContacts).map((contact) => contact.normalized));
  const removed = extractContacts(answer).filter((contact) => !known.has(contact.normalized));

  let text = answer;
  for (const contact of removed) {
    text = text.split(contact.raw).join(CONTACT_REMOVED);
  }
  return { text, removed };
}
