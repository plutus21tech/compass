'use client'

import { useState, type FormEvent } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { Block } from '@/lib/academy/blocks'
import { formatAcademyDate } from '@/lib/academy/view-labels'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { academyRequest } from '../api'
import type { BlockContext } from '../types'
import { useFieldSave } from './FieldParts'

const ACK_URL = '/api/onboarding/academy/acknowledgements'

type AcknowledgementBlockType = Extract<Block, { type: 'acknowledgement' }>

interface Signature { typedName: string; signedAt: string }

interface SignFormProps {
  timeZone: string | null
  /** Throws to show the server's message in the form. */
  onSign: (typedName: string) => Promise<void>
}

function Signed({ name, date }: { name: string; date: string }) {
  return (
    <p className="flex items-start gap-2 font-medium text-academy-success-on-navy">
      <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        Signed by {name} on {date}
      </span>
    </p>
  )
}

export function SignForm({ timeZone, onSign }: SignFormProps) {
  const { saving, error, run } = useFieldSave()
  const [agreed, setAgreed] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [today] = useState(() => new Date().toISOString())

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await run(() => onSign(typedName))
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label htmlFor="ack-agree" className="flex cursor-pointer items-start gap-3">
        <Checkbox
          id="ack-agree"
          checked={agreed}
          onCheckedChange={(checked) => setAgreed(checked === true)}
          className="mt-0.5 size-5 min-h-5 min-w-5 rounded-md border-white data-[state=checked]:bg-white data-[state=checked]:text-academy-navy focus-visible:ring-2 focus-visible:ring-white"
        />
        <span className="leading-6">I agree to this statement</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="ack-name" className="text-[15px] text-white">
            Your full name
          </Label>
          <Input
            id="ack-name"
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            autoComplete="name"
            required
            className="h-11 rounded-xl border-white bg-white text-academy-navy focus-visible:ring-white/50 md:text-base"
          />
        </div>
        <p className="pb-2.5 text-[15px] tabular-nums">Date: {formatAcademyDate(today, timeZone)}</p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl bg-white px-3 py-2 text-[15px] text-academy-danger">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={saving || !agreed || !typedName.trim()}
        className="h-11 rounded-xl bg-white px-5 text-[15px] text-academy-navy shadow-none hover:bg-academy-blue-tint focus-visible:ring-white/60 focus-visible:ring-offset-academy-navy"
      >
        {saving ? <Loader2 aria-hidden className="animate-spin" /> : null}
        {saving ? 'Signing...' : 'Sign'}
      </Button>
    </form>
  )
}

interface AcknowledgementBlockProps {
  block: AcknowledgementBlockType
  context: BlockContext
}

export function AcknowledgementBlock({ block, context }: AcknowledgementBlockProps) {
  const { view, readOnly, onSaved } = context
  const timeZone = view.callTimes.timeZone
  const [signedNow, setSignedNow] = useState<Signature | null>(null)
  const signed = view.securityAcknowledgement ?? signedNow

  const sign = async (typedName: string) => {
    const body = { kind: block.kind, typedName, moduleSlug: view.slug }
    const { signedAt } = await academyRequest<{ signedAt: string }>(ACK_URL, 'POST', body)
    setSignedNow({ typedName, signedAt })
    onSaved()
  }

  return (
    <section className="space-y-4 rounded-2xl bg-academy-navy p-5 text-white sm:p-6">
      <h2 className="text-lg font-semibold">{block.statement}</h2>
      {signed ? <Signed name={signed.typedName} date={formatAcademyDate(signed.signedAt, timeZone)} /> : null}
      {!signed && !readOnly ? <SignForm timeZone={timeZone} onSign={sign} /> : null}
    </section>
  )
}
