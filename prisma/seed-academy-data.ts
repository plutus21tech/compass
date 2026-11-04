// Starting content for the Onboarding Academy. Pure data: no database access.
import type { AcademyLink, AcademyLinkKey, LibraryCardInput } from '../lib/academy/links'

export interface AcademyModuleSeed {
  orderIndex: number
  slug: string
  title: string
  phase: 'DAY_1' | 'WEEK_1'
  estimatedMinutes: number
  headlineLead: string
  headlineAccent: string
  icon: string
  completionRule:
    | 'VIDEO_95' | 'SCROLL_END' | 'BUDDY_HELLO' | 'ALL_LINKS_OPENED' | 'CHECKLIST_AND_FIELD'
    | 'CHECKLIST_AND_ACK' | 'FIELD_SUBMITTED' | 'PAYMENT_SETUP' | 'LINK_OPENED'
}

const m = (
  orderIndex: number, slug: string, title: string, phase: AcademyModuleSeed['phase'], estimatedMinutes: number,
  headlineLead: string, headlineAccent: string, icon: string, completionRule: AcademyModuleSeed['completionRule'],
): AcademyModuleSeed => ({ orderIndex, slug, title, phase, estimatedMinutes, headlineLead, headlineAccent, icon, completionRule })

export const ACADEMY_MODULES: readonly AcademyModuleSeed[] = [
  m(1, 'welcome', 'Welcome to Plutus21', 'DAY_1', 7, 'WELCOME TO', 'Plutus21', 'PlayCircle', 'VIDEO_95'),
  m(2, 'culture-values', 'Culture, Values and Code of Conduct', 'DAY_1', 7, 'OUR', 'Values', 'Heart', 'VIDEO_95'),
  m(3, 'team-contacts', 'Your Team and Key Contacts', 'DAY_1', 5, 'MEET YOUR', 'Team', 'Users', 'BUDDY_HELLO'),
  m(4, 'role-90-days', 'Your Role and First 90 Days', 'DAY_1', 10, 'YOUR FIRST 90', 'Days', 'Target', 'ALL_LINKS_OPENED'),
  m(5, 'how-we-work', 'How We Work: Tools and Rhythm', 'DAY_1', 6, 'HOW WE WORK', 'Together', 'Wrench', 'SCROLL_END'),
  m(6, 'discord', 'Discord Setup and Training', 'DAY_1', 15, 'SET UP', 'Discord', 'MessageCircle', 'CHECKLIST_AND_FIELD'),
  m(7, 'security', 'Security, Equipment and Data', 'DAY_1', 10, 'STAY', 'Secure', 'ShieldCheck', 'CHECKLIST_AND_ACK'),
  m(8, 'linkedin', 'Your LinkedIn Profile', 'WEEK_1', 5, 'MAKE IT LINKEDIN', 'Official', 'Linkedin', 'FIELD_SUBMITTED'),
  m(9, 'time-off', 'Working Hours, Time Off and Holidays', 'WEEK_1', 10, 'TIME', 'Off', 'CalendarDays', 'SCROLL_END'),
  m(10, 'benefits', 'Your Benefits', 'WEEK_1', 6, 'WHAT WE', 'Offer You', 'Gift', 'SCROLL_END'),
  m(11, 'getting-paid', 'Getting Paid', 'WEEK_1', 5, 'GETTING', 'Paid', 'Wallet', 'PAYMENT_SETUP'),
  m(12, 'reimbursements', 'Reimbursements', 'WEEK_1', 4, 'CLAIMING', 'Expenses', 'Receipt', 'SCROLL_END'),
  m(13, 'reviews-growth', 'Reviews, Feedback and Growth', 'WEEK_1', 5, 'HOW YOU', 'Grow', 'TrendingUp', 'SCROLL_END'),
  m(14, 'company-dashboard', 'The Company Dashboard and Where to Find Things', 'WEEK_1', 4, 'WHERE TO FIND', 'Things', 'BookOpen', 'LINK_OPENED'),
]

const none = (): Required<Rules> => ({ countries: [], workModes: [], contractTypes: [], employmentStatuses: [] })
type Rules = Partial<Pick<LibraryCardInput, 'countries' | 'workModes' | 'contractTypes' | 'employmentStatuses'>>
const card = (
  kind: LibraryCardInput['kind'], title: string, icon: string, body: string,
  rules: Rules = {},
  links: LibraryCardInput['links'] = [],
): LibraryCardInput => ({ kind, title, icon, body, links, ...none(), ...rules })

const OFFICE_DAYS: Rules = { countries: ['PK'], workModes: ['OFFICE', 'HYBRID'] }

