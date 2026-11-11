interface SubtitleUser {
  role: string
  position?: string | null
  department?: string | null
}

/** The line under the name in the avatar menu: position, else department, else role. */
export function userSubtitle(user: SubtitleUser): string {
  for (const value of [user.position, user.department]) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return user.role
}
