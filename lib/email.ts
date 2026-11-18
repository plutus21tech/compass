import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db'
import { formatReportAsHTML, generateDetailedReport } from './reports'
import { escapeHtml } from '@/lib/sanitize'
import { teamLabel, type TeamTag } from '@/lib/teams/catalog'
import { loadTeamCatalog } from '@/lib/teams/load'
import { groupHolidaysByTeam, holidayIdsFullyDelivered, monthRangeUtc } from '@/lib/holidays'
import { getExpectedReturnDate } from '@/lib/leave-utils'
import { chargeableLeaveDays } from '@/lib/leave-holiday-store'
import { safeRecordLeaveAuditEvent } from '@/lib/leave-audit'
import { calculateWfhDays } from '@/lib/wfh-utils'
import { normalizeCoverPersonIds } from '@/lib/leave-cover'
import { shouldReceiveReportForPeriod } from '@/lib/evaluation-profile-rules'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { getLeaveRequestUrl } from '@/lib/leave-deep-links'
import { formatDate, formatDateRange } from '@/lib/format-date'
import { formatDaysLeft } from '@/lib/format-count'
import { compassUrl } from '@/lib/compass-url'
import { applyEmailSubject, emailTextFromHtml, firstNameOf, renderCompassEmail, sentenceCase, type EmailDetail } from '@/lib/email-template'
import { formatAcademyDate } from '@/lib/academy/view-labels'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

// Validate Gmail credentials
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.warn('⚠️ GMAIL_USER or GMAIL_APP_PASSWORD missing or empty in .env. Emails will fail to send.')
}

const FROM_EMAIL = process.env.GMAIL_USER || 'plutuscompass@gmail.com'
const DEFAULT_ONBOARDING_EXECUTION_RECIPIENT = 'execution@plutus21.com'

function parseRecipientList(raw: string | undefined | null) {
  return (raw || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
}

function getLeaveDurationLabel(days: number) {
  if (days === 0.5) return '0.5 day'
  return `${days} day${days > 1 ? 's' : ''}`
}

const TIME_OFF = 'Time off'
const HELP_AND_IT = 'Help & IT'
const ONBOARDING = 'Onboarding'

const ONBOARDING_TRACKER = '/admin/onboarding/tracker'

/** An onboarding notice to the people running it: what happened, the facts, and one button. */
function onboardingEmail(input: {
  subject: string
  summary: string
  details: EmailDetail[]
  button?: { label: string; path: string }
  after?: string
}): string {
  const button = input.button ?? { label: 'Open the tracker', path: ONBOARDING_TRACKER }
  return renderCompassEmail({
    subject: input.subject,
    section: ONBOARDING,
    name: null,
    paragraphs: [input.summary],
    details: input.details,
    button: { label: button.label, url: compassUrl(button.path) },
    after: input.after,
    reason: 'You got this because you help run onboarding at Plutus21.',
  })
}

/** Rows that only show when there is something to say. */
const optionalDetail = (label: string, value: string | null | undefined): EmailDetail[] => (value ? [{ label, value }] : [])

/** Whether a ticket asks for an upgrade, and if so whether the manager approved it. */
function upgradeDetails(ticket: { isUpgradeRequest: boolean; managerApprovalReceived: boolean | null }): EmailDetail[] {
  if (!ticket.isUpgradeRequest) return []
  const approval = ticket.managerApprovalReceived === true ? 'Yes' : ticket.managerApprovalReceived === false ? 'No' : 'Not provided'
  return [{ label: 'Upgrade request', value: 'Yes' }, { label: 'Manager approval', value: approval }]
}

/** "Thu 19 Nov", with the year only when it is not this year. */
const emailDay = (value: Date): string => formatDate(value)
/** "Thu 19 – Fri 20 Nov", or one day when they are the same. */
const emailRange = (start: Date, end: Date): string => formatDateRange(start, end)

/** The session and hours of a half day, as rows for the details card; nothing for a full day. */
function halfDayDetails(leaveRequest: {
  isHalfDay: boolean
  halfDaySession: 'FIRST_HALF' | 'SECOND_HALF' | null
  unavailableStartTime: string | null
  unavailableEndTime: string | null
}): EmailDetail[] {
  if (!leaveRequest.isHalfDay) return []
  const hours =
    leaveRequest.unavailableStartTime && leaveRequest.unavailableEndTime
      ? `${leaveRequest.unavailableStartTime} - ${leaveRequest.unavailableEndTime}`
      : 'Not provided'
  return [
    { label: 'Half day', value: leaveRequest.halfDaySession === 'FIRST_HALF' ? 'First half' : 'Second half' },
    { label: 'Unavailable hours', value: hours },
  ]
}

/** "3 days left of 10" for one leave type, so an approval says what is left; null when the balance cannot be read. */
async function leaveBalanceLine(employeeId: string, leaveType: string, year: number): Promise<string | null> {
  try {
    const balance = await prisma.leaveBalance.findUnique({ where: { employeeId_year: { employeeId, year } } })
    if (!balance) return null
    const totals: Record<string, [number, number]> = {
      CASUAL: [balance.casualDays, balance.casualUsed],
      SICK: [balance.sickDays, balance.sickUsed],
      ANNUAL: [balance.annualDays, balance.annualUsed],
    }
    const pair = totals[leaveType]
    return pair ? formatDaysLeft(pair[0] - pair[1], pair[0]) : null
  } catch (error) {
    console.error('Could not read the leave balance for an email:', error)
    return null
  }
}

async function getHrRecipientEmails() {
  const hrUsers = await prisma.user.findMany({
    where: {
      role: 'HR',
      email: { not: null },
    },
    select: { email: true },
  })
  return hrUsers.map((u) => u.email).filter(Boolean) as string[]
}

async function getExecutionRecipientEmails() {
  const executionUsers = await prisma.user.findMany({
    where: {
      role: 'EXECUTION',
      email: { not: null },
    },
    select: { email: true },
  })

  return executionUsers.map((u) => u.email).filter(Boolean) as string[]
}

function getOnboardingExecutionRecipients() {
  return parseRecipientList(
    process.env.ONBOARDING_EXECUTION_RECIPIENTS || DEFAULT_ONBOARDING_EXECUTION_RECIPIENT
  )
}

function mergeRecipientEmails(...groups: Array<Array<string | null | undefined>>) {
  return [
    ...new Set(
      groups
        .flat()
        .map((email) => email?.trim())
        .filter(Boolean) as string[]
    ),
  ]
}

async function getReportTeamLeadCcEmails(input: {
  employeeId: string
  employeeEmail: string
  periodId: string
}) {
  const assignments = await getResolvedEvaluationAssignments(input.periodId, {
    evaluateeId: input.employeeId,
  })
  const teamLeadIds = [
    ...new Set(
      assignments
        .filter((assignment) => assignment.relationshipType === 'TEAM_LEAD')
        .map((assignment) => assignment.evaluatorId)
        .filter((id) => id !== input.employeeId)
    ),
  ]

  if (teamLeadIds.length === 0) {
    return []
  }

  const teamLeads = await prisma.user.findMany({
    where: {
      id: { in: teamLeadIds },
      email: { not: null },
    },
    select: {
      email: true,
    },
  })
  const employeeEmail = input.employeeEmail.trim().toLowerCase()

  return [
    ...new Set(
      teamLeads
        .map((teamLead) => teamLead.email?.trim())
        .filter((email): email is string => Boolean(email))
        .filter((email) => email.toLowerCase() !== employeeEmail)
    ),
  ]
}

/** An email's HTML with its title filled in from the subject, and the plain-text version to send beside it. */
function finishedEmail(subject: string, html: string): { html: string; text: string } {
  const finished = applyEmailSubject(html, subject)
  return { html: finished, text: emailTextFromHtml(finished) }
}

export async function sendMail(to: string, subject: string, html: string) {
  return transporter.sendMail({
    from: `P21 Compass <${FROM_EMAIL}>`,
    to,
    subject,
    ...finishedEmail(subject, html),
  })
}

export interface MailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export async function sendMailWithAttachments(options: {
  to: string
  cc?: string[]
  subject: string
  html: string
  text?: string
  attachments: MailAttachment[]
}) {
  return transporter.sendMail({
    from: `P21 Compass <${FROM_EMAIL}>`,
    to: options.to,
    ...(options.cc && options.cc.length > 0 ? { cc: options.cc } : {}),
    subject: options.subject,
    html: options.html,
    ...(options.text ? { text: options.text } : {}),
    attachments: options.attachments,
  })
}

export async function queueEmails(periodId: string, employeeIds?: string[]) {
  const period =
    periodId === 'active'
      ? await prisma.evaluationPeriod.findFirst({ where: { isActive: true } })
      : await prisma.evaluationPeriod.findUnique({
          where: { id: periodId },
        })

  if (!period) {
    throw new Error('Period not found')
  }

  const employees = await prisma.user.findMany({
    where:
      employeeIds && employeeIds.length > 0
        ? {
            id: { in: employeeIds },
          }
        : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      position: true,
    },
  })
  const assignments = await getResolvedEvaluationAssignments(period.id)

  const queueEntries = []

  for (const employee of employees.filter((candidate) =>
    shouldReceiveReportForPeriod(candidate, assignments)
  )) {
    const detailedReport = await generateDetailedReport(employee.id, period.id)

    const report = await prisma.report.upsert({
      where: {
        employeeId_periodId: {
          employeeId: employee.id,
          periodId: period.id,
        },
      },
      create: {
        employeeId: employee.id,
        periodId: period.id,
        overallScore: detailedReport.overallScore,
        breakdownJson: detailedReport as any,
        generatedAt: new Date(),
      },
      update: {
        overallScore: detailedReport.overallScore,
        breakdownJson: detailedReport as any,
        generatedAt: new Date(),
      },
    })

    // Check if email already queued
    const existingQueue = await prisma.emailQueue.findFirst({
      where: {
        employeeId: employee.id,
        reportId: report.id,
      },
    })

    if (!existingQueue) {
      const queueEntry = await prisma.emailQueue.create({
        data: {
          employeeId: employee.id,
          reportId: report.id,
          emailStatus: 'PENDING',
        },
      })
      queueEntries.push(queueEntry)
    }
  }

  return queueEntries
}

