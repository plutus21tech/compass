// Version 1 copy for the 14 Academy modules (spec section 4). Pure data: no database access.
// {braces} are placeholders (lib/academy/placeholders.ts). HR edits this copy later in Onboarding settings.
import type { Block } from '../lib/academy/blocks'

const rich = (markdown: string): Block => ({ type: 'richText', markdown })

const WELCOME: Block[] = [
  {
    type: 'video',
    videoKey: 'VIDEO_1',
    summary:
      'You will understand what Plutus21 Partners does and how it builds companies, know that Capital and Academy sit alongside it, know where we work, and recognise every Managing Partner and Junior Partner by face and name.',
  },
]

const CULTURE_VALUES: Block[] = [
  {
    type: 'video',
    videoKey: 'VIDEO_2',
    summary:
      'You will remember our seven values, understand what each looks like in a normal working day, and know what we expect and what we never tolerate.',
  },
]

const TEAM_CONTACTS: Block[] = [
  rich('Meet your team, {preferred name}. These are the people you will learn from, work with and share wins alongside.'),
  { type: 'peopleCards', source: 'lead', heading: 'Your team lead' },
  { type: 'peopleCards', source: 'team', heading: 'Your team' },
  { type: 'peopleCards', source: 'buddy', heading: 'Your buddy' },
  rich(
    'Your buddy is your go-to person for everyday questions during your first month: where something lives, how a process works, who to ask. Send them a hello on Discord today.',
  ),
  { type: 'checklist', items: [{ key: 'buddy-hello', label: 'I have said hello to my buddy on Discord' }] },
  rich('### Key contacts across Plutus21'),
  { type: 'peopleCards', source: 'keyContacts', group: 'HR', heading: 'HR, leave, documents, policy questions' },
  {
    type: 'dataTable',
    headers: ['Need', 'Contact'],
    rows: [
      ['Lost or damaged equipment, security incidents, email groups and access', 'Security and IT, {security contacts}'],
      ['Salary, reimbursements, invoices', 'Accounts, acct@plutus21.com, {accounts contacts}'],
    ],
  },
]

const ROLE_90_DAYS: Block[] = [
  rich('### What we expect from you as {title}'),
  { type: 'roleExpectations' },
  rich('### Your first 90 days'),
  {
    type: 'timeline',
    items: [
      { label: 'Day 1', markdown: 'Meet your team, get set up, and agree your first goals with {lead first name}. {day 1 goal}' },
      { label: 'Week 1', markdown: 'Learn the tools and join ongoing projects. {week 1 goal}' },
      { label: 'Month 1', markdown: 'Get feedback and build your skills. {month 1 goal}' },
      {
        label: 'Month 3',
        markdown:
          'Formal review, a career growth plan, and eligibility for the Client and Leadership Track and stock options. {month 3 goal}',
      },
    ],
  },
  { type: 'tutorialCards', heading: 'Read and watch first' },
  { type: 'callTimes' },
]

const HOW_WE_WORK: Block[] = [
  {
    type: 'toolTiles',
    heading: 'The tools we use',
    includeTeamTools: true,
    tools: [
      {
        name: 'Discord',
        purpose: 'Day-to-day chat, team channels, quick calls and company announcements. This is where most conversation happens.',
      },
      {
        name: 'Google Workspace',
        purpose: 'Company email, calendar, documents, sheets and slides. All meetings and leave go on Google Calendar.',
      },
      { name: 'Notion', purpose: 'Project tracking and shared knowledge. Your team keeps its pages and processes here.' },
      { name: 'Compass', purpose: 'Your HR home: profile, leave requests, evaluations and this onboarding course.' },
      {
        name: 'Company Dashboard',
        purpose: 'Every policy, SOP, holiday list and form in one place (covered in Module 14).',
        linkKey: 'COMPANY_DASHBOARD',
      },
    ],
  },
  rich('### Our regular team moments'),
  {
    type: 'timeline',
    items: [
      {
        label: 'Weekly Blockers Call',
        markdown: 'Wednesdays at 7 AM CT ({blockers local time}). Everyone shares updates and we solve challenges together.',
      },
      { label: 'Team calls', markdown: 'Department calls you are added to so you can work with your team.' },
      { label: 'Team Huddles', markdown: 'Every other Thursday. No work talk, just time together.' },
      {
        label: 'Teach-ins',
        markdown:
          'Regular informal sessions where someone shares and teaches something new: technology, investments or anything else of interest.',
      },
    ],
  },
  rich(
    '**How we communicate.** Keep messages clear, direct and kind. Reply promptly during core hours. Put meetings on the calendar with an agenda, and use your team\'s channels for work discussion so others can follow.',
  ),
]

