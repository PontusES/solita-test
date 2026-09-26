export interface Article {
  id: string;
  title: string;
  content: string;
}

// Written like internal wiki pages. The wording deliberately differs from how employees
// usually describe their problems, so matching has to happen on meaning, not keywords.
export const articles: Article[] = [
  {
    id: "kb-vpn-remote-access",
    title: "VPN and remote access troubleshooting",
    content:
      "Internal systems are only reachable through the corporate VPN when you work outside the office. " +
      "If the GlobalConnect client fails to establish a tunnel, first confirm that your home internet connection works by opening a public website. " +
      "Then sign out of the client, quit it completely and start it again. " +
      "Make sure the gateway is set to vpn.corp.example.com. " +
      "Hotel and cafe networks sometimes block VPN traffic; switching to a phone hotspot is a quick way to test this. " +
      "Certificate errors usually mean the laptop has not synced with the domain for a while and must be connected in the office once.",
  },
  {
    id: "kb-printer-blank-pages",
    title: "Printer output is empty or faded",
    content:
      "When a network printer feeds paper but the sheets come out without any print, the cause is almost always the toner. " +
      "Open the front panel and check that the cartridge is seated firmly and that the orange protective strip has been removed from a new cartridge. " +
      "Print a configuration page from the printer menu: if that page is also empty, the device needs a new cartridge, which facilities can supply. " +
      "If the configuration page looks fine, the problem is in the document or driver, so reinstall the printer from the self service portal.",
  },
  {
    id: "kb-password-reset",
    title: "Resetting your domain password",
    content:
      "Your domain password is shared by email, the laptop login, the VPN and most internal applications. " +
      "Passwords expire every 90 days, and you will be prompted fourteen days in advance. " +
      "To change or recover it, go to the self service password page at password.corp.example.com and verify your identity with your registered authenticator. " +
      "The new password must be at least 14 characters and must not match any of your last ten. " +
      "After a reset, lock and unlock your laptop while connected to the office network or VPN so the cached credentials are updated.",
  },
  {
    id: "kb-mfa-device-change",
    title: "Moving multi factor authentication to a new phone",
    content:
      "Sign in prompts are confirmed through the authenticator app on your registered mobile device. " +
      "Before you trade in or reset an old phone, open the security info page on the account portal and add the new device while the old one still works. " +
      "Scan the QR code with the authenticator app on the new phone, approve the test notification, and then remove the old device from the list. " +
      "If the old phone is already lost or wiped, you cannot complete sign in yourself, and the service desk must verify your identity and issue a temporary access pass.",
  },
  {
    id: "kb-hardware-ordering",
    title: "Requesting new equipment",
    content:
      "Laptops, monitors, docking stations, headsets and other peripherals are ordered through the hardware catalogue in the self service portal. " +
      "Standard items that fall within the equipment allowance for your role are approved automatically, and delivery to the office usually takes five working days. " +
      "Anything outside the catalogue, or above the allowance, requires approval from your line manager, which the portal requests on your behalf. " +
      "Laptops are replaced on a four year cycle; earlier replacement is only possible if the device is faulty and has been assessed by the service desk.",
  },
  {
    id: "kb-meeting-room-display",
    title: "Meeting room screen shows no signal",
    content:
      "All meeting rooms have a wall display connected to a table hub with one USB C cable and one HDMI cable. " +
      "If the display stays black or shows a no input message after you connect your laptop, check that the display is on and set to the HDMI 1 source using the remote in the wall holder. " +
      "Unplug the cable from your laptop, wait five seconds and connect it again. " +
      "On Windows, press the Windows key and P together and choose Duplicate or Extend. " +
      "Wireless screen sharing is available in the larger rooms through the room system.",
  },
  {
    id: "kb-outlook-sync",
    title: "Mailbox and calendar not updating in Outlook",
    content:
      "When new messages appear on your phone or in the web mailbox but not in the desktop Outlook client, the local cache has fallen behind. " +
      "Check the status bar at the bottom of the window: if it says working offline, turn offline mode off on the Send and Receive tab. " +
      "Restarting Outlook resolves most cases. " +
      "If the client still does not update, close it and rebuild the profile from Mail settings in the Control Panel. " +
      "Very large mailboxes above the quota can also stop synchronising, so archive older folders to bring the mailbox under the limit.",
  },
  {
    id: "kb-teams-audio",
    title: "Sound and microphone problems in Teams calls",
    content:
      "If other participants cannot hear you, or you cannot hear them, first open the device settings in Teams during the call and confirm that the correct speaker and microphone are selected. " +
      "Headsets connected through a docking station are sometimes not picked up, so try connecting them directly to the laptop. " +
      "Check that the microphone is not muted by a physical switch on the headset. " +
      "Use the test call function in the settings to record and play back a short message. " +
      "Bluetooth headsets should be paired again if the audio is choppy or keeps dropping out.",
  },
  {
    id: "kb-laptop-performance",
    title: "Improving laptop responsiveness",
    content:
      "Computers become sluggish over time when they are rarely restarted, when disk space runs low or when many applications run at once. " +
      "Restart the laptop at least once a week, because updates are only finished during a restart. " +
      "Open Task Manager to see which applications use the most memory and close the ones you do not need. " +
      "Keep at least 20 percent of the disk free by removing old downloads and emptying the recycle bin. " +
      "Browser tabs use a lot of memory as well. " +
      "If the device is still slow after these steps, it may need a hardware check by the service desk.",
  },
  {
    id: "kb-software-installation",
    title: "Getting applications installed on your computer",
    content:
      "Employees do not have administrator rights on company laptops, so programs cannot be installed directly from the internet. " +
      "Approved applications are available in the Software Center, where you can install them yourself with one click. " +
      "If the program you need is not listed, submit a software request in the self service portal with the name, version and business reason. " +
      "The security team reviews new software for licensing and data protection, which normally takes three working days. " +
      "Browser extensions follow the same approval process.",
  },
  {
    id: "kb-office-wifi",
    title: "Wireless network in the office",
    content:
      "Company laptops connect automatically to the CORP wireless network using a device certificate, and no password is needed. " +
      "The GUEST network is for visitors and personal devices only and does not give access to internal systems. " +
      "If your laptop does not join CORP, turn the wireless adapter off and on again, and forget the network so that it reconnects. " +
      "Laptops that have not been on the corporate network for more than 60 days may have an expired certificate and must be connected with a cable once to renew it.",
  },
  {
    id: "kb-phishing-report",
    title: "Handling suspicious messages",
    content:
      "Phishing messages try to trick you into clicking a link, opening an attachment or sharing your credentials, often by pretending to be a manager, a supplier or IT. " +
      "Do not click links or open attachments in a message you did not expect. " +
      "Use the Report button in the Outlook toolbar, which sends the message to the security team and removes it from your inbox. " +
      "If you already entered your password on a suspicious page, change your password immediately and treat it as a security incident. " +
      "Never forward the message to colleagues as a warning.",
  },
];

// Title plus body gives the embedding both the topic and the detail.
export function articleEmbeddingText(article: Article): string {
  return `${article.title}\n${article.content}`;
}