export async function sendEmail(emailQueueId: string) {
  const queueEntry = await prisma.emailQueue.findUnique({
    where: { id: emailQueueId },
    include: {
      employee: true,
      report: {
        include: {
          period: true,
        },
      },
    },
  })

  if (!queueEntry || !queueEntry.report) {
    throw new Error('Email queue entry or report not found')
  }

  if (queueEntry.emailStatus === 'SENT') {
    return { success: true, message: 'Email already sent' }
  }

  const employee = queueEntry.employee
  const period = queueEntry.report.period

  if (!employee.email) {
    await prisma.emailQueue.update({
      where: { id: emailQueueId },
      data: {
        emailStatus: 'FAILED',
        errorMessage: 'Employee email not found',
      },
    })
    throw new Error('Employee email not found')
  }

  try {
    // Generate detailed report for proper formatting
    const detailedReport = await generateDetailedReport(employee.id, period.id)
    const htmlContent = formatReportAsHTML(
      detailedReport,
      { startDate: period.startDate, endDate: period.endDate },
      {
        firstName: firstNameOf(employee.name),
        resultsUrl: compassUrl('/evaluations/weekly#results'),
        logoUrl: compassUrl('/email/compass-logo.png'),
        settingsUrl: compassUrl('/profile'),
      }
    )
    // No score in the subject: it shows on lock screens.
    const subject = `Your ${period.name} results are ready`
    const cc = await getReportTeamLeadCcEmails({
      employeeId: employee.id,
      employeeEmail: employee.email,
      periodId: period.id,
    })

    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: employee.email,
      ...(cc.length > 0 ? { cc } : {}),
      subject,
      ...finishedEmail(subject, htmlContent),
    })

    await prisma.emailQueue.update({
      where: { id: emailQueueId },
      data: {
        emailStatus: 'SENT',
        sentAt: new Date(),
      },
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    await prisma.emailQueue.update({
      where: { id: emailQueueId },
      data: {
        emailStatus: 'FAILED',
        errorMessage: error.message || 'Unknown error',
      },
    })
    throw error
  }
}

// Leave Management Email Functions

export async function sendLeaveRequestNotification(requestId: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
      coverPerson: true,
    },
  })

  if (!leaveRequest) {
    throw new Error('Leave request not found')
  }

  const employee = leaveRequest.employee
  const startDateValue = new Date(leaveRequest.startDate)
  const endDateValue = new Date(leaveRequest.endDate)
  // Expected return is the next business day after the last day off (skips weekends).
  const returnDateValue = getExpectedReturnDate(endDateValue)

  // Same holiday-aware count that was charged to the balance.
  const daysCount = await chargeableLeaveDays(prisma, leaveRequest)
  const durationLabel = getLeaveDurationLabel(daysCount)
  const rangeLabel = emailRange(startDateValue, endDateValue)
  const typeLabel = sentenceCase(leaveRequest.leaveType)
  const subject = `Leave request from ${employee.name}: ${rangeLabel}`

  const hrEmails = await getHrRecipientEmails()
  const fallbackRecipients = parseRecipientList(
    process.env.LEAVE_FALLBACK_RECIPIENTS || 'hr@plutus21.com,execution@plutus21.com'
  )

  // Get employee's lead(s)
  const leadMappings = await prisma.evaluatorMapping.findMany({
    where: {
      evaluateeId: employee.id,
      relationshipType: 'TEAM_LEAD',
    },
    include: {
      evaluator: true,
    },
  })

  const leadEmails = leadMappings
    .filter(m => m.evaluator.email)
    .map(m => m.evaluator.email!)

  // Optional additional recipients (notification only, not approval)
  let additionalEmails: string[] = []
  const additionalIds = leaveRequest.additionalNotifyIds as string[] | null
  if (additionalIds && Array.isArray(additionalIds) && additionalIds.length > 0) {
    const additionalUsers = await prisma.user.findMany({
      where: { id: { in: additionalIds } },
      select: { email: true },
    })
    additionalEmails = additionalUsers
      .filter(u => u.email)
      .map(u => u.email!)
  }

  const coverPersonIds = normalizeCoverPersonIds(
    leaveRequest.coverPersonIds,
    leaveRequest.coverPerson?.id ?? null,
    employee.id
  )
  const coverPeople = coverPersonIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: coverPersonIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const coverPersonEmails = coverPeople
    .filter((coverPerson) => coverPerson.email)
    .map((coverPerson) => coverPerson.email!)
  const coverPersonNames = coverPeople.map((coverPerson) => coverPerson.name)

  // Build recipient list: HR + configured fallback + leads + optional additional + cover people (deduplicated)
  const recipients = [...new Set([
    ...hrEmails,
    ...fallbackRecipients,
    ...leadEmails,
    ...additionalEmails,
    ...coverPersonEmails,
  ])]
  if (recipients.length === 0) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'REQUEST_NOTIFICATION',
      status: 'SKIPPED',
      recipients,
      subject,
      metadata: {
        reason: 'No recipients configured for leave request notification',
      },
    })
    return { success: false, message: 'No recipients configured for leave request notification' }
  }

  const transitionPlan = (leaveRequest.transitionPlan || '').trim()
  const htmlContent = renderCompassEmail({
    subject,
    preview: `${durationLabel} of ${typeLabel.toLowerCase()} leave. Review it in Compass.`,
    section: TIME_OFF,
    banner: transitionPlan ? undefined : { tone: 'warning', text: 'No handover yet. A reminder goes out before the leave starts.' },
    name: null,
    paragraphs: [`${employee.name} asked for ${durationLabel} of ${typeLabel.toLowerCase()} leave.`],
    details: [
      { label: 'Type', value: typeLabel },
      { label: 'Dates', value: rangeLabel },
      { label: 'Working days', value: durationLabel },
      { label: 'Back on', value: leaveRequest.isHalfDay ? 'The same day' : emailDay(returnDateValue) },
      ...halfDayDetails(leaveRequest),
      ...(employee.department ? [{ label: 'Department', value: employee.department }] : []),
      ...(coverPersonNames.length > 0 ? [{ label: 'Covering', value: coverPersonNames.join(', ') }] : []),
      { label: 'Reason', value: leaveRequest.reason },
    ],
    quote: transitionPlan ? { label: 'Handover notes', text: transitionPlan } : undefined,
    button: { label: 'Review request', url: getLeaveRequestUrl(requestId) },
    after: 'If you need to sign in, Compass takes you back to this request afterwards.',
    reason: 'You got this because you approve, cover or were added to this leave request.',
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      ...finishedEmail(subject, htmlContent),
    })

    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'REQUEST_NOTIFICATION',
      status: 'SUCCESS',
      recipients,
      subject,
      providerMessageId: info.messageId || null,
      metadata: {
        leaveStatus: leaveRequest.status,
        recipientCount: recipients.length,
        isHalfDay: leaveRequest.isHalfDay,
      },
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send leave request notification:', error)
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'REQUEST_NOTIFICATION',
      status: 'FAILED',
      recipients,
      subject,
      metadata: {
        leaveStatus: leaveRequest.status,
        recipientCount: recipients.length,
        isHalfDay: leaveRequest.isHalfDay,
      },
      error,
    })
    return { success: false, error: error.message }
  }
}

export async function sendWfhRequestNotification(requestId: string) {
  const wfhRequest = await prisma.wfhRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
    },
  })

  if (!wfhRequest) {
    throw new Error('WFH request not found')
  }

  const employee = wfhRequest.employee
  const startDateValue = new Date(wfhRequest.startDate)
  const endDateValue = new Date(wfhRequest.endDate)
  const daysCount = calculateWfhDays(startDateValue, endDateValue)
  const durationLabel = getLeaveDurationLabel(daysCount)
  const rangeLabel = emailRange(startDateValue, endDateValue)
  const subject = `WFH request from ${employee.name}: ${rangeLabel}`

  const hrEmails = await getHrRecipientEmails()
  const executionEmails = await getExecutionRecipientEmails()
  const fallbackRecipients = parseRecipientList(
    process.env.WFH_FALLBACK_RECIPIENTS || 'hr@plutus21.com,execution@plutus21.com'
  )

  const recipients = mergeRecipientEmails(hrEmails, executionEmails, fallbackRecipients)
  if (recipients.length === 0) {
    return { success: false, message: 'No recipients configured for WFH request notification' }
  }

  const workPlan = wfhRequest.workPlan?.trim()
  const htmlContent = renderCompassEmail({
    subject,
    preview: `${durationLabel} working from home. Review it in Compass.`,
    section: TIME_OFF,
    name: null,
    paragraphs: [`${employee.name} asked to work from home for ${durationLabel}.`],
    details: [
      { label: 'Dates', value: rangeLabel },
      { label: 'Working days', value: durationLabel },
      ...(employee.department ? [{ label: 'Department', value: employee.department }] : []),
      { label: 'Reason', value: wfhRequest.reason },
    ],
    quote: workPlan ? { label: 'Work plan and availability', text: workPlan } : undefined,
    button: { label: 'Review request', url: compassUrl('/leave') },
    reason: 'You got this because you review work-from-home requests.',
  })

  const info = await transporter.sendMail({
    from: `P21 Compass <${FROM_EMAIL}>`,
    to: recipients.join(', '),
    subject,
    ...finishedEmail(subject, htmlContent),
  })

  return { success: true, messageId: info.messageId, recipients }
}

