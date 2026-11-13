'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { CompanyBrandMark } from '@/components/brand/CompanyBrandMark'
import { CompanyBrandLockup } from '@/components/brand/CompanyBrandLockup'
import { useCompanyBranding } from '@/components/providers/company-branding-provider'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Wallet,
  Shield,
  Eye,
} from 'lucide-react'
import type { NavItem, NavGroup, SidebarConfig } from './sidebar-config'

export type { NavItem, NavGroup, SidebarConfig } from './sidebar-config'
export { EMPLOYEE_SIDEBAR, ONBOARDING_SIDEBAR, SECURITY_SIDEBAR, ADMIN_SIDEBAR } from './sidebar-config'

// ─── NavItem Component ───────────────────────────────────────────────────────

function SidebarNavItem({
  item,
  collapsed,
  pathname,
}: {
  item: NavItem
  collapsed: boolean
  pathname: string
}) {
  const isActive =
    item.href === '/admin'
      ? pathname === '/admin'
      : item.href === '/dashboard'
        ? pathname === '/dashboard'
        : item.href === '/security'
          ? pathname === '/security'
        : pathname.startsWith(item.activePrefix ?? item.href)

  const Icon = item.icon

  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
        collapsed && 'justify-center px-2',
        isActive
          ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-primary')} />
      {!collapsed && (
        <span className="truncate">{item.label}</span>
      )}
      {!collapsed && item.badge != null && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
          {item.badge}
        </span>
      )}
    </Link>
  )
}

// ─── NavGroup Component ──────────────────────────────────────────────────────

function SidebarNavGroup({
  group,
  collapsed,
  pathname,
}: {
  group: NavGroup
  collapsed: boolean
  pathname: string
}) {
  const [open, setOpen] = useState(group.defaultOpen ?? false)

  // Auto-open if any child is active
  const anyActive = group.items.some(i => pathname.startsWith(i.href))
  const isOpen = collapsed ? false : open || anyActive

  return (
    <div>
      {!collapsed && (
        <button
          onClick={() => setOpen(!isOpen)}
          className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <span>{group.label}</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      )}
      {collapsed && (
        <div className="mx-auto my-1 h-px w-6 bg-border" />
      )}
      <AnimatePresence initial={false}>
        {(isOpen || collapsed) && (
          <motion.div
            initial={collapsed ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 py-0.5">
              {group.items.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Always-open section with a plain heading (no chevron, no button).
function SidebarStaticGroup({
  group,
  collapsed,
  pathname,
}: {
  group: NavGroup
  collapsed: boolean
  pathname: string
}) {
  return (
    <div>
      {collapsed ? (
        <div className="mx-auto my-1 h-px w-6 bg-border" />
      ) : (
        <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {group.label}
        </div>
      )}
      <div className="space-y-0.5 py-0.5">
        {group.items.map((item) => (
          <SidebarNavItem key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
        ))}
      </div>
    </div>
  )
}

// ─── Main Sidebar ────────────────────────────────────────────────────────────

interface AppSidebarProps {
  config: SidebarConfig
  collapsed: boolean
  onToggle: () => void
  userRole?: string
  className?: string
}

export function AppSidebar({ config, collapsed, onToggle, userRole, className }: AppSidebarProps) {
  const pathname = usePathname()
  const { branding } = useCompanyBranding()
  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-card transition-all duration-200 ease-in-out',
        collapsed ? 'w-[60px]' : 'w-[240px]',
        className
      )}
    >
      {/* Header */}
      <div className={cn(
        'flex h-14 shrink-0 items-center border-b border-border px-3',
        collapsed ? 'justify-center' : 'gap-3'
      )}>
        {collapsed ? (
          <CompanyBrandMark size={22} className="text-[#2F80ED] dark:text-foreground shrink-0" />
        ) : (
          <CompanyBrandLockup size={22} className="text-[#2F80ED] dark:text-foreground shrink-0" />
        )}
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-base font-display tracking-tight text-foreground">
              {branding.platformName}
            </div>
            <div className="truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {branding.companyName}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
        <div className="space-y-1">
        {/* Top-level items */}
        {config.items.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            collapsed={collapsed}
            pathname={pathname}
          />
        ))}

        {/* Grouped items */}
        {config.groups.map((group) =>
          group.collapsible === false ? (
            <SidebarStaticGroup key={group.label} group={group} collapsed={collapsed} pathname={pathname} />
          ) : (
            <SidebarNavGroup key={group.label} group={group} collapsed={collapsed} pathname={pathname} />
          ),
        )}

        </div>

        {/* Pinned items sit at the bottom of the menu, above the footer */}
        {config.pinned && config.pinned.length > 0 && (
          <div data-pinned className="mt-auto space-y-0.5 border-t border-border pt-2">
            {config.pinned.map((item) => (
              <SidebarNavItem key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
            ))}
          </div>
        )}
      </nav>

      {/* Footer: role switcher + collapse toggle */}
      <div className="shrink-0 border-t border-border p-2 space-y-1">
        {/* HR: Employee ↔ Admin switcher */}
        {userRole === 'HR' && (
          <Link
            href={pathname.startsWith('/admin') ? '/dashboard' : '/admin'}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={collapsed ? (pathname.startsWith('/admin') ? 'Employee View' : 'Admin') : undefined}
          >
            {pathname.startsWith('/admin') ? (
              <>
                <Eye className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>Employee View</span>}
              </>
            ) : (
              <>
                <Shield className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>Admin Console</span>}
              </>
            )}
          </Link>
        )}

        {/* OA: Payroll link (when on employee view) */}
        {userRole === 'OA' && !pathname.startsWith('/oa') && (
          <Link
            href="/oa/payroll"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={collapsed ? 'Payroll (O&A)' : undefined}
          >
            <Wallet className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>Payroll (O&A)</span>}
          </Link>
        )}

        {/* O&A view: back to employee view */}
        {userRole === 'OA' && pathname.startsWith('/oa') && (
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={collapsed ? 'Employee View' : undefined}
          >
            <Eye className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>Employee View</span>}
          </Link>
        )}

        {/* Security: Employee ↔ Security Console switcher */}
        {userRole === 'SECURITY' && (
          <Link
            href={pathname.startsWith('/security') ? '/dashboard' : '/security'}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={collapsed ? (pathname.startsWith('/security') ? 'Employee View' : 'Security Console') : undefined}
          >
            {pathname.startsWith('/security') ? (
              <>
                <Eye className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>Employee View</span>}
              </>
            ) : (
              <>
                <Shield className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>Security Console</span>}
              </>
            )}
          </Link>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-[18px] w-[18px] shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
