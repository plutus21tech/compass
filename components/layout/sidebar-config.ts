import {
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  CalendarCheck,
  CheckSquare,
  ClipboardCheck,
  Clapperboard,
  CreditCard,
  FileText,
  FolderKanban,
  Handshake,
  HelpCircle,
  Home,
  Link2,
  Monitor,
  Network,
  PackageSearch,
  Radio,
  Settings,
  ShieldCheck,
  Sliders,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import {
  ADMIN_INSIGHTS_NAV_ITEMS,
  type AdminInsightsHref,
} from '@/lib/admin-insights-navigation'
import {
  withAcademyNav,
  withExecutionNav,
  withGroupItem,
  withItemAfter,
  withItemPatched,
  withLockedHandbookNav,
  withOaPaymentNav,
  withSecurityChecksNav,
  type SecurityChecksNavAccess,
} from './sidebar-nav'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string | number
  /** Highlight for every path under this prefix, when it differs from href. */
  activePrefix?: string
  /** Extra words the search box matches this page on. */
  keywords?: readonly string[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
  defaultOpen?: boolean
  /** Defaults to true (admin behaviour); employee groups set false. */
  collapsible?: boolean
}

export type SidebarConfig = {
  items: NavItem[]
  groups: NavGroup[]
  pinned?: NavItem[]
}

// ─── Sidebar configs ─────────────────────────────────────────────────────────

export const EMPLOYEE_SIDEBAR: SidebarConfig = {
  items: [],
  groups: [
    {
      label: 'You',
      collapsible: false,
      items: [
        { label: 'Home', href: '/dashboard', icon: Home, keywords: ['dashboard'] },
        { label: 'Time off', href: '/leave', icon: Calendar, keywords: ['leave', 'holiday', 'wfh', 'work from home', 'vacation'] },
        { label: 'Evaluations', href: '/evaluations/weekly', icon: ClipboardCheck, activePrefix: '/evaluations', keywords: ['weekly', 'questions', 'review'] },
      ],
    },
    {
      label: 'Work',
      collapsible: false,
      items: [
        { label: 'My work', href: '/my-tasks', icon: CheckSquare, keywords: ['my tasks', 'tasks', 'to do'] },
        { label: 'Projects', href: '/projects', icon: FolderKanban, keywords: ['tasks', 'sprints'] },
      ],
    },
    {
      label: 'Company',
      collapsible: false,
      items: [
        { label: 'People', href: '/people', icon: Users, keywords: ['team', 'directory', 'org chart', 'company map'] },
        { label: 'Handbook', href: '/handbook', icon: BookOpen, keywords: ['policies', 'company dashboard'] },
        { label: 'Office', href: '/office', icon: Building2, keywords: ['virtual office'] },
      ],
    },
  ],
  pinned: [
    { label: 'Help & IT', href: '/device-support', icon: Monitor, keywords: ['device support', 'tickets', 'assets', 'equipment', 'security'] },
    { label: 'Profile', href: '/profile', icon: User, keywords: ['account', 'password'] },
  ],
}

export const ONBOARDING_SIDEBAR: SidebarConfig = {
  items: [
    { label: 'Onboarding', href: '/onboarding', icon: ClipboardCheck },
    { label: 'Profile', href: '/profile', icon: User },
  ],
  groups: [],
}

export const SECURITY_SIDEBAR: SidebarConfig = {
  items: [
    { label: 'Home', href: '/security', icon: Home },
    { label: 'Device Tickets', href: '/security/device-tickets', icon: Monitor },
    { label: 'Assets', href: '/security/assets', icon: PackageSearch },
    { label: 'Onboarding', href: '/security/onboarding', icon: ClipboardCheck },
    { label: 'Office', href: '/office', icon: Building2 },
    { label: 'Profile', href: '/profile', icon: User },
  ],
  groups: [],
}

const ADMIN_INSIGHTS_ICONS: Record<AdminInsightsHref, LucideIcon> = {
  '/admin/analytics': BarChart3,
  '/admin/employee-360': Radio,
}

export const ADMIN_SIDEBAR: SidebarConfig = {
  items: [
    { label: 'Dashboard', href: '/admin', icon: Home },
  ],
  groups: [
    {
      label: 'People',
      defaultOpen: true,
      items: [
        { label: 'Users', href: '/admin/users', icon: Users },
        { label: 'Org Chart', href: '/admin/org-chart', icon: Network },
      ],
    },
    {
      label: 'Performance',
      defaultOpen: true,
      items: [
        { label: 'Weightages', href: '/admin/settings', icon: Sliders },
        { label: 'Reports', href: '/admin/reports', icon: FileText },
      ],
    },
    {
      label: 'Operations',
      defaultOpen: false,
      items: [
        { label: 'Clients', href: '/admin/clients', icon: Handshake },
        { label: 'Leave', href: '/admin/leave', icon: Calendar },
        { label: 'Device Tickets', href: '/admin/device-tickets', icon: Monitor },
        { label: 'Assets', href: '/admin/assets', icon: PackageSearch },
        { label: 'Payroll', href: '/admin/payroll', icon: Wallet },
        { label: 'Subscription Management', href: '/admin/subscriptions', icon: Wallet },
        { label: 'Office', href: '/office', icon: Building2 },
        { label: 'Handbook', href: '/admin/handbook', icon: BookOpen },
      ],
    },
    {
      label: 'Onboarding',
      defaultOpen: false,
      items: [
        { label: 'Dashboard', href: '/admin/onboarding', icon: Home },
        { label: 'Positions', href: '/admin/onboarding/positions', icon: Users },
        { label: 'New Hires', href: '/admin/onboarding/new-hires', icon: User },
        { label: 'Modules', href: '/admin/onboarding/modules', icon: ClipboardCheck },
        { label: 'Quiz', href: '/admin/onboarding/quiz', icon: HelpCircle },
        { label: 'Benefits', href: '/admin/onboarding/benefits', icon: Wallet },
        { label: 'Settings', href: '/admin/onboarding/config', icon: Settings },
      ],
    },
    {
      label: 'Insights',
      defaultOpen: false,
      items: ADMIN_INSIGHTS_NAV_ITEMS.map((item) => ({
        ...item,
        icon: ADMIN_INSIGHTS_ICONS[item.href],
      })),
    },
  ],
}

// ─── Resolver ────────────────────────────────────────────────────────────────

export interface MenuContext {
  role: string | null | undefined
  hasClientele: boolean
  weekly: { enabled: boolean; openCount: number }
  securityChecks: SecurityChecksNavAccess
}

/** The one place a base menu becomes the menu a person sees (everything except the locked onboarding menu). */
export function resolveSidebarConfig(base: SidebarConfig, ctx: MenuContext): SidebarConfig {
  // The admin console has its own Clients page and must not get the employee link.
  const isAdminConsole =
    base.items.some((item) => item.href.startsWith('/admin')) ||
    base.groups.some((group) => group.items.some((item) => item.href.startsWith('/admin')))

  const withClients =
    ctx.hasClientele && !isAdminConsole
      ? withItemAfter(base, { label: 'Clients', href: '/clientele', icon: Handshake, keywords: ['clientele', 'clients'] }, '/projects')
      : base

  const withWeekly = !ctx.weekly.enabled
    ? withClients
    : isAdminConsole
      ? withGroupItem(withClients, 'Performance', { label: 'Evaluation round', href: '/admin/evaluation-round', icon: CalendarCheck }, 'start')
      : withItemPatched(withClients, '/evaluations/weekly', ctx.weekly.openCount > 0 ? { badge: ctx.weekly.openCount } : {})

  const withSecurity = withSecurityChecksNav(withWeekly, ctx.securityChecks, ShieldCheck)
  const withAcademy = withAcademyNav(withSecurity, { library: BookOpen, contacts: Users, links: Link2, videos: Clapperboard })
  const withExecution = withExecutionNav(withAcademy, ctx.role === 'EXECUTION', Wallet)
  return withOaPaymentNav(withExecution, ctx.role === 'OA', CreditCard)
}

/** The menu for a hire still in onboarding. */
export function resolveLockedSidebarConfig(onboarding: SidebarConfig): SidebarConfig {
  return withLockedHandbookNav(onboarding, BookOpen)
}

/** Items, then each group's items in order, then pinned. */
export function flattenNav(config: SidebarConfig): NavItem[] {
  return [...config.items, ...config.groups.flatMap((group) => group.items), ...(config.pinned ?? [])]
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchPage {
  label: string
  href: string
  section: string
  keywords: readonly string[]
}

function pagesOf(config: SidebarConfig): SearchPage[] {
  const toPage = (item: NavItem, section: string): SearchPage => ({
    label: item.label,
    href: item.href,
    section,
    keywords: item.keywords ?? [],
  })
  return [
    ...config.items.map((item) => toPage(item, '')),
    ...config.groups.flatMap((group) => group.items.map((item) => toPage(item, group.label))),
    ...(config.pinned ?? []).map((item) => toPage(item, 'Pinned')),
  ]
}

const FOOTER_DESTINATIONS: Record<string, SearchPage> = {
  HR: { label: 'Admin Console', href: '/admin', section: 'Console', keywords: [] },
  OA: { label: 'Payroll (O&A)', href: '/oa/payroll', section: 'Console', keywords: [] },
  SECURITY: { label: 'Security Console', href: '/security', section: 'Console', keywords: [] },
}

/** Every page this person can search for: their menu, the employee menu, their console and the console switch. */
export function searchablePages(current: SidebarConfig, ctx: MenuContext): SearchPage[] {
  const consoleConfig =
    ctx.role === 'HR'
      ? resolveSidebarConfig(ADMIN_SIDEBAR, ctx)
      : ctx.role === 'SECURITY'
        ? resolveSidebarConfig(SECURITY_SIDEBAR, ctx)
        : null
  const footer = ctx.role ? FOOTER_DESTINATIONS[ctx.role] : undefined
  const all = [
    ...pagesOf(current),
    ...pagesOf(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx)),
    ...(consoleConfig ? pagesOf(consoleConfig) : []),
    ...(footer ? [footer] : []),
  ]
  const seen = new Set<string>()
  return all.filter((page) => {
    if (seen.has(page.href)) return false
    seen.add(page.href)
    return true
  })
}