export async function sendWfhApprovalNotification(
  requestId: string,
  status: 'approved' | 'rejected',
  approverName: string,
  comment?: string
) {
  const wfhRequest = await prisma.wfhRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
    },
  })

  if (!wfhRequest || !wfhRequest.employee.email) {
    return { success: false, message: 'WFH request or employee email not found' }
  }

  const employee = wfhRequest.employee
  const employeeEmail = employee.email as string
  const startDateValue = new Date(wfhRequest.startDate)
  const endDateValue = new Date(wfhRequest.endDate)
  const daysCount = calculateWfhDays(startDateValue, endDateValue)
  const durationLabel = getLeaveDurationLabel(daysCount)
  const isApproved = status === 'approved'
  const rangeLabel = emailRange(startDateValue, endDateValue)
  const subject = isApproved ? `Your WFH is approved: ${rangeLabel}` : 'Your WFH request wasn’t approved'
  const workPlan = wfhRequest.workPlan?.trim()

  const htmlContent = renderCompassEmail({
    subject,
    preview: isApproved ? `Approved by ${approverName}.` : `${approverName} reviewed it. See the details in Compass.`,
    section: TIME_OFF,
    banner: isApproved
      ? { tone: 'success', text: `Approved by ${approverName}` }
      : { tone: 'danger', text: `Not approved by ${approverName}` },
    name: employee.name,
    paragraphs: [
      isApproved
        ? `Your request to work from home for ${durationLabel} is approved.`
        : `Your request to work from home for ${durationLabel} was not approved.`,
    ],
    details: [
      { label: 'Dates', value: rangeLabel },
      { label: 'Working days', value: durationLabel },
      { label: 'Reason', value: wfhRequest.reason },
      ...(workPlan ? [{ label: 'Work plan', value: workPlan }] : []),
    ],
    quote: comment ? { label: `Note from ${approverName}`, text: comment } : undefined,
    button: { label: 'View in Time off', url: compassUrl('/leave') },
    reason: 'You got this because you asked to work from home.',
  })

  const info = await transporter.sendMail({
    from: `P21 Compass <${FROM_EMAIL}>`,
    to: employeeEmail,
    subject,
    ...finishedEmail(subject, htmlContent),
  })

  return { success: true, messageId: info.messageId, recipient: employeeEmail }
}

export async function sendLeaveApprovalNotification(
  requestId: string,
  status: 'approved' | 'rejected',
  approverName: string,
  comment?: string
) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
    },
  })

  if (!leaveRequest) {
    return { success: false, message: 'Request or employee email not found' }
  }

  if (!leaveRequest.employee.email) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'APPROVAL_NOTIFICATION',
      status: 'SKIPPED',
      recipients: [],
      subject: null,
      metadata: {
        reason: 'Employee email not found',
        approvalStatus: status,
      },
    })
    return { success: false, message: 'Request or employee email not found' }
  }

  const employee = leaveRequest.employee
  const employeeEmail = employee.email as string // Already validated above
  const startDateValue = new Date(leaveRequest.startDate)
  const endDateValue = new Date(leaveRequest.endDate)
  // Expected return is the next business day after the last day off (skips weekends).
  const returnDateValue = getExpectedReturnDate(endDateValue)

  // Same holiday-aware count that was charged to the balance.
  const daysCount = await chargeableLeaveDays(prisma, leaveRequest)
  const durationLabel = getLeaveDurationLabel(daysCount)

  const isApproved = status === 'approved'
  const rangeLabel = emailRange(startDateValue, endDateValue)
  const typeLabel = sentenceCase(leaveRequest.leaveType)
  const subject = isApproved ? `Your leave is approved: ${rangeLabel}` : 'Your leave request wasn’t approved'
  const balance = await leaveBalanceLine(employee.id, leaveRequest.leaveType, startDateValue.getUTCFullYear())

  const htmlContent = renderCompassEmail({
    subject,
    preview: isApproved
      ? `Approved by ${approverName}.${balance ? ` ${typeLabel} balance: ${balance}.` : ''}`
      : `${approverName} reviewed it. Your balance hasn’t changed.`,
    section: TIME_OFF,
    banner: isApproved
      ? { tone: 'success', text: `Approved by ${approverName}` }
      : { tone: 'danger', text: `Not approved by ${approverName}` },
    name: employee.name,
    paragraphs: [
      isApproved
        ? `Your ${typeLabel.toLowerCase()} leave is approved, and it is on the team calendar.`
        : `Your ${typeLabel.toLowerCase()} leave request for ${rangeLabel} was not approved. Your balance hasn’t changed.`,
    ],
    details: [
      { label: 'Type', value: typeLabel },
      { label: 'Dates', value: rangeLabel },
      { label: 'Working days', value: durationLabel },
      { label: 'Back on', value: leaveRequest.isHalfDay ? 'The same day' : emailDay(returnDateValue) },
      ...halfDayDetails(leaveRequest),
      ...(balance ? [{ label: `${typeLabel} balance`, value: balance }] : []),
    ],
    quote: comment ? { label: `Note from ${approverName}`, text: comment } : undefined,
    button: isApproved
      ? { label: 'View in Time off', url: compassUrl('/leave#my-requests') }
      : { label: 'Pick new dates', url: compassUrl('/leave?request=1') },
    after: isApproved ? undefined : 'If you have questions about this decision, talk to your lead or HR.',
    reason: 'You got this because you asked for this leave.',
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: employeeEmail,
      subject,
      ...finishedEmail(subject, htmlContent),
    })

    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'APPROVAL_NOTIFICATION',
      status: 'SUCCESS',
      recipients: [employeeEmail],
      subject,
      providerMessageId: info.messageId || null,
      metadata: {
        approvalStatus: status,
        approverName,
      },
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send leave approval notification:', error)
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'APPROVAL_NOTIFICATION',
      status: 'FAILED',
      recipients: [employeeEmail],
      subject,
      metadata: {
        approvalStatus: status,
        approverName,
      },
      error,
    })
    return { success: false, error: error.message }
  }
}

// Notifies ALL parties (employee, HR, configured fallback, lead(s), cover
// people) that a finalized leave has been cancelled — used when a team lead
// disapproves a leave that HR had already approved.
export async function sendLeaveCancellationNotification(
  requestId: string,
  cancelledByName: string,
  reason?: string
) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: true, coverPerson: true },
  })
  if (!leaveRequest) {
    return { success: false, message: 'Leave request not found' }
  }

  const employee = leaveRequest.employee
  const startDateValue = new Date(leaveRequest.startDate)
  const endDateValue = new Date(leaveRequest.endDate)
  // Same holiday-aware count that was charged to the balance.
  const daysCount = await chargeableLeaveDays(prisma, leaveRequest)
  const durationLabel = getLeaveDurationLabel(daysCount)
  const rangeLabel = emailRange(startDateValue, endDateValue)
  const typeLabel = sentenceCase(leaveRequest.leaveType)
  const subject = `Leave cancelled: ${employee.name}, ${rangeLabel}`

  const hrEmails = await getHrRecipientEmails()
  const fallbackRecipients = parseRecipientList(
    process.env.LEAVE_FALLBACK_RECIPIENTS || 'hr@plutus21.com,execution@plutus21.com'
  )

  const leadMappings = await prisma.evaluatorMapping.findMany({
    where: { evaluateeId: employee.id, relationshipType: 'TEAM_LEAD' },
    include: { evaluator: true },
  })
  const leadEmails = leadMappings.filter((m) => m.evaluator.email).map((m) => m.evaluator.email!)

  const coverPersonIds = normalizeCoverPersonIds(
    leaveRequest.coverPersonIds,
    leaveRequest.coverPerson?.id ?? null,
    employee.id
  )
  const coverPeople = coverPersonIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: coverPersonIds } }, select: { email: true } })
    : []
  const coverPersonEmails = coverPeople.filter((c) => c.email).map((c) => c.email!)

  const recipients = [...new Set([
    ...(employee.email ? [employee.email] : []),
    ...hrEmails,
    ...fallbackRecipients,
    ...leadEmails,
    ...coverPersonEmails,
  ])]
  if (recipients.length === 0) {
    return { success: false, message: 'No recipients configured for leave cancellation notification' }
  }

  const htmlContent = renderCompassEmail({
    subject,
    preview: `No action needed. The days are back in ${employee.name}’s balance.`,
    section: TIME_OFF,
    banner: { tone: 'neutral', text: `Cancelled by ${cancelledByName}` },
    name: null,
    paragraphs: [
      `${employee.name}’s ${typeLabel.toLowerCase()} leave is cancelled. The days are back in the balance and it is off the calendar.`,
    ],
    details: [
      { label: 'Type', value: typeLabel },
      { label: 'Dates', value: rangeLabel },
      { label: 'Working days', value: durationLabel },
      ...halfDayDetails(leaveRequest),
    ],
    quote: reason ? { label: `Reason from ${cancelledByName}`, text: reason } : undefined,
    button: { label: 'View team calendar', url: compassUrl('/leave') },
    after: 'Contact HR with any questions.',
    reason: 'You got this because you asked for, approve or cover this leave.',
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      ...finishedEmail(subject, htmlContent),
    })
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'APPROVAL_NOTIFICATION',
      status: 'SUCCESS',
      recipients,
      subject,
      providerMessageId: info.messageId || null,
      metadata: { approvalStatus: 'cancelled', cancelledBy: cancelledByName },
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send leave cancellation notification:', error)
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'APPROVAL_NOTIFICATION',
      status: 'FAILED',
      recipients,
      subject,
      metadata: { approvalStatus: 'cancelled', cancelledBy: cancelledByName },
      error,
    })
    return { success: false, error: error.message }
  }
}

