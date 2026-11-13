import type { NavItem, SidebarConfig } from './sidebar-config'

type ItemList = NavItem[]

/** Maps `items`, every group's items and `pinned` through `fn`, returning a new config. */
function mapAllSections(config: SidebarConfig, fn: (items: ItemList) => ItemList): SidebarConfig {
  return {
    ...config,
    items: fn(config.items),
    groups: config.groups.map((group) => ({ ...group, items: fn(group.items) })),
    ...(config.pinned ? { pinned: fn(config.pinned) } : {}),
  }
}

function allItems(config: SidebarConfig): NavItem[] {
  return [...config.items, ...config.groups.flatMap((group) => group.items), ...(config.pinned ?? [])]
}

function hasHref(config: SidebarConfig, href: string): boolean {
  return allItems(config).some((item) => item.href === href)
}

export function withGroupItem(config: SidebarConfig, groupLabel: string, entry: NavItem, position: 'start' | 'end' = 'end'): SidebarConfig {
  if (config.groups.some((group) => group.items.some((item) => item.href === entry.href))) return config
  return {
    ...config,
    groups: config.groups.map((group) => (group.label === groupLabel ? { ...group, items: position === 'start' ? [entry, ...group.items] : [...group.items, entry] } : group)),
  }
}

/** Changes one item in place (link, badge, highlight), wherever it sits; returns the same config when it is missing. */
export function withItemPatched(config: SidebarConfig, href: string, patch: Partial<NavItem>): SidebarConfig {
  if (!hasHref(config, href)) return config
  return mapAllSections(config, (items) => items.map((item) => (item.href === href ? { ...item, ...patch } : item)))
}

/** Inserts `entry` right after the anchor, in the section that holds it; appends to the top level when there is no anchor. */
export function withItemAfter(config: SidebarConfig, entry: NavItem, anchorHref: string): SidebarConfig {
  if (hasHref(config, entry.href)) return config
  if (!hasHref(config, anchorHref)) return { ...config, items: [...config.items, entry] }
  return mapAllSections(config, (items) => {
    const anchor = items.findIndex((item) => item.href === anchorHref)
    return anchor >= 0 ? [...items.slice(0, anchor + 1), entry, ...items.slice(anchor + 1)] : items
  })
}

export interface SecurityChecksNavAccess {
  enabled: boolean
  console: boolean
}

/** Replaces the item at `href` with `entry` in place; returns the config unchanged if `href` is absent. */
export function withItemReplaced(config: SidebarConfig, href: string, entry: NavItem): SidebarConfig {
  if (!hasHref(config, href)) return config
  return mapAllSections(config, (items) => items.filter((item) => item.href !== entry.href).map((item) => (item.href === href ? entry : item)))
}

/**
 * One "Security" entry (checks, console and device support live there as tabs).
 * It takes the place of Help & IT (employee sidebar) or Device Tickets
 * (Security sidebar). HR's admin console gets it under Operations.
 */
export function withSecurityChecksNav(config: SidebarConfig, access: SecurityChecksNavAccess, icon: NavItem['icon']): SidebarConfig {
  if (!access.enabled) return config
  const entry: NavItem = { label: 'Security', href: '/security-checks', icon }
  if (config.items.some((item) => item.href === '/admin')) {
    return access.console ? withGroupItem(config, 'Operations', entry) : config
  }
  const helpAndIt = allItems(config).find((item) => item.href === '/device-support')
  if (helpAndIt) return withItemReplaced(config, '/device-support', { ...entry, label: 'Help & IT', keywords: helpAndIt.keywords })
  if (hasHref(config, '/security/device-tickets')) return withItemReplaced(config, '/security/device-tickets', entry)
  return withItemAfter(config, entry, '/my-tasks')
}

/** The Company Dashboard link for a hire in onboarding. Module 14 sends them there, and it is all they can read. */
export function withLockedHandbookNav(config: SidebarConfig, icon: NavItem['icon']): SidebarConfig {
  return withItemAfter(config, { label: 'Company Dashboard', href: '/handbook', icon }, '/onboarding')
}

export interface AcademyNavIcons {
  library: NavItem['icon']
  contacts: NavItem['icon']
  links: NavItem['icon']
  /** Falls back to the library icon. */
  videos?: NavItem['icon']
}

/** Sends a group's item somewhere else, keeping its place and label; the same config when it is missing. */
function withGroupItemMoved(config: SidebarConfig, href: string, nextHref: string): SidebarConfig {
  if (!config.groups.some((group) => group.items.some((item) => item.href === href))) return config
  return {
    ...config,
    groups: config.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => (item.href === href ? { ...item, href: nextHref } : item)),
    })),
  }
}

/** Academy settings pages, under the admin console's Onboarding group only (never the onboarding sidebar). */
export function withAcademyNav(config: SidebarConfig, icons: AcademyNavIcons): SidebarConfig {
  if (!config.items.some((item) => item.href === '/admin')) return config
  const entries: NavItem[] = [
    { label: 'Academy library', href: '/admin/onboarding/academy/library', icon: icons.library },
    { label: 'Key contacts', href: '/admin/onboarding/academy/contacts', icon: icons.contacts },
    { label: 'Links & settings', href: '/admin/onboarding/academy/links', icon: icons.links },
    { label: 'Assign a module', href: '/admin/onboarding/academy/assign', icon: icons.library },
    { label: 'Checklist template', href: '/admin/onboarding/academy/checklist', icon: icons.links },
    { label: 'Videos', href: '/admin/onboarding/academy/videos', icon: icons.videos ?? icons.library },
  ]
  const moved = withGroupItemMoved(
    withGroupItemMoved(config, '/admin/onboarding/modules', '/admin/onboarding/academy/modules'),
    '/admin/onboarding/quiz',
    '/admin/onboarding/academy/quiz',
  )
  return entries.reduce((acc, entry) => withGroupItem(acc, 'Onboarding', entry), moved)
}

/** O&A's "Payment details" page: hires' saved payout details, masked. O&A only. Ends the Work group. */
export function withOaPaymentNav(config: SidebarConfig, show: boolean, icon: NavItem['icon']): SidebarConfig {
  if (!show) return config
  return withGroupItem(config, 'Work', { label: 'Payment details', href: '/oa/payment-details', icon })
}

/** Subscription Management for the EXECUTION role. Ends the Work group; a no-op without one or when already present. */
export function withExecutionNav(config: SidebarConfig, show: boolean, icon: NavItem['icon']): SidebarConfig {
  if (!show) return config
  return withGroupItem(config, 'Work', { label: 'Subscription Management', href: '/execution/subscriptions', icon })
}
