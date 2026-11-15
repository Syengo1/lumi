'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound, ChevronDown, ChevronUp } from 'lucide-react'

interface ManualPaybillFallbackProps {
  orderNumber: string
  totalAmount: number
  isPending: boolean
  onSubmitReceipt: (code: string) => void
}

export function ManualPaybillFallback({
  orderNumber,
  totalAmount,
  isPending,
  onSubmitReceipt,
}: ManualPaybillFallbackProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [receiptCode, setReceiptCode] = useState('')

  const cleanAccountRef =
    orderNumber.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'LUMINOUS'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (receiptCode.trim().length < 10) return
    onSubmitReceipt(receiptCode)
  }

  return (
    <div className="pt-2 border-t border-border/50 space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between text-xs font-bold text-primary hover:underline cursor-pointer py-1"
      >
        <span className="flex items-center gap-1.5">
          <KeyRound size={14} />
          Didn&apos;t get the pop-up? Pay via *334# &amp; Enter Receipt Code
        </span>
        {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {isOpen && (
        <form
          onSubmit={handleSubmit}
          className="p-3.5 rounded-xl bg-secondary/60 space-y-3 text-xs"
        >
          <div className="space-y-1 text-muted-foreground">
            <p className="font-bold text-foreground">
              Manual Lipa na M-Pesa (If SIM Toolkit pop-up is blocked):
            </p>
            <p>
              1. Dial <strong>*334#</strong> or open <strong>M-Pesa App / SIM Toolkit</strong>
            </p>
            <p>
              2. Select <strong>Lipa na M-Pesa &rarr; Pay Bill</strong> • Business No:{' '}
              <strong className="font-mono text-foreground">174379</strong> • Account:{' '}
              <strong className="font-mono text-foreground">{cleanAccountRef}</strong>
            </p>
            <p>
              3. Enter Amount:{' '}
              <strong className="text-primary">
                KES {Number(totalAmount).toLocaleString()}
              </strong>{' '}
              and paste your 10-character M-Pesa SMS code below:
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              value={receiptCode}
              onChange={(e) => setReceiptCode(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="e.g. SJK8912XYZ"
              className="h-9 bg-card border-none rounded-xl text-xs font-mono uppercase"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isPending || receiptCode.trim().length < 10}
              className="rounded-xl text-xs font-bold shrink-0"
            >
              Verify Code
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}