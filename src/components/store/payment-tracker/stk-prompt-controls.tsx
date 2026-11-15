'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Clock, RefreshCw, Smartphone } from 'lucide-react'
import { WINDOW_SECONDS, type TrackerFeedback } from './types'

interface StkPromptControlsProps {
  secondsLeft: number
  isFailed: boolean
  isDispatchFailed: boolean
  feedback: TrackerFeedback | null
  phone: string
  editingPhone: boolean
  resendCooldown: number
  isPending: boolean
  onPhoneChange: (val: string) => void
  onToggleEditPhone: (editing: boolean) => void
  onManualCheck: () => void
  onResendStk: () => void
}

export function StkPromptControls({
  secondsLeft,
  isFailed,
  isDispatchFailed,
  feedback,
  phone,
  editingPhone,
  resendCooldown,
  isPending,
  onPhoneChange,
  onToggleEditPhone,
  onManualCheck,
  onResendStk,
}: StkPromptControlsProps) {
  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`
  }

  const progressPct = Math.min(
    100,
    Math.max(0, Math.round((secondsLeft / WINDOW_SECONDS) * 100))
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <Clock size={14} className="text-primary" />
          {secondsLeft > 0 && !isFailed && !isDispatchFailed
            ? 'STK Prompt Window Remaining'
            : 'Ready to Resend STK Push'}
        </span>
        <span
          suppressHydrationWarning
          className={`font-mono text-base font-extrabold ${
            secondsLeft <= 20 || isFailed || isDispatchFailed
              ? 'text-destructive'
              : 'text-primary'
          }`}
        >
          {formatTimer(secondsLeft)}
        </span>
      </div>

      <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 rounded-full ${
            secondsLeft <= 20 || isFailed || isDispatchFailed
              ? 'bg-destructive'
              : 'bg-primary'
          }`}
          style={{ width: `${isFailed || isDispatchFailed ? 0 : progressPct}%` }}
        />
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold ${
            feedback.type === 'error'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary/10 text-primary'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {editingPhone ? (
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="0712 345 678 or 0114 513 647"
            className="h-9 bg-secondary/80 border-none rounded-xl text-xs font-mono"
          />
          <Button
            type="button"
            size="sm"
            disabled={isPending || resendCooldown > 0}
            onClick={onResendStk}
            className="rounded-xl text-xs font-bold shrink-0"
          >
            {resendCooldown > 0 ? `Wait ${resendCooldown}s` : 'Send to New #'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onToggleEditPhone(false)}
            className="rounded-xl text-xs shrink-0"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>
            Phone: <strong className="text-foreground font-mono">+{phone}</strong>
          </span>
          <button
            type="button"
            onClick={() => onToggleEditPhone(true)}
            className="text-primary font-bold hover:underline cursor-pointer"
          >
            Change M-Pesa Number
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
        <Button
          type="button"
          onClick={onManualCheck}
          disabled={isPending}
          className="rounded-xl font-bold text-xs gap-1.5 h-10"
        >
          <RefreshCw size={14} className={isPending ? 'animate-spin' : ''} />
          I Entered My PIN (Verify)
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={onResendStk}
          disabled={isPending || resendCooldown > 0}
          className="rounded-xl font-bold text-xs gap-1.5 h-10"
        >
          <Smartphone size={14} className="text-primary" />
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend M-Pesa Prompt'}
        </Button>
      </div>
    </div>
  )
}