const DISCORD: Block[] = [
  rich('Discord is where Plutus21 talks. Set it up properly today so your team can reach you.'),
  {
    type: 'checklist',
    items: [
      { key: 'discord-1', label: 'Create a Discord account (or use your existing one) and enable two-factor authentication.' },
      { key: 'discord-2', label: 'Set your server display name to your full name.' },
      { key: 'discord-3', label: 'Add a clear, professional profile photo.' },
      { key: 'discord-4', label: 'Join the Plutus21 server using the invite HR sent to your company email.' },
      { key: 'discord-5', label: 'Check that you can see your department channels. If something is missing, tell HR.' },
      { key: 'discord-6', label: 'Read the Discord Training Manual and the Department Channels Guide.' },
      { key: 'discord-7', label: 'Watch the Discord training video.' },
      { key: 'discord-8', label: 'Reply to your welcome message from the team.' },
    ],
  },
  {
    type: 'linkCards',
    heading: 'Resources',
    links: [
      { label: 'Discord Training Manual', linkKey: 'DISCORD_TRAINING_MANUAL' },
      { label: 'Department Channels Guide', linkKey: 'DISCORD_CHANNELS_GUIDE' },
      { label: 'Discord Training Video', linkKey: 'DISCORD_TRAINING_VIDEO' },
    ],
  },
  { type: 'inputField', target: 'discordUsername', label: 'Your Discord username' },
]

const SECURITY: Block[] = [
  rich(
    '**Your company equipment.** You may receive a laptop, a phone and other tools. They are for work only. Take good care of them and return them in good condition when you leave or when asked.',
  ),
  {
    type: 'checklist',
    heading: 'Set this up today',
    items: [
      { key: 'twofa-google', label: 'Two-factor authentication is on for your company Google account.' },
      { key: 'twofa-discord', label: 'Two-factor authentication is on for Discord and any other company account.' },
      { key: 'device-password', label: 'Your laptop and phone are password protected.' },
    ],
  },
  rich(
    [
      '### Everyday rules',
      '- Do not use USB drives or streaming services such as Netflix on company devices.',
      '- Do not use personal accounts or unapproved apps on company devices. Ask IT before installing any software.',
      '- Keep your devices updated.',
      '- Avoid public Wi-Fi. If you must use it, connect through a VPN.',
      '- Encrypt sensitive data.',
      '- Keep food and drinks away from your devices, and use the company bag when travelling.',
    ].join('\n'),
  ),
  {
    type: 'warningBox',
    heading: 'If something is lost, stolen or damaged',
    markdown: [
      '- Email hr@plutus21.com straight away, with {security contacts} in cc.',
      '- Complete the incident inquiry form (linked below).',
      '- If a crime is involved, such as theft, file a First Information Report (FIR) with the police.',
      '',
      'The company decides on any financial liability case by case. You may be held responsible for equipment lost or damaged through negligence. Not following these rules can lead to disciplinary action, up to termination. Full details are in the Cyber Security and Equipment Handling SOPs (linked below).',
    ].join('\n'),
  },
  {
    type: 'linkCards',
    links: [
      { label: 'Incident inquiry form', linkKey: 'INCIDENT_FORM' },
      { label: 'Cyber Security and Equipment Handling SOPs', linkKey: 'CYBER_SECURITY_SOP' },
    ],
  },
  { type: 'acknowledgement', kind: 'SECURITY_SOPS', statement: 'I have read the security and equipment SOPs and I will follow them.' },
]

const LINKEDIN: Block[] = [
  rich('Let us make it LinkedIn official. Please update your profile using the text below.'),
  { type: 'copyText', label: 'Headline', text: '{title} @ Plutus21' },
  rich('**Experience:** add a new position, and choose the official Plutus21 company page so our logo appears.'),
  { type: 'copyText', label: 'Position title', text: '{title} - {department}' },
  {
    type: 'conditional',
    when: { companyWing: 'CAPITAL' },
    children: [
      {
        type: 'copyText',
        label: 'Position description',
        text: 'On the {department} team of our investment management arm, which focuses on frontier markets such as blockchain and AI, combining quantitative and fundamental research to capitalize on long-term adoption trends.',
      },
    ],
  },
  {
    type: 'conditional',
    when: { companyWing: 'PARTNERS' },
    children: [
      {
        type: 'copyText',
        label: 'Position description',
        text: 'On the {department} team of our value creation arm, which leverages deep operational knowledge and technology capabilities to help build, scale, and monetize for our partners.',
      },
    ],
  },
  { type: 'inputField', target: 'linkedinUrl', label: 'Paste your profile link here so HR can check it' },
]

const TIME_OFF: Block[] = [
  rich(
    'Your core hours are {core hours}, with a lunch break included. Be available during these hours for meetings and collaboration. All teams overlap from 5 PM to 8 PM PKT ({overlap local time}) for cross-functional work, so please be present then. If an emergency comes up during core hours, tell HR immediately. For anything planned, request leave in advance.',
  ),
  rich('**Your paid leave.** As a full-time team member you have 30 days of paid leave each year, plus public holidays.'),
  {
    type: 'dataTable',
    headers: ['Leave type', 'Allowance', 'Notes'],
    rows: [
      ['Annual leave', '14 days', 'No more than 10 consecutive days'],
      ['Casual leave', '10 days', ''],
      ['Sick leave', '6 days', 'Tell HR within 24 hours. Medical records are needed for more than 2 days and are kept confidential.'],
      ['Maternity leave', '16 weeks', 'After 1 year of employment'],
      ['Paternity leave', '30 days', 'Up to 3 times during your employment'],
      ['Public holidays', 'As announced by the government', 'See the Team Calendar'],
    ],
  },
  rich(
    [
      '### Notice you need to give',
      '- 1 day of leave: 7 days\' notice.',
      '- 2 to 4 days: 15 days\' notice.',
      '- 5 days or more: 3 weeks\' notice.',
    ].join('\n'),
  ),
  rich('### Other rules\n- No more than 10 consecutive leave days in any 4-month period.'),
  {
    type: 'conditional',
    when: { clientAccountSet: true },
    children: [rich('- People working on the same client or project cannot be on leave at the same time.')],
  },
  rich(
    [
      '- Spread your leave through the year. Up to 15 unused days can be encashed each year at PKR 2,000 per day.',
      '- Weekends do not count as leave days, and you are not expected to work weekends unless agreed.',
    ].join('\n'),
  ),
  rich(
    [
      '### How to request leave',
      '1. **Agree it with your lead, then submit the request in Compass.** For more than 2 consecutive days, attach a Transition Plan: the tasks you are handing over, who is taking each one and by when, and confirmation from each person.',
      '2. **HR reviews** the request and the Transition Plan, and confirms in Compass.',
      '3. **Add it to the calendar.** Create a calendar invite for your leave, add your team, HR and execution leads, and transfer ownership of the event to HR so it appears on the Team Calendar. If the invite is not created at least 1 week before your leave starts, the leave is cancelled.',
      '4. **Hand over.** Brief the people taking your work and make sure each one has confirmed.',
      '',
      'HR may decline requests that do not follow these rules.',
      '',
      '**Go to Leave in Compass** (Available after onboarding)',
    ].join('\n'),
  ),
]

const YOUR_BENEFITS: Block[] = [
  rich('Here is what Plutus21 offers you in {location}.'),
  { type: 'libraryCards', kind: 'BENEFIT' },
]

