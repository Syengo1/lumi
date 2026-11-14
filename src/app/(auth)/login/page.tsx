'use client'

import { useState } from 'react'
import { login } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const result = await login(formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    }
  }

  const inputStyle =
    'h-11 border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 transition-all rounded-xl'

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Storefront
        </Link>

        <Card className="w-full border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl">
          <CardHeader className="space-y-2 pb-4 text-center pt-8">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
              <Lock className="text-primary w-6 h-6" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Admin Portal</CardTitle>
            <CardDescription>
              Sign in to manage inventory and branding for Luminous Drip Line.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3.5 bg-destructive/10 text-destructive text-sm rounded-xl font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground ml-1">Email Address</label>
                <Input
                  type="email"
                  name="email"
                  placeholder="admin@luminousdrip.com"
                  required
                  autoComplete="email"
                  className={inputStyle}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground ml-1">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className={`${inputStyle} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full h-11 rounded-xl font-semibold shadow-md shadow-primary/20 mt-2"
                disabled={isLoading}
              >
                {isLoading ? 'Authenticating...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}