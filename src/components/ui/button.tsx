import * as React from 'react'
type ButtonVariant = 'default'|'outline'|'ghost'|'success'|'danger'
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant, size?: 'xs'|'sm'|'md'|'lg' }
export const Button = React.forwardRef<HTMLButtonElement, Props>(function Button({ className='', variant='default', size='md', ...props }, ref) {
  const base = 'rounded-2xl px-4 py-2 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50'
  const variants: Record<ButtonVariant,string> = {
    default:'bg-sky-600 text-white hover:bg-sky-700',
    outline:'border border-slate-300 bg-white hover:bg-slate-50',
    ghost:'hover:bg-slate-100',
    success:'bg-green-600 text-white hover:bg-green-700',
    danger:'bg-red-600 text-white hover:bg-red-700'
  }
  const sizes: Record<NonNullable<Props['size']>,string> = {
    xs:'text-[11px] leading-tight px-2 py-0.5',
    sm:'text-sm px-3 py-1.5',
    md:'',
    lg:'text-lg px-5 py-3'
  }
  return <button ref={ref} className={[base, variants[variant], sizes[size], className].join(' ')} {...props} />
})