export async function sendTransitionPlanReminderNotification(requestId: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
    },
  })

  if (!leaveRequest) {
    return { success: false, message: 'Leave request not found' }
  }

  if (!['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED'].includes(leaveRequest.status)) {
    return { success: false, message: 'Leave request is not active' }
  }

  // "Done" means the structured plan was submitted (transitionPlanSubmittedAt set) — not that
  // the optional free-text "general notes" (transitionPlan) has some text in it.
  if (leaveRequest.transitionPlanSubmittedAt) {
    return { success: false, message: 'Transition plan already submitted' }
  }

  if (!leaveRequest.employee.email) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_REMINDER',
      status: 'SKIPPED',
      recipients: [],
      subject: null,
      metadata: {
        reason: 'Employee email not found',
      },
    })
    return { success: false, message: 'Employee email not found' }
  }

  const employee = leaveRequest.employee
  const employeeEmail = employee.email as string
  const startDateValue = new Date(leaveRequest.startDate)
  const endDateValue = new Date(leaveRequest.endDate)
  const returnDateValue = new Date(endDateValue)
  returnDateValue.setDate(returnDateValue.getDate() + 1)

  // Same holiday-aware count that was charged to the balance.
  const daysCount = await chargeableLeaveDays(prisma, leaveRequest)
  const durationLabel = getLeaveDurationLabel(daysCount)
  const msPerDay = 1000 * 60 * 60 * 24
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const leaveStart = new Date(startDateValue)
  leaveStart.setHours(0, 0, 0, 0)
  const daysUntilStart = Math.ceil((leaveStart.getTime() - today.getTime()) / msPerDay)

  const leavePageUrl = compassUrl('/leave')
  const timelineMessage =
    daysUntilStart <= 0
      ? 'Your leave starts today.'
      : daysUntilStart === 1
        ? 'Your leave starts tomorrow.'
        : `Your leave starts in ${daysUntilStart} days.`
  const rangeLabel = emailRange(startDateValue, endDateValue)
  const subject = `Reminder: add a handover for your leave, ${rangeLabel}`

  const htmlContent = renderCompassEmail({
    subject,
    preview: `${timelineMessage} Your team needs the handover details.`,
    section: TIME_OFF,
    banner: { tone: 'warning', text: timelineMessage },
    name: employee.name,
    paragraphs: ['Please add your transition plan for this leave, so your team has the handover details.'],
    details: [
      { label: 'Type', value: sentenceCase(leaveRequest.leaveType) },
      { label: 'Dates', value: rangeLabel },
      { label: 'Working days', value: durationLabel },
      { label: 'Back on', value: leaveRequest.isHalfDay ? 'The same day' : emailDay(returnDateValue) },
      ...halfDayDetails(leaveRequest),
      { label: 'Reason', value: leaveRequest.reason },
    ],
    button: { label: 'Add handover', url: getLeaveRequestUrl(requestId) || leavePageUrl },
    after: 'If your leave details have changed, update the request in Compass.',
    reason: 'You got this because your leave has no handover yet.',
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: employeeEmail,
      subject,
      ...finishedEmail(subject, htmlContent),
    })

    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_REMINDER',
      status: 'SUCCESS',
      recipients: [employeeEmail],
      subject,
      providerMessageId: info.messageId || null,
      metadata: {
        daysUntilStart,
      },
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send transition plan reminder:', error)
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_REMINDER',
      status: 'FAILED',
      recipients: [employeeEmail],
      subject,
      metadata: {
        daysUntilStart,
      },
      error,
    })
    return { success: false, error: error.message }
  }
}

/**
 * The two mails on the transition-plan deadline ladder for long leaves.
 *
 * Both say the same facts and differ only in urgency and audience, so they share a
 * body: divergent wording between a warning and the notice it follows up is how
 * people end up unsure which deadline actually applies.
 *
 * The notice goes to the applicant alone, matching the existing reminder. The final
 * warning copies their lead and HR, because it is the last point at which a human can
 * intervene before the request is cancelled.
 */
async function sendTransitionPlanDeadlineMail(
  requestId: string,
  deadline: Date,
  kind: 'notice' | 'final_warning'
) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: true },
  })

  if (!leaveRequest) {
    return { success: false, message: 'Leave request not found' }
  }

  if (!['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED'].includes(leaveRequest.status)) {
    return { success: false, message: 'Leave request is not active' }
  }

  if (leaveRequest.transitionPlanSubmittedAt) {
    return { success: false, message: 'Transition plan already submitted' }
  }

  const eventType = kind === 'notice' ? 'TRANSITION_PLAN_NOTICE' : 'TRANSITION_PLAN_FINAL_WARNING'

  if (!leaveRequest.employee.email) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType,
      status: 'SKIPPED',
      recipients: [],
      subject: null,
      metadata: { reason: 'Employee email not found' },
    })
    return { success: false, message: 'Employee email not found' }
  }

  const employee = leaveRequest.employee
  const employeeEmail = employee.email as string
  const startDateValue = new Date(leaveRequest.startDate)
  const endDateValue = new Date(leaveRequest.endDate)
  // Same holiday-aware count that was charged to the balance.
  const daysCount = await chargeableLeaveDays(prisma, leaveRequest)
  const durationLabel = getLeaveDurationLabel(daysCount)

  // Spelled out with the weekday in UTC: a bare numeric date is the wrong thing to be
  // ambiguous about when missing it cancels the leave.
  const deadlineLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(deadline)

  const leavePageUrl = getLeavePageUrl()
  const isWarning = kind === 'final_warning'

  const rangeLabel = emailRange(startDateValue, endDateValue)
  const subject = isWarning
    ? `Your leave is cancelled tomorrow without a handover: ${rangeLabel}`
    : `Handover needed by ${deadlineLabel} for your leave, ${rangeLabel}`

  const htmlContent = renderCompassEmail({
    subject,
    preview: `Add a transition plan by ${deadlineLabel}, or the leave is cancelled automatically.`,
    section: TIME_OFF,
    banner: isWarning
      ? { tone: 'danger', text: `Final notice: handover due ${deadlineLabel}` }
      : { tone: 'warning', text: `Handover due ${deadlineLabel}` },
    name: employee.name,
    paragraphs: [
      isWarning
        ? `Your leave request will be cancelled automatically if a transition plan is not attached by ${deadlineLabel}.`
        : `Please attach a transition plan by ${deadlineLabel}. If nothing is attached by then, this leave request is cancelled automatically.`,
      'This applies because the leave is longer than two working days, so your team needs the handover details before you go.',
    ],
    details: [
      { label: 'Type', value: sentenceCase(leaveRequest.leaveType) },
      { label: 'Dates', value: rangeLabel },
      { label: 'Working days', value: durationLabel },
      { label: 'Handover due', value: deadlineLabel },
      { label: 'Reason', value: leaveRequest.reason },
    ],
    button: { label: 'Add handover', url: getLeaveRequestUrl(requestId) || leavePageUrl },
    after: 'If the leave is cancelled, the days go back to your balance and you can apply again with a plan attached.',
    reason: 'You got this because your leave has no handover yet.',
  })

  // Only the final warning widens beyond the applicant, and a failure to resolve those
  // extras must not stop the applicant's own copy going out.
  let ccEmails: string[] = []
  if (isWarning) {
    try {
      const [hrEmails, leadMappings] = await Promise.all([
        getHrRecipientEmails(),
        prisma.evaluatorMapping.findMany({
          where: { evaluateeId: employee.id, relationshipType: 'TEAM_LEAD' },
          include: { evaluator: true },
        }),
      ])
      ccEmails = mergeRecipientEmails(hrEmails, leadMappings.map((m) => m.evaluator.email))
        .filter((email) => email.toLowerCase() !== employeeEmail.toLowerCase())
    } catch (error) {
      console.error('Failed to resolve transition plan warning CC list:', error)
    }
  }

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: employeeEmail,
      cc: ccEmails.length > 0 ? ccEmails.join(', ') : undefined,
      subject,
      ...finishedEmail(subject, htmlContent),
    })

    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType,
      status: 'SUCCESS',
      recipients: [employeeEmail, ...ccEmails],
      subject,
      providerMessageId: info.messageId || null,
      metadata: { deadline: deadline.toISOString() },
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error(`Failed to send transition plan ${kind}:`, error)
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType,
      status: 'FAILED',
      recipients: [employeeEmail, ...ccEmails],
      subject,
      metadata: { deadline: deadline.toISOString() },
      error,
    })
    return { success: false, error: error.message }
  }
}

/**
 * Opens the response window. Its audit row is what the deadline is computed from, so
 * this must succeed before any cancellation becomes possible.
 */
export async function sendTransitionPlanDeadlineNotice(requestId: string, deadline: Date) {
  return sendTransitionPlanDeadlineMail(requestId, deadline, 'notice')
}

/** Last call before the request is cancelled, copied to the lead and HR. */
export async function sendTransitionPlanFinalWarning(requestId: string, deadline: Date) {
  return sendTransitionPlanDeadlineMail(requestId, deadline, 'final_warning')
}

// Device Management Email Functions
async function getSupportRecipientEmails() {
  const supportUsers = await prisma.user.findMany({
    where: {
      role: { in: ['HR', 'SECURITY'] },
      email: { not: null },
    },
    select: { email: true },
  })

  return [...new Set(supportUsers.map((u) => u.email).filter(Boolean) as string[])]
}

export async function sendNewTicketNotificationToHR(ticketId: string) {
  const ticket = await prisma.deviceTicket.findUnique({
    where: { id: ticketId },
    include: {
      employee: true,
    },
  })

  if (!ticket) {
    console.error('[Email] New ticket not found', { ticketId })
    return { success: false, message: 'Ticket not found' }
  }

  const recipients = await getSupportRecipientEmails()
  if (recipients.length === 0) {
    console.warn('[Email] No HR/Security recipients found for new ticket notification')
    return { success: false, message: 'No support recipients configured' }
  }

  const priorityLabel = sentenceCase(ticket.priority)
  const subject = `New ticket (${priorityLabel.toLowerCase()} priority): ${ticket.title}`
  const htmlContent = renderCompassEmail({
    subject,
    preview: `From ${ticket.employee.name}, about their ${ticket.deviceType}.`,
    section: HELP_AND_IT,
    banner: ticket.priority === 'URGENT' || ticket.priority === 'HIGH' ? { tone: 'warning', text: `${priorityLabel} priority` } : undefined,
    name: null,
    paragraphs: [`${ticket.employee.name} raised a device support ticket.`],
    details: [
      { label: 'Ticket', value: ticket.title },
      { label: 'Device', value: ticket.deviceType },
      { label: 'Priority', value: priorityLabel },
      ...(ticket.employee.department ? [{ label: 'Department', value: ticket.employee.department }] : []),
      ...upgradeDetails(ticket),
    ],
    quote: { label: `From ${ticket.employee.name}`, text: ticket.description },
    button: { label: 'Open ticket', url: compassUrl('/device-support') },
    reason: 'You got this because you handle device support.',
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      ...finishedEmail(subject, htmlContent),
    })
    console.log('[Email] New ticket notification sent to support team', { ticketId })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error(`[Email] Failed to send new ticket notification to support team:`, error)
    return { success: false, error: error.message }
  }
}

