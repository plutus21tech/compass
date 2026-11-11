'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LogOut, User } from 'lucide-react'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { useCompanyBranding } from '@/components/providers/company-branding-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { userSubtitle } from '@/components/layout/top-bar/user-subtitle'

interface UserMenuProps {
  user: { name: string; role: string; position?: string | null; department?: string | null }
}

export function UserMenu({ user }: UserMenuProps) {
  const router = useRouter()
  const { clearSelectedCompany } = useCompanyBranding()

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      toast.error('Could not sign out. Try again.')
      return
    }
    clearSelectedCompany()
    router.push('/login')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account menu"
        >
          <UserAvatar name={user.name} size="sm" />
          <span className="hidden md:block">
            <span className="block text-sm font-medium leading-none text-foreground">{user.name}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{userSubtitle(user)}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => router.push('/profile')}>
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { void handleSignOut() }}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
