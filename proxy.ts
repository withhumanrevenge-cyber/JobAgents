import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)

  // Client components can't read Vercel's geo header, so pass the pricing currency on as a
  // cookie (the billing panel asks the backend for prices in it).
  const country = (request.headers.get('x-vercel-ip-country') || request.headers.get('cf-ipcountry') || '').toUpperCase()
  const currency = country === 'IN' ? 'INR' : 'USD'
  if (country && request.cookies.get('ja_currency')?.value !== currency) {
    response.cookies.set('ja_currency', currency, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 })
  }
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