export async function sendTicketStatusNotification(
  ticketId: string,
  updatedByName?: string,
  updatedByRole?: 'EMPLOYEE' | 'HR' | 'SECURITY' | 'OA' | 'EXECUTION'
) {
  console.log('[Email] Triggering status notification for ticket', { ticketId })

  const ticket = await prisma.deviceTicket.findUnique({
    where: { id: ticketId },
    include: {
      employee: true,
    },
  })

  if (!ticket) {
    console.error('[Email] Ticket not found for notification', { ticketId })
    return { success: false, message: 'Ticket not found' }
  }

  const employee = ticket.employee
  const supportRecipients = await getSupportRecipientEmails()
  const recipients = [...new Set([employee.email, ...supportRecipients].filter(Boolean) as string[])]
  if (recipients.length === 0) {
    return { success: false, message: 'No recipients available for status notification' }
  }

  const statusLabels: Record<string, string> = {
    OPEN: 'Open',
    UNDER_REVIEW: 'Under Review',
    SOLUTION: 'Solution Provided',
    RESOLVED: 'Resolved',
  }

  const statusLabel = statusLabels[ticket.status] || sentenceCase(ticket.status)
  const resolved = ticket.status === 'RESOLVED'
  const subject = resolved ? `Ticket resolved: ${ticket.title}` : `Ticket ${statusLabel.toLowerCase()}: ${ticket.title}`
  const by = updatedByName ?? ticket.hrAssignedTo ?? null

  const htmlContent = renderCompassEmail({
    subject,
    preview: resolved
      ? `${by ? `${by} fixed it. ` : ''}Open a new ticket if the problem comes back.`
      : `${employee.name}’s ticket is now ${statusLabel.toLowerCase()}.`,
    section: HELP_AND_IT,
    banner: resolved ? { tone: 'success', text: by ? `Resolved by ${by}` : 'Resolved' } : undefined,
    name: null,
    paragraphs: [`${employee.name}’s device support ticket is now ${statusLabel.toLowerCase()}.`],
    details: [
      { label: 'Ticket', value: ticket.title },
      { label: 'Device', value: ticket.deviceType },
      { label: 'Priority', value: sentenceCase(ticket.priority) },
      { label: 'Status', value: statusLabel },
      ...upgradeDetails(ticket),
      ...(ticket.expectedResolutionDate ? [{ label: 'Expected by', value: emailDay(new Date(ticket.expectedResolutionDate)) }] : []),
      ...(ticket.hrAssignedTo ? [{ label: 'Handled by', value: ticket.hrAssignedTo }] : []),
      ...(updatedByName ? [{ label: 'Updated by', value: updatedByName }] : []),
    ],
    quote: ticket.solution ? { label: 'What IT did', text: ticket.solution } : undefined,
    button: { label: 'View ticket', url: compassUrl('/device-support') },
    after: resolved ? 'If the problem comes back, open a new ticket in Help & IT.' : undefined,
    reason: 'You got this because you raised or handle this ticket.',
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      ...finishedEmail(subject, htmlContent),
    })

    console.log('[Email] Status notification sent', { recipients: recipients.length, ticketId })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('[Email] Failed to send status notification for ticket:', ticketId, error)
    return { success: false, error: error.message }
  }
}

async function getSecurityRecipientEmails() {
  const securityUsers = await prisma.user.findMany({
    where: {
      role: 'SECURITY',
      email: { not: null },
    },
    select: { email: true },
  })
  return [...new Set(securityUsers.map((u) => u.email).filter(Boolean) as string[])]
}

export async function sendPositionClosedNotification(positionId: string) {
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    include: {
      teamLead: {
        select: { name: true, email: true },
      },
    },
  })

  if (!position) {
    return { success: false, message: 'Position not found' }
  }

  const securityRecipients = await getSecurityRecipientEmails()
  const recipients = mergeRecipientEmails(
    [position.teamLead?.email],
    securityRecipients,
    getOnboardingExecutionRecipients()
  )
  if (recipients.length === 0) {
    return { success: false, message: 'No recipients configured for position closed notification' }
  }

  const subject = `Position closed: ${position.title}`
  const htmlContent = onboardingEmail({
    subject,
    summary: 'This position is closed. A new hire record can now be created from it.',
    details: [
      { label: 'Title', value: position.title },
      ...optionalDetail('Department', position.department),
      ...optionalDetail('Team lead', position.teamLead?.name),
    ],
    button: { label: 'Open positions', path: '/admin/onboarding/positions' },
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      ...finishedEmail(subject, htmlContent),
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send position closed notification:', error)
    return { success: false, error: error.message }
  }
}

export async function sendTeamLeadFormSubmittedNotification(newHireId: string) {
  const newHire = await prisma.newHire.findUnique({
    where: { id: newHireId },
    include: {
      teamLead: { select: { name: true } },
    },
  })

  if (!newHire) {
    return { success: false, message: 'New hire not found' }
  }

  const recipients = mergeRecipientEmails(
    await getHrRecipientEmails(),
    getOnboardingExecutionRecipients()
  )
  if (recipients.length === 0) {
    return { success: false, message: 'No HR recipients configured' }
  }

  const subject = `Team lead form submitted: ${newHire.name}`
  const htmlContent = onboardingEmail({
    subject,
    summary: `${newHire.teamLead?.name || 'The team lead'} sent the team lead form for ${newHire.name}.`,
    details: [
      { label: 'New hire', value: newHire.name },
      { label: 'Title', value: newHire.title },
      ...optionalDetail('Department', newHire.department),
      { label: 'Submitted by', value: newHire.teamLead?.name || 'Team lead' },
    ],
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      ...finishedEmail(subject, htmlContent),
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send team lead form submitted notification:', error)
    return { success: false, error: error.message }
  }
}

export async function sendTeamLeadFormRequestNotification(newHireId: string) {
  const newHire = await prisma.newHire.findUnique({
    where: { id: newHireId },
    include: {
      teamLead: { select: { name: true, email: true } },
    },
  })

  if (!newHire) {
    return { success: false, message: 'New hire not found' }
  }

  const teamLeadEmail = newHire.teamLead?.email
  const recipients = mergeRecipientEmails([teamLeadEmail], getOnboardingExecutionRecipients())
  if (recipients.length === 0) {
    return { success: false, message: 'No team lead email configured' }
  }

  const subject = `Team lead form needed for ${newHire.name}`
  const htmlContent = onboardingEmail({
    subject,
    summary: `Please complete the team lead onboarding form for ${newHire.name}, so security and HR can go ahead.`,
    details: [
      { label: 'New hire', value: newHire.name },
      { label: 'Title', value: newHire.title },
      ...optionalDetail('Department', newHire.department),
      { label: 'Joining', value: emailDay(newHire.onboardingDate) },
    ],
    button: { label: 'Open team lead form', path: `/team-lead-form/${encodeURIComponent(newHire.id)}` },
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      ...finishedEmail(subject, htmlContent),
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send team lead form request notification:', error)
    return { success: false, error: error.message }
  }
}

/** Asks the team lead for role expectations and goals. Throws on send failure; callers log it. */
export async function sendLeadInputRequest(newHireId: string): Promise<void> {
  const newHire = await prisma.newHire.findUnique({
    where: { id: newHireId },
    include: {
      teamLead: { select: { name: true, email: true } },
      teamLeadForm: { select: { leadInputDueAt: true } },
    },
  })
  if (!newHire) return

  const recipients = mergeRecipientEmails([newHire.teamLead?.email], getOnboardingExecutionRecipients())
  if (recipients.length === 0) return

  const dueAt = newHire.teamLeadForm?.leadInputDueAt
  const subject = `Role expectations needed for ${newHire.name}`
  const htmlContent = onboardingEmail({
    subject,
    summary: `Please describe what you expect from ${newHire.name}’s role and set their goals for day 1, week 1, month 1 and month 3.`,
    details: [
      { label: 'New hire', value: newHire.name },
      { label: 'Title', value: newHire.title },
      { label: 'Joining', value: emailDay(newHire.onboardingDate) },
      ...(dueAt ? [{ label: 'Please complete by', value: emailDay(dueAt) }] : []),
    ],
    button: { label: 'Add role expectations', path: `/team-lead-form/${encodeURIComponent(newHire.id)}` },
  })

  await transporter.sendMail({
    from: `P21 Compass <${FROM_EMAIL}>`,
    to: recipients.join(', '),
    subject,
    ...finishedEmail(subject, htmlContent),
  })
}

export async function sendSecurityChecklistCompleteNotification(newHireId: string) {
  const newHire = await prisma.newHire.findUnique({
    where: { id: newHireId },
  })

  if (!newHire) {
    return { success: false, message: 'New hire not found' }
  }

  const recipients = mergeRecipientEmails(
    await getHrRecipientEmails(),
    getOnboardingExecutionRecipients()
  )
  if (recipients.length === 0) {
    return { success: false, message: 'No HR recipients configured' }
  }

  const subject = `Security checklist complete: ${newHire.name}`
  const htmlContent = onboardingEmail({
    subject,
    summary: `The security checklist for ${newHire.name} is complete.`,
    details: [
      { label: 'New hire', value: newHire.name },
      { label: 'Title', value: newHire.title },
      ...optionalDetail('Department', newHire.department),
    ],
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      ...finishedEmail(subject, htmlContent),
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send security checklist completion notification:', error)
    return { success: false, error: error.message }
  }
}

export async function sendOnboardingCompletedNotification(userId: string) {
  const onboardingUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      newHireRecord: {
        include: {
          teamLead: {
            select: { email: true, name: true },
          },
        },
      },
    },
  })

  if (!onboardingUser) {
    return { success: false, message: 'User not found' }
  }

  const hrRecipients = await getHrRecipientEmails()
  const recipients = mergeRecipientEmails(
    hrRecipients,
    [onboardingUser.newHireRecord?.teamLead?.email],
    getOnboardingExecutionRecipients()
  )

  if (recipients.length === 0) {
    return { success: false, message: 'No recipients configured for onboarding completion notification' }
  }

  const subject = `Onboarding completed: ${onboardingUser.name}`
  const htmlContent = onboardingEmail({
    subject,
    summary: `${onboardingUser.name} has finished onboarding.`,
    details: [
      { label: 'Name', value: onboardingUser.name },
      ...optionalDetail('Email', onboardingUser.email),
      ...optionalDetail('Department', onboardingUser.department),
      ...optionalDetail('Team lead', onboardingUser.newHireRecord?.teamLead?.name),
    ],
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      ...finishedEmail(subject, htmlContent),
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send onboarding completed notification:', error)
    return { success: false, error: error.message }
  }
}

/** Goes to HR at every failAlertThreshold failed attempts. Never carries the hire's answers. */
export async function sendQuizFailAlert(userId: string, failedCount: number) {
  const hire = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, department: true },
  })

  if (!hire) {
    return { success: false, message: 'User not found' }
  }

  const recipients = mergeRecipientEmails(await getHrRecipientEmails())

  if (recipients.length === 0) {
    return { success: false, message: 'No recipients configured for quiz fail alert' }
  }

  const subject = `Culture quiz: ${hire.name} has failed ${failedCount} times`
  const htmlContent = onboardingEmail({
    subject,
    summary: `Please arrange a short conversation with ${hire.name} about the culture quiz.`,
    details: [
      { label: 'Name', value: hire.name },
      ...optionalDetail('Email', hire.email),
      ...optionalDetail('Department', hire.department),
      { label: 'Failed attempts', value: String(failedCount) },
    ],
    after: 'Retakes stay open, so nothing is blocked while you talk.',
  })

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      ...finishedEmail(subject, htmlContent),
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send quiz fail alert:', error)
    return { success: false, error: error.message }
  }
}

