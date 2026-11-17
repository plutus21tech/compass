import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isThreeEDepartment } from '@/lib/company-branding'
import { karachiDayKey } from '@/lib/home/time'
import { canManagePayroll } from '@/lib/permissions'
import { ACTIVE_PERSON_WHERE } from './directory'
import {
  EMPTY_PROFILE_DETAILS,
  PROFILE_PROJECTS_SHOWN,
  pickProfileLeave,
  type PersonProfile,
  type ProfileAvatar,
  type ProfileDetails,
  type ProfileProject,
} from './profile-rules'

export interface ProfileViewer {
  id: string
  role: string
  department: string | null
}

const PERSON_SELECT = {
  id: true,
  name: true,
  position: true,
  department: true,
  email: true,
  discordId: true,
  discordUsername: true,
  linkedinUrl: true,
  avatarSkinTone: true,
  avatarBodyFrame: true,
  avatarOutfitType: true,
  avatarOutfitColor: true,
  avatarOutfitAccentColor: true,
  avatarHairCategory: true,
  avatarHairColor: true,
  avatarHeadCoveringType: true,
  avatarHeadCoveringColor: true,
  avatarAccessories: true,
  teamTagDefinition: { select: { label: true } },
  profileDetail: { select: { bio: true, hobbies: true, funFact: true, askMeAbout: true } },
} as const

/**
 * Whether the viewer may open this person's profile. The same line People and search
 * draw: 3E staff and Plutus21 staff see their own company. HR and OA look after both,
 * and everyone can open their own.
 */
export function canViewProfile(viewer: ProfileViewer, person: { id: string; department: string | null }): boolean {
  if (viewer.id === person.id || canManagePayroll(viewer.role)) return true
  return isThreeEDepartment(viewer.department) === isThreeEDepartment(person.department)
}

function toAvatar(row: {
  avatarSkinTone: string | null
  avatarBodyFrame: string | null
  avatarOutfitType: string | null
  avatarOutfitColor: string | null
  avatarOutfitAccentColor: string | null
  avatarHairCategory: string | null
  avatarHairColor: string | null
  avatarHeadCoveringType: string | null
  avatarHeadCoveringColor: string | null
  avatarAccessories: unknown
}): ProfileAvatar {
  const accessories = Array.isArray(row.avatarAccessories)
    ? row.avatarAccessories.filter((item): item is string => typeof item === 'string')
    : []
  return {
    skinTone: row.avatarSkinTone,
    bodyFrame: row.avatarBodyFrame,
    outfitType: row.avatarOutfitType,
    outfitColor: row.avatarOutfitColor,
    outfitAccentColor: row.avatarOutfitAccentColor,
    hairCategory: row.avatarHairCategory,
    hairColor: row.avatarHairColor,
    headCoveringType: row.avatarHeadCoveringType,
    headCoveringColor: row.avatarHeadCoveringColor,
    accessories,
  }
}

async function loadActiveProjects(personId: string, db: PrismaClient): Promise<ProfileProject[]> {
  const rows = await db.project.findMany({
    where: { status: 'ACTIVE', OR: [{ ownerId: personId }, { members: { some: { userId: personId } } }] },
    select: { id: true, name: true, ownerId: true, members: { where: { userId: personId }, select: { role: true } } },
    orderBy: { name: 'asc' },
    take: PROFILE_PROJECTS_SHOWN,
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.ownerId === personId ? 'OWNER' : (row.members[0]?.role ?? 'MEMBER'),
  }))
}

/**
 * A person's profile as this viewer may see it, or null when they may not (or the
 * person is gone). Never carries pay, bank, evaluation or birthday data.
 */
export async function loadPersonProfile(
  viewer: ProfileViewer,
  personId: string,
  db: PrismaClient = prisma,
  now: Date = new Date()
): Promise<PersonProfile | null> {
  const isSelf = viewer.id === personId
  const person = await db.user.findFirst({
    where: isSelf ? { id: personId } : { AND: [{ id: personId }, ACTIVE_PERSON_WHERE] },
    select: PERSON_SELECT,
  })
  if (!person || !canViewProfile(viewer, person)) return null

  const todayKey = karachiDayKey(now)
  const [leaveRows, projects] = await Promise.all([
    db.leaveRequest.findMany({
      where: { employeeId: personId, status: 'APPROVED', endDate: { gte: new Date(`${todayKey}T00:00:00Z`) } },
      select: { id: true, leaveType: true, status: true, startDate: true, endDate: true, isHalfDay: true },
      orderBy: { startDate: 'asc' },
    }),
    loadActiveProjects(personId, db),
  ])

  return {
    id: person.id,
    name: person.name,
    position: person.position,
    department: person.department,
    teamLabel: person.teamTagDefinition?.label ?? null,
    email: person.email,
    discordId: person.discordId,
    discordUsername: person.discordUsername,
    linkedinUrl: person.linkedinUrl,
    avatar: toAvatar(person),
    leave: pickProfileLeave(leaveRows, todayKey),
    projects,
    details: person.profileDetail ?? EMPTY_PROFILE_DETAILS,
    isSelf,
    canSeeCompensation: canManagePayroll(viewer.role),
  }
}

/** Saves the session user's own "about me" answers. Validate with profileDetailsSchema first. */
export async function saveProfileDetails(
  userId: string,
  details: ProfileDetails,
  db: PrismaClient = prisma
): Promise<ProfileDetails> {
  const data = { bio: details.bio, hobbies: details.hobbies, funFact: details.funFact, askMeAbout: details.askMeAbout }
  return db.profileDetail.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: { bio: true, hobbies: true, funFact: true, askMeAbout: true },
  })
}