const GETTING_PAID: Block[] = [
  {
    type: 'conditional',
    when: { contractType: ['PK_EMPLOYMENT'] },
    children: [
      rich('You are paid a monthly salary into a bank account in your name. Approved reimbursements are added to the same month\'s salary.'),
      rich(
        [
          '1. **Your account opening letter.** HR will share your bank letter. It confirms your employment for the bank.',
          '2. **Open your salary account** at {bank name} using the letter.',
          '3. **Enter your account details** below: account title, bank, branch and IBAN.',
        ].join('\n'),
      ),
      { type: 'inputField', target: 'bank', label: 'Account title, bank, branch and IBAN' },
      rich('Questions about pay go to acct@plutus21.com.'),
    ],
  },
  {
    type: 'conditional',
    when: { contractType: ['INDEPENDENT_CONTRACTOR', 'OTHER_EMPLOYMENT'] },
    children: [
      rich('You are paid against a monthly invoice.'),
      rich(
        'Copy your team\'s invoice template. Make your own copy before entering anything. If your team\'s template is not linked here, HR will share it with you.',
      ),
      { type: 'checklist', items: [{ key: 'invoice-template', label: 'I\'ve made my own copy of the invoice template' }] },
      rich('Submit your invoice by the 22nd of every month. Late invoices may be paid in the next cycle.'),
      { type: 'inputField', target: 'payout', label: 'Your payout details, so Accounts can match your invoice' },
      rich('Questions about invoices go to {accounts contacts} or acct@plutus21.com.'),
    ],
  },
]

const REIMBURSEMENTS: Block[] = [{ type: 'libraryCards', kind: 'REIMBURSEMENT' }]

const REVIEWS_GROWTH: Block[] = [
  rich('We believe in open, continuous improvement. Feedback runs in both directions.'),
  {
    type: 'timeline',
    items: [
      { label: 'Three-month feedback session', markdown: 'A formal review of your progress, and your career growth plan.' },
      {
        label: 'Quarterly evaluations in Compass',
        markdown:
          'Input from your lead, your peers and the people who report to you. Partners and clients also contribute where relevant.',
      },
      { label: 'Six-monthly team reviews', markdown: 'A chance for your team to share feedback, ideas and concerns.' },
    ],
  },
  rich(
    '**Ways to grow:** the Client and Leadership Track after three months, Team Teach-ins, and stock option eligibility from Month 3.',
  ),
]

const COMPANY_DASHBOARD: Block[] = [
  rich(
    'Everything about the company, including policies, SOPs, holidays and forms, is on the Company Dashboard. Bookmark it now.',
  ),
  { type: 'dashboardLink', label: 'Open the Company Dashboard' },
  {
    type: 'dataTable',
    headers: ['If you need...', 'Go to'],
    rows: [
      [
        'A policy (leave, travel, core hours, social media, equipment, stock options, confidentiality)',
        'Company Dashboard, Essential Policies',
      ],
      ['The holiday list', 'Team Calendar and the Company Dashboard'],
      ['To request leave or check your balance', 'Compass, Leave'],
      ['Your evaluations', 'Compass'],
      ['Your team\'s processes and projects', 'Notion'],
      ['A quick answer from a person', 'Your buddy, then your lead, then HR on Discord'],
      ['To report lost equipment', 'hr@plutus21.com with Security and IT in cc (Module 7)'],
      ['Anything about pay', 'acct@plutus21.com'],
    ],
  },
]

export const ACADEMY_MODULE_BLOCKS: Record<string, Block[]> = {
  welcome: WELCOME,
  'culture-values': CULTURE_VALUES,
  'team-contacts': TEAM_CONTACTS,
  'role-90-days': ROLE_90_DAYS,
  'how-we-work': HOW_WE_WORK,
  discord: DISCORD,
  security: SECURITY,
  linkedin: LINKEDIN,
  'time-off': TIME_OFF,
  'your-benefits': YOUR_BENEFITS,
  'getting-paid': GETTING_PAID,
  reimbursements: REIMBURSEMENTS,
  'reviews-growth': REVIEWS_GROWTH,
  'company-dashboard': COMPANY_DASHBOARD,
}