function getLeavePageUrl() {
  return compassUrl('/leave')
}

/**
 * Partners, matched on job title.
 *
 * There is no PARTNER role, and the titles in use are "Partner", "Junior Partner"
 * and "Principal and Junior Partner", so this is a contains match. Deliberately
 * separate from isPartnerReportExcluded in evaluation-profile-rules, which matches
 * "partner" exactly because it governs who is excluded from evaluations -- widening
 * that rule would quietly change who gets evaluated.
 */
async function getPartnerRecipientEmails() {
  const partners = await prisma.user.findMany({
    where: {
      position: { contains: 'partner', mode: 'insensitive' },
      email: { not: null },
    },
    select: { email: true },
  })

  return partners.map((u) => u.email).filter(Boolean) as string[]
}

/** HR, Partners and Execution are copied on every public holiday notice. */
async function getHolidayCcEmails() {
  const [hr, partners, execution] = await Promise.all([
    getHrRecipientEmails(),
    getPartnerRecipientEmails(),
    getExecutionRecipientEmails(),
  ])

  return mergeRecipientEmails(hr, partners, execution)
}

type HolidayForEmail = {
  id: string
  name: string
  holidayDate: Date
  teamTags: TeamTag[]
}

type HolidayPlanEntry = { team: string; teamLabel: string; recipients: number; holidays: string[] }

export type HolidayMailResult = {
  success: true
  dryRun: boolean
  scope: 'monthly' | 'new'
  label: string
  month?: string
  holidays: number
  sent: number
  announced: number
  ccCount: number
  plan: HolidayPlanEntry[]
  skipped: string[]
}

/**
 * Mail a set of holidays to the teams that observe them, one email per team.
 *
 * One mail per team rather than per holiday, so people get a single view instead of
 * scattered nudges. Only teams tagged on a holiday hear about it -- telling the
 * Colombia team about Eid is the noise that tagging exists to remove. A user carries
 * one team tag, so nobody is mailed twice.
 *
 * People with no team tag are not notified: there is no way to tell which holidays
 * apply to them.
 *
 * Holidays that reached every team observing them are stamped `notifiedAt`, which is
 * what lets a later ad-hoc send skip them instead of re-announcing the whole month.
 */
async function deliverHolidayEmails({
  holidays,
  scope,
  label,
  dryRun,
}: {
  holidays: HolidayForEmail[]
  scope: 'monthly' | 'new'
  label: string
  dryRun: boolean
}): Promise<Omit<HolidayMailResult, 'month'>> {
  const empty: Omit<HolidayMailResult, 'month'> = {
    success: true,
    dryRun,
    scope,
    label,
    holidays: 0,
    sent: 0,
    announced: 0,
    ccCount: 0,
    plan: [],
    skipped: [],
  }

  // Nothing to say sends nothing at all, rather than telling everyone there is
  // nothing to tell them.
  if (holidays.length === 0) {
    return empty
  }

  const isNew = scope === 'new'
  const teams = await loadTeamCatalog()
  const labelOf = (team: TeamTag) => teamLabel(teams, team)
  const byTeam = groupHolidaysByTeam(holidays, teams.all)
  const ccEmails = await getHolidayCcEmails()
  const skipped: string[] = []
  const plan: HolidayPlanEntry[] = []
  // Teams whose email actually failed. A team with nobody tagged is not in here --
  // see holidayIdsFullyDelivered for why that distinction matters.
  const failedTeams = new Set<TeamTag>()
  let sent = 0

  const formatDay = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      // A new-holiday announcement can span months, so it carries the year; the
      // monthly digest already names its month in the heading.
      ...(isNew ? { year: 'numeric' as const } : {}),
      timeZone: 'UTC',
    }).format(date)

  for (const [team, teamHolidays] of byTeam.entries()) {
    const recipients = await prisma.user.findMany({
      where: { teamTag: team, email: { not: null } },
      select: { email: true },
    })
    const to = mergeRecipientEmails(recipients.map((r) => r.email))

    if (to.length === 0) {
      skipped.push(`${labelOf(team)}: nobody tagged`)
      continue
    }

    plan.push({
      team,
      teamLabel: labelOf(team),
      recipients: to.length,
      holidays: teamHolidays.map((holiday) => holiday.name),
    })

    // A dry run reports exactly what a real run would send, so the confirmation
    // shown to HR is built from the same code path that does the sending.
    if (dryRun) continue

    const count = teamHolidays.length
    const teamName = labelOf(team)
    // The team is always named: people in other countries work as usual.
    const subject = isNew
      ? count === 1
        ? `Public holiday for the ${teamName}: ${teamHolidays[0].name}, ${emailDay(teamHolidays[0].holidayDate)}`
        : `${count} new public holidays for the ${teamName}`
      : `Public holidays in ${label} for the ${teamName}`
    const intro = isNew
      ? `${count === 1 ? 'A new public holiday has' : `${count} new public holidays have`} been added to the calendar for the ${teamName}. It won’t count as leave.`
      : `${count === 1 ? 'There is 1 public holiday' : `There are ${count} public holidays`} for the ${teamName} this month.`

    const html = renderCompassEmail({
      subject,
      preview: `The ${teamName} is off. Plan deadlines and handovers around ${count === 1 ? 'this date' : 'these dates'}.`,
      section: TIME_OFF,
      banner: { tone: 'info', text: `Public holiday · ${teamName}` },
      name: null,
      paragraphs: [intro],
      details: teamHolidays.map((holiday) => ({ label: formatDay(holiday.holidayDate), value: holiday.name })),
      button: { label: 'See the calendar', url: compassUrl('/leave') },
      after: isNew
        ? 'A calendar invite has been sent separately. Please plan any deadlines or handovers around these dates.'
        : 'Please plan any deadlines or handovers around these dates.',
      reason: `You got this because you are on the ${teamName}.`,
    })

    try {
      await transporter.sendMail({
        from: `P21 Compass <${FROM_EMAIL}>`,
        to: to.join(', '),
        cc: ccEmails.length > 0 ? ccEmails.join(', ') : undefined,
        subject,
        ...finishedEmail(subject, html),
      })
      sent++
    } catch (error) {
      console.error(`Failed to send holiday email to ${labelOf(team)}:`, error)
      skipped.push(`${labelOf(team)}: send failed`)
      failedTeams.add(team)
    }
  }

  let announced = 0
  if (!dryRun) {
    const deliveredIds = holidayIdsFullyDelivered(holidays, failedTeams, teams.all)
    if (deliveredIds.length > 0) {
      // `notifiedAt: null` keeps the first announcement's timestamp rather than
      // overwriting it every time the monthly digest re-lists the same holiday.
      const marked = await prisma.payrollPublicHoliday.updateMany({
        where: { id: { in: deliveredIds }, notifiedAt: null },
        data: { notifiedAt: new Date() },
      })
      announced = marked.count
    }
  }

  return {
    success: true,
    dryRun,
    scope,
    label,
    holidays: holidays.length,
    sent,
    announced,
    ccCount: ccEmails.length,
    plan,
    skipped,
  }
}

/**
 * The month's public holidays, sent to each team at the start of the month.
 *
 * Always the whole month, announced or not: this is a planning view, so a holiday
 * already announced ad hoc last month still belongs in it.
 */
export async function sendMonthlyPublicHolidayDigest(
  reference: Date = new Date(),
  options: { dryRun?: boolean } = {}
): Promise<HolidayMailResult> {
  const { dryRun = false } = options
  const { start, end } = monthRangeUtc(reference)

  const holidays = await prisma.payrollPublicHoliday.findMany({
    where: { holidayDate: { gte: start, lte: end } },
    orderBy: { holidayDate: 'asc' },
  })

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(start)

  const result = await deliverHolidayEmails({
    holidays,
    scope: 'monthly',
    label: monthLabel,
    dryRun,
  })

  return { ...result, month: monthLabel }
}

/**
 * Only the holidays nobody has been told about yet.
 *
 * This is what HR presses after adding a holiday mid-month. Scoped by announcement
 * rather than by month, so a holiday added for a future month is picked up too, and a
 * month that has already gone out is not mailed a second time.
 *
 * Holidays already past are excluded: announcing a day off that has been and gone
 * helps nobody, and the monthly digest covered it at the time.
 */