export const ACADEMY_CARDS: readonly LibraryCardInput[] = [
  card('BENEFIT', 'Flexibility', 'Clock', 'No strict hours, with core hours for collaboration.'),
  card('BENEFIT', 'Work from home', 'Home', 'Work from home whenever needed, within core hours.'),
  card('BENEFIT', 'Lunch PKR 600', 'Utensils', 'Lunch on office days, as a PKR 600 daily allowance.', OFFICE_DAYS),
  card('BENEFIT', 'Work travel', 'Plane', 'Work travel expenses are covered per the Travel Policy.'),
  card('BENEFIT', 'Laptop, phone and phone line', 'Laptop', 'Permanent employees receive a laptop, a phone and a phone line.', { employmentStatuses: ['PERMANENT'] }),
  card(
    'BENEFIT', 'Health insurance', 'HeartPulse',
    'We care about your well-being. Your cover includes you and your spouse, with maternity included. Before you make a claim, read the Health Insurance Onboarding Presentation and use the Claim Kit, which has the Medical Claim Form and a checklist of required documents. {links}',
    { countries: ['PK'] },
  ),
  card(
    'BENEFIT', 'Health insurance stipend MAD 909', 'HeartPulse',
    'You receive a health insurance stipend of MAD 909 to help cover medical and healthcare costs. It is part of your overall compensation package.',
    { countries: ['MA'] },
  ),
  card('BENEFIT', 'Team trips and events', 'Users', 'Team trips and events bring everyone together.'),
  card(
    'BENEFIT', 'Client and Leadership Track', 'Rocket',
    'After your first three months, you may qualify for the Client and Leadership Track based on your performance, dedication and punctuality. It opens the way to client-facing and leadership roles.',
  ),
  card('BENEFIT', 'Team Teach-ins', 'GraduationCap', 'Team Teach-ins are sessions where colleagues teach each other.'),
  card('BENEFIT', 'Stock options', 'TrendingUp', 'Stock option eligibility starts from Month 3, per the Equity Stock Options Policy.', { countries: ['PK', 'MA'] }),
  card(
    'REIMBURSEMENT', 'Commute', 'Bus',
    'Travel to the office is reimbursed by the number of days you commute and the distance from your home to the office. Rates depend on your mode of transport. {commute rate table}',
    OFFICE_DAYS,
  ),
  card('REIMBURSEMENT', 'Lunch', 'Utensils', 'Take a screenshot of the total and share it in the Reimbursements WhatsApp group for approval.', OFFICE_DAYS),
  card('REIMBURSEMENT', 'SIM bundle', 'Smartphone', 'Post a screenshot of the recharge amount in the "SIM Bundle" thread on the Global Family channel in Discord.', { countries: ['PK'] }),
  card('REIMBURSEMENT', 'Payment', 'Wallet', 'Approved reimbursements are added to that month\'s salary. For any issue, email acct@plutus21.com.', { countries: ['PK'] }),
  card(
    'REIMBURSEMENT', 'Work travel', 'Plane',
    'Reasonable and necessary costs for approved work travel are reimbursed under the Travel Policy.',
    {}, [{ label: 'Travel Policy', link: { kind: 'handbook', slug: 'travel-policy' } }],
  ),
]

const handbook = (slug: string): AcademyLink => ({ kind: 'handbook', slug })

export const ACADEMY_DEFAULT_LINKS: Readonly<Partial<Record<AcademyLinkKey, AcademyLink>>> = {
  COMPANY_DASHBOARD: handbook(''),
  TRAVEL_POLICY: handbook('travel-policy'),
  EQUIPMENT_POLICY: handbook('company-equipment-policy'),
  FAULTY_EQUIPMENT_SOP: handbook('sop-faulty-equipment'),
  DISCORD_CHANNELS_GUIDE: handbook('discord-channels-guide'),
  LEAVE_POLICY: handbook('leave-policy'),
  CORE_HOURS_POLICY: handbook('core-hours-policy'),
  ZERO_TOLERANCE_POLICY: handbook('zero-tolerance-policy'),
  PRINCIPLES_OF_CONDUCT: handbook('principles-of-conduct'),
}

export interface ChecklistSeed {
  key: string
  title: string
  ownerRole: 'HR' | 'SECURITY' | 'OA' | 'TEAM_LEAD'
  dueOffsetDays: number
  autoTickEvent: string | null
}

const c = (key: string, title: string, ownerRole: ChecklistSeed['ownerRole'], dueOffsetDays: number, autoTickEvent: string | null = null): ChecklistSeed =>
  ({ key, title, ownerRole, dueOffsetDays, autoTickEvent })

export const ACADEMY_CHECKLIST: readonly ChecklistSeed[] = [
  c('contract-signed', 'Signed contract on file', 'HR', -14),
  c('lead-input', 'Tutorials and documentation from Team Manager', 'TEAM_LEAD', -7, 'LEAD_INPUT_SUBMITTED'),
  c('setup-complete', 'Setup fields complete (team, buddy, calls, core hours)', 'HR', -7, 'SETUP_READY'),
  c('accounts-created', 'Company email and Compass account created', 'SECURITY', -3, 'ACCOUNT_LINKED'),
  c('equipment-ready', 'Laptop, phone and phone line prepared', 'SECURITY', -3),
  c('calls-booked', 'HR, Security and team onboarding calls booked', 'HR', -3),
  c('access-granted', 'Email groups and tool access granted', 'SECURITY', -1),
  c('course-released', 'Course released to the new hire', 'HR', -1, 'COURSE_RELEASED'),
  c('hr-call', 'HR onboarding call held', 'HR', 0),
  c('security-call', 'Security onboarding call held', 'SECURITY', 0),
  c('team-call', 'Team onboarding call held', 'TEAM_LEAD', 0),
  c('discord-account', 'Creation Discord Account (with profile photo)', 'HR', 0, 'DISCORD_USERNAME_SAVED'),
  c('security-ack', 'Security acknowledgement signed', 'SECURITY', 0, 'SECURITY_ACK_SIGNED'),
  c('linkedin-update', 'LinkedIn Profile Update', 'HR', 7, 'LINKEDIN_VERIFIED'),
  c('payment-setup', 'Invoice Sharing/Bank Account Setup + Accounting Team Updated', 'OA', 7, 'PAYMENT_SETUP_DONE'),
  c('academy-complete', 'Academy and culture quiz complete', 'HR', 7, 'COURSE_COMPLETED'),
  c('manager-checklist', "Completion of Manager's Onboarding Checklist", 'TEAM_LEAD', 14),
]
