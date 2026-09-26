export interface RetrievalCase {
  id: string;
  query: string;
  // The article ids a good search returns. Empty means the question is out of scope, and the
  // right result is that nothing clears the minimum score.
  relevant: string[];
}

// Phrased the way employees describe problems, not like the article titles, so a match has
// to come from meaning. At least one question per article.
export const retrievalCases: RetrievalCase[] = [
  {
    id: "vpn-home",
    query: "I can't reach the intranet when I work from home",
    relevant: ["kb-vpn-remote-access"],
  },
  {
    id: "vpn-hotel",
    query: "the tunnel won't connect on the hotel wifi",
    relevant: ["kb-vpn-remote-access"],
  },
  {
    id: "printer-blank",
    query: "the printer spits out white sheets with nothing on them",
    relevant: ["kb-printer-blank-pages"],
  },
  {
    id: "printer-toner",
    query: "prints are really faint, is the ink running out?",
    relevant: ["kb-printer-blank-pages"],
  },
  {
    id: "password-forgot",
    query: "forgot my login and I'm locked out of my laptop",
    relevant: ["kb-password-reset"],
  },
  {
    id: "password-expiry",
    query: "I keep getting a message that my password expires soon",
    relevant: ["kb-password-reset"],
  },
  {
    id: "mfa-new-phone",
    query: "I got a new phone, how do I move the authenticator app?",
    relevant: ["kb-mfa-device-change"],
  },
  {
    id: "mfa-lost-phone",
    query: "lost my phone and can't approve sign in requests",
    relevant: ["kb-mfa-device-change"],
  },
  {
    id: "hardware-monitor",
    query: "how do I get a second screen for my desk?",
    relevant: ["kb-hardware-ordering"],
  },
  {
    id: "hardware-replace",
    query: "my laptop is old, when can I get a new one?",
    relevant: ["kb-hardware-ordering"],
  },
  {
    id: "meeting-hdmi",
    query: "the TV in the conference room says no input when I plug in",
    relevant: ["kb-meeting-room-display"],
  },
  {
    id: "outlook-stale",
    query: "emails show up on my phone but not on my computer",
    relevant: ["kb-outlook-sync"],
  },
  {
    id: "outlook-calendar",
    query: "meeting invites aren't appearing in my calendar in Outlook",
    relevant: ["kb-outlook-sync"],
  },
  {
    id: "teams-mic",
    query: "people in the call can't hear me",
    relevant: ["kb-teams-audio"],
  },
  {
    id: "teams-headset",
    query: "my bluetooth headset keeps cutting out in meetings",
    relevant: ["kb-teams-audio"],
  },
  {
    id: "laptop-slow",
    query: "my computer is super slow and freezes all the time",
    relevant: ["kb-laptop-performance"],
  },
  {
    id: "software-admin",
    query: "I need admin rights to install a program",
    relevant: ["kb-software-installation"],
  },
  {
    id: "software-tool",
    query: "can I get Visual Studio Code on my work machine?",
    relevant: ["kb-software-installation"],
  },
  {
    id: "wifi-office",
    query: "my laptop won't join the wireless at the office",
    relevant: ["kb-office-wifi"],
  },
  {
    id: "phishing-suspicious",
    query: "I got a weird email from the CEO asking me to buy gift cards",
    relevant: ["kb-phishing-report"],
  },
  {
    // Two articles are right here: report the message, and change the leaked password.
    id: "phishing-entered-password",
    query: "I clicked a link in a fake email and typed in my password",
    relevant: ["kb-phishing-report", "kb-password-reset"],
  },
  { id: "oos-flight", query: "how do I book a flight for a business trip?", relevant: [] },
  { id: "oos-salary", query: "when is salary paid this month?", relevant: [] },
  { id: "oos-lunch", query: "what's for lunch in the canteen today?", relevant: [] },
  { id: "oos-parking", query: "where can I park my car at the office?", relevant: [] },
  { id: "oos-vacation", query: "how many vacation days do I have left?", relevant: [] },
];