export async function sendNewPublicHolidayAnnouncement(
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<HolidayMailResult> {
  const { dryRun = false, now = new Date() } = options

  const today = new Date(now)
  today.setUTCHours(0, 0, 0, 0)

  const holidays = await prisma.payrollPublicHoliday.findMany({
    where: { notifiedAt: null, holidayDate: { gte: today } },
    orderBy: { holidayDate: 'asc' },
  })

  return deliverHolidayEmails({
    holidays,
    scope: 'new',
    label: 'newly added holidays',
    dryRun,
  })
}

/**
 * Announce specific holidays, whether or not they have been announced before.
 *
 * The precise counterpart to the bulk send: HR names the holiday and only the teams
 * observing it are mailed. This is what covers a holiday whose announced state is
 * wrong or unknown -- including everything that predates `notifiedAt`, all of which
 * the backfill marked announced rather than guessing.
 */
export async function sendPublicHolidayAnnouncementFor(
  holidayIds: string[],
  options: { dryRun?: boolean } = {}
): Promise<HolidayMailResult> {
  const { dryRun = false } = options

  const holidays =
    holidayIds.length > 0
      ? await prisma.payrollPublicHoliday.findMany({
          where: { id: { in: holidayIds } },
          orderBy: { holidayDate: 'asc' },
        })
      : []

  return deliverHolidayEmails({
    holidays,
    scope: 'new',
    label: 'selected holidays',
    dryRun,
  })
}

/**
 * Tell HR that a client manager wants their project roster changed.
 *
 * The request is already stored before this runs, so a mail failure costs the
 * notification but not the request -- HR still finds it in the admin queue.
 */
export async function sendRosterChangeRequestNotification(requestId: string) {
  const request = await prisma.clientRosterRequest.findUnique({
    where: { id: requestId },
    include: {
      client: { select: { name: true } },
      requestedBy: { select: { name: true, email: true } },
      items: { include: { user: { select: { name: true } } } },
    },
  })

  if (!request) return { success: false, message: 'Roster request not found' }

  const hrEmails = await getHrRecipientEmails()
  const fallbackRecipients = parseRecipientList(
    process.env.CLIENTELE_FALLBACK_RECIPIENTS || 'hr@plutus21.com'
  )
  const recipients = mergeRecipientEmails(hrEmails, fallbackRecipients)

  if (recipients.length === 0) {
    return { success: false, message: 'No HR recipients configured' }
  }

  const additions = request.items.filter((item) => item.action === 'ADD')
  const removals = request.items.filter((item) => item.action === 'REMOVE')

  const listBlock = (title: string, items: typeof request.items) =>
    items.length === 0
      ? ''
      : `<p style="margin: 12px 0 4px; font-weight: 600; color: #1E293B;">${title}</p>
         <ul style="margin: 0; padding-left: 20px; color: #334155;">
           ${items
             .map(
               (item) =>
                 `<li>${escapeHtml(item.user.name)}${
                   item.role ? ` <span style="color:#64748B;">(as ${escapeHtml(item.role.toLowerCase())})</span>` : ''
                 }</li>`
             )
             .join('')}
         </ul>`

  const subject = `Roster change requested: ${request.client.name}`
  const html = renderCompassEmail({
    subject,
    section: 'Projects',
    name: null,
    paragraphs: [`${request.requestedBy.name} has asked for changes to the project roster for ${request.client.name}.`],
    blockHtml: `${listBlock('Add', additions)}${listBlock('Remove', removals)}`,
    quote: request.note ? { label: `Note from ${request.requestedBy.name}`, text: request.note } : undefined,
    button: { label: 'Open clients', url: compassUrl('/admin/clients') },
    after: 'Apply these changes in Admin, Clients. The request stays pending there until it is marked done.',
    reason: 'You got this because you manage client rosters.',
  })

  try {
    await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      // So HR can reply straight to the manager who asked.
      replyTo: request.requestedBy.email || undefined,
      subject,
      ...finishedEmail(subject, html),
    })
    return { success: true, message: `Sent to ${recipients.length} recipients` }
  } catch (error) {
    console.error('Failed to send roster change request notification:', error)
    return { success: false, message: 'Failed to send notification' }
  }
}

// Notify the applicant's team lead(s) that a transition plan was submitted for review.
export async function sendTransitionPlanSubmittedNotification(requestId: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: true },
  })
  if (!leaveRequest) return { success: false, message: 'Leave request not found' }

  const leadMappings = await prisma.evaluatorMapping.findMany({
    where: { evaluateeId: leaveRequest.employeeId, relationshipType: 'TEAM_LEAD' },
    select: { evaluatorId: true },
  })
  const leads = await prisma.user.findMany({
    where: { id: { in: leadMappings.map((m) => m.evaluatorId) }, email: { not: null } },
    select: { name: true, email: true },
  })
  const recipients = leads.map((l) => l.email).filter(Boolean) as string[]

  if (recipients.length === 0) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_SUBMITTED',
      status: 'SKIPPED',
      recipients: [],
      subject: null,
      metadata: { reason: 'No team lead email' },
    })
    return { success: false, message: 'No team lead email' }
  }

  const leavePageUrl = getLeavePageUrl()
  const rangeLabel = emailRange(new Date(leaveRequest.startDate), new Date(leaveRequest.endDate))
  const subject = `Handover from ${leaveRequest.employee.name} for ${rangeLabel}`
  const html = renderCompassEmail({
    subject,
    preview: 'Review the handover before the leave starts.',
    section: TIME_OFF,
    name: null,
    paragraphs: [
      `${leaveRequest.employee.name} submitted a transition plan for their leave, ${rangeLabel}.`,
      'Please review the handover tasks. If anything needs changing, disapprove it and they will be asked to revise it.',
    ],
    button: { label: 'Review handover', url: getLeaveRequestUrl(requestId) || leavePageUrl },
    reason: `You got this because you lead ${leaveRequest.employee.name}.`,
  })

  try {
    const info = await transporter.sendMail({ from: `P21 Compass <${FROM_EMAIL}>`, to: recipients, subject, ...finishedEmail(subject, html) })
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_SUBMITTED',
      status: 'SUCCESS',
      recipients,
      subject,
      providerMessageId: info.messageId || null,
    })
    return { success: true }
  } catch (error) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_SUBMITTED',
      status: 'FAILED',
      recipients,
      subject,
      error,
    })
    return { success: false, message: 'Failed to notify team lead' }
  }
}

// Notify the applicant that their team lead disapproved the transition plan.
export async function sendTransitionPlanDisapprovedNotification(requestId: string, reason: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: true },
  })
  if (!leaveRequest) return { success: false, message: 'Leave request not found' }

  const to = leaveRequest.employee.email
  if (!to) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_DISAPPROVED',
      status: 'SKIPPED',
      recipients: [],
      subject: null,
      metadata: { reason: 'Employee email not found' },
    })
    return { success: false, message: 'Employee email not found' }
  }

  const leavePageUrl = getLeavePageUrl()
  const rangeLabel = emailRange(new Date(leaveRequest.startDate), new Date(leaveRequest.endDate))
  const subject = `Your handover needs changes: ${rangeLabel}`
  const html = renderCompassEmail({
    subject,
    preview: 'Your lead left a note. Update the plan and send it again.',
    section: TIME_OFF,
    banner: { tone: 'warning', text: 'Changes requested by your lead' },
    name: leaveRequest.employee.name,
    paragraphs: [
      `Your team lead asked for changes to the transition plan for your leave, ${rangeLabel}.`,
      'Please update the plan and submit it again.',
    ],
    quote: { label: 'Reason from your lead', text: reason },
    button: { label: 'Update handover', url: getLeaveRequestUrl(requestId) || leavePageUrl },
    reason: 'You got this because you asked for this leave.',
  })

  try {
    const info = await transporter.sendMail({ from: `P21 Compass <${FROM_EMAIL}>`, to, subject, ...finishedEmail(subject, html) })
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_DISAPPROVED',
      status: 'SUCCESS',
      recipients: [to],
      subject,
      providerMessageId: info.messageId || null,
    })
    return { success: true }
  } catch (error) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_DISAPPROVED',
      status: 'FAILED',
      recipients: [to],
      subject,
      error,
    })
    return { success: false, message: 'Failed to notify applicant' }
  }
}

// Escalate a still-missing transition plan to HR at/after the deadline.
export async function sendTransitionPlanEscalation(requestId: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: true },
  })
  if (!leaveRequest) return { success: false, message: 'Leave request not found' }

  const recipients = await getHrRecipientEmails()
  if (recipients.length === 0) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_ESCALATION',
      status: 'SKIPPED',
      recipients: [],
      subject: null,
      metadata: { reason: 'No HR recipients' },
    })
    return { success: false, message: 'No HR recipients' }
  }

  const leavePageUrl = getLeavePageUrl()
  const rangeLabel = emailRange(new Date(leaveRequest.startDate), new Date(leaveRequest.endDate))
  const subject = `Handover still missing: ${leaveRequest.employee.name}, ${rangeLabel}`
  const html = renderCompassEmail({
    subject,
    preview: 'The deadline has passed. Follow up, or decide whether to cancel the leave.',
    section: TIME_OFF,
    banner: { tone: 'danger', text: 'Handover deadline passed' },
    name: null,
    paragraphs: [
      `${leaveRequest.employee.name} has not submitted a transition plan for their leave, ${rangeLabel}, and the deadline (3 days before the leave) has passed.`,
      'Please follow up with them and decide whether to cancel the leave request.',
    ],
    button: { label: 'Open the request', url: getLeaveRequestUrl(requestId) || leavePageUrl },
    reason: 'You got this because you are in HR.',
  })

  try {
    const info = await transporter.sendMail({ from: `P21 Compass <${FROM_EMAIL}>`, to: recipients, subject, ...finishedEmail(subject, html) })
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_ESCALATION',
      status: 'SUCCESS',
      recipients,
      subject,
      providerMessageId: info.messageId || null,
    })
    return { success: true }
  } catch (error) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_ESCALATION',
      status: 'FAILED',
      recipients,
      subject,
      error,
    })
    return { success: false, message: 'Failed to escalate to HR' }
  }
}

async function getOaRecipientEmails(): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { role: 'OA', email: { not: null } }, select: { email: true } })
  return users.flatMap((user) => (user.email ? [user.email] : []))
}

/** Tells O&A that a hire changed bank or payout details. Carries the person's name only, never the details. */
export async function sendPaymentDetailsUpdatedNotification(personName: string) {
  const recipients = mergeRecipientEmails(await getOaRecipientEmails())
  if (recipients.length === 0) {
    console.error('[academy] no O&A recipients configured for payment details notification')
    return { success: false, message: 'No O&A recipients configured' }
  }
  const subject = `Payment details updated for ${personName}`
  // Names only: no pay, bank or other personal data ever goes in an email.
  const html = renderCompassEmail({
    subject,
    section: ONBOARDING,
    name: null,
    paragraphs: [`${personName} updated their payment details. Open Compass to review them.`],
    button: { label: 'Open payment details', url: compassUrl('/oa/payment-details') },
    reason: 'You got this because you are in Operations and Accounting.',
  })
  try {
    const info = await transporter.sendMail({ from: `P21 Compass <${FROM_EMAIL}>`, to: recipients.join(', '), subject, ...finishedEmail(subject, html) })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error) {
    console.error('Failed to send payment details updated notification')
    return { success: false, error: error instanceof Error ? error.message : 'send failed' }
  }
}

export interface AcademyNotice {
  subject: string
  html: string
}

export interface AcademySendResult {
  success: boolean
  message?: string
}

type AcademyOwnerRole = 'HR' | 'SECURITY' | 'OA' | 'TEAM_LEAD'

/** Plain text goes in; everything shown is escaped here. */
function academyNotice(input: {
  subject: string
  heading: string
  lines: string[]
  list?: string[]
  closing?: string
  linkLabel: string
  path: string
}): AcademyNotice {
  const html = renderCompassEmail({
    subject: input.subject,
    title: input.heading,
    section: 'Onboarding',
    paragraphs: input.lines,
    list: input.list,
    button: { label: input.linkLabel, url: compassUrl(input.path) },
    after: input.closing,
    reason: 'You got this because you are part of an onboarding at Plutus21.',
  })
  return { subject: input.subject, html }
}

export interface AcademyDigestItem {
  title: string
  /** YYYY-MM-DD, as the item stores it. */
  dueDate: string
  overdue: boolean
}

/** Where each owner can clear their tasks. */
function ownerTaskLink(ownerRole: AcademyOwnerRole, newHireId: string): { linkLabel: string; path: string } {
  const id = encodeURIComponent(newHireId)
  switch (ownerRole) {
    case 'HR':
      return { linkLabel: 'Open the tracker', path: '/admin/onboarding/tracker' }
    case 'OA':
      return { linkLabel: 'Open payment details', path: '/oa/payment-details' }
    case 'SECURITY':
      return { linkLabel: 'Open the security checklist', path: `/security/onboarding/${id}` }
    case 'TEAM_LEAD':
      return { linkLabel: 'Open the team lead form', path: `/team-lead-form/${id}` }
  }
}

const digestLine = ({ title, dueDate, overdue }: AcademyDigestItem): string =>
  overdue ? `${title}: was due ${formatAcademyDate(`${dueDate}T00:00:00.000Z`, 'UTC')}` : `${title}: due today`

const moduleCountLabel = (count: number): string => `${count} onboarding module${count === 1 ? '' : 's'}`

/** Every Onboarding Academy notice. Names only: no pay, bank or other personal data. */
export const academyNotices = {
  courseReleased: (name: string): AcademyNotice =>
    academyNotice({
      subject: 'Your onboarding course is ready',
      heading: `Welcome, ${name}`,
      lines: ['Your onboarding course is ready for you in Compass. Start with the first module when you sign in.'],
      linkLabel: 'Open your course',
      path: '/onboarding',
    }),
  assignment: (input: { name: string; title: string; slug: string; inCourse: boolean }): AcademyNotice =>
    academyNotice({
      subject: `A module for you to read: ${input.title}`,
      heading: `Hi ${input.name}`,
      lines: [
        input.inCourse
          ? `Please read this module again: "${input.title}".`
          : `HR has asked you to read "${input.title}" in Compass. It's there whenever you have a few minutes.`,
      ],
      linkLabel: 'Open the module',
      path: `/onboarding/${encodeURIComponent(input.slug)}`,
    }),
  leadInputOverdue: (input: { leadName: string; hireName: string; newHireId: string }): AcademyNotice =>
    academyNotice({
      subject: `${input.hireName} still needs your input`,
      heading: 'Your input is still needed',
      lines: [
        `Hi ${input.leadName}, ${input.hireName}'s role expectations and goals are still waiting on you, and the due date has passed.`,
        'A few minutes from you now will help them settle in well.',
      ],
      linkLabel: 'Add your input',
      path: `/team-lead-form/${encodeURIComponent(input.newHireId)}`,
    }),
  buddy: (input: { buddyName: string; hireName: string }): AcademyNotice =>
    academyNotice({
      subject: `You're ${input.hireName}'s buddy`,
      heading: `You're ${input.hireName}'s buddy`,
      lines: [`Hi ${input.buddyName}, ${input.hireName} joins today and you're their buddy. Please say hello and help them find their feet.`],
      linkLabel: 'Open Compass',
      path: '/',
    }),
  moduleOverdue: (input: { hireName: string; moduleCount: number }): AcademyNotice =>
    academyNotice({
      subject: `You have ${moduleCountLabel(input.moduleCount)} overdue`,
      heading: 'A quick nudge on your onboarding',
      lines: [
        `Hi ${input.hireName}, you have ${moduleCountLabel(input.moduleCount)} past the due date. Please pick up where you left off today.`,
        'If something is in your way, let your team lead or HR know.',
      ],
      linkLabel: 'Open your course',
      path: '/onboarding',
    }),
  checklistDigest: (input: {
    hireName: string
    newHireId: string
    ownerRole: AcademyOwnerRole
    items: readonly AcademyDigestItem[]
  }): AcademyNotice => {
    const count = input.items.length
    return academyNotice({
      subject: `Onboarding tasks for ${input.hireName}`,
      heading: `${count === 1 ? 'An onboarding task is' : 'Onboarding tasks are'} waiting on you`,
      lines: [`You have ${count} open onboarding task${count === 1 ? '' : 's'} for ${input.hireName}:`],
      list: input.items.map(digestLine),
      closing: `Please finish ${count === 1 ? 'it' : 'them'} when you can, so their onboarding stays on track.`,
      ...ownerTaskLink(input.ownerRole, input.newHireId),
    })
  },
  firstPaymentSave: (name: string): AcademyNotice =>
    academyNotice({
      subject: `${name} has added their payment details`,
      heading: 'New payment details',
      lines: [`${name} has added their payment details for the first time. You can review them in Compass.`],
      linkLabel: 'Open payment details',
      path: '/oa/payment-details',
    }),
  paymentSetupDone: (name: string): AcademyNotice =>
    academyNotice({
      subject: `${name} has finished Module 11`,
      heading: 'Module 11 finished',
      lines: [`${name} has finished Module 11, Getting Paid, so their payment details are ready for you.`],
      linkLabel: 'Open payment details',
      path: '/oa/payment-details',
    }),
  linkedinSubmitted: (name: string): AcademyNotice =>
    academyNotice({
      subject: `Please verify ${name}'s LinkedIn link`,
      heading: 'A LinkedIn link to verify',
      lines: [`${name} has added their LinkedIn link. Please check it and verify it in the tracker.`],
      linkLabel: 'Open the tracker',
      path: '/admin/onboarding/tracker',
    }),
}

/** Never throws, and logs no address: the once-only log needs a plain result. */
async function deliverAcademyNotice(
  to: ReadonlyArray<string | null | undefined>,
  notice: AcademyNotice,
  cc: ReadonlyArray<string | null | undefined> = [],
): Promise<AcademySendResult> {
  const recipients = mergeRecipientEmails([...to])
  if (recipients.length === 0) return { success: false, message: 'No recipients' }
  const copied = mergeRecipientEmails([...cc]).filter((email) => !recipients.includes(email))
  try {
    await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      ...(copied.length > 0 ? { cc: copied.join(', ') } : {}),
      subject: notice.subject,
      html: notice.html,
    })
    return { success: true }
  } catch (error) {
    console.error('[academy] notice not delivered', { error: error instanceof Error ? error.name : 'unknown' })
    return { success: false, message: 'Send failed' }
  }
}

export const sendCourseReleasedNotice = (to: string, name: string): Promise<AcademySendResult> =>
  deliverAcademyNotice([to], academyNotices.courseReleased(name))

export const sendAssignmentNotice = (input: {
  to: string
  name: string
  title: string
  slug: string
  inCourse: boolean
}): Promise<AcademySendResult> => deliverAcademyNotice([input.to], academyNotices.assignment(input))

export const sendLeadInputOverdueNotice = (input: {
  to: string
  leadName: string
  hireName: string
  newHireId: string
}): Promise<AcademySendResult> => deliverAcademyNotice([input.to], academyNotices.leadInputOverdue(input))

export const sendBuddyNotice = (input: { to: string; buddyName: string; hireName: string }): Promise<AcademySendResult> =>
  deliverAcademyNotice([input.to], academyNotices.buddy(input))

export const sendModuleOverdueNotice = (input: {
  to: string
  cc: string | null
  hireName: string
  moduleCount: number
}): Promise<AcademySendResult> => deliverAcademyNotice([input.to], academyNotices.moduleOverdue(input), [input.cc])

export const sendChecklistDigestNotice = (input: {
  to: readonly string[]
  hireName: string
  newHireId: string
  ownerRole: AcademyOwnerRole
  items: readonly AcademyDigestItem[]
}): Promise<AcademySendResult> => deliverAcademyNotice(input.to, academyNotices.checklistDigest(input))

export async function sendFirstPaymentSaveNotice(name: string): Promise<AcademySendResult> {
  return deliverAcademyNotice(await getOaRecipientEmails(), academyNotices.firstPaymentSave(name))
}

export async function sendPaymentSetupDoneNotice(name: string): Promise<AcademySendResult> {
  return deliverAcademyNotice(await getOaRecipientEmails(), academyNotices.paymentSetupDone(name))
}

export async function sendLinkedinSubmittedNotice(name: string): Promise<AcademySendResult> {
  return deliverAcademyNotice(await getHrRecipientEmails(), academyNotices.linkedinSubmitted(name))
}
