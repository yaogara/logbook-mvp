import { useEffect, useState } from 'react'
import { parseCOP, formatCOP } from '../lib/money'

type Props = {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  className?: string
}

export default function MoneyInput({ value, onChange, placeholder, className = '' }: Props) {
  const [display, setDisplay] = useState(value ? formatCOP(value) : '')

  useEffect(() => {
    setDisplay(value ? formatCOP(value) : '')
  }, [value])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const numeric = parseCOP(raw)
    const formatted = numeric ? formatCOP(numeric) : ''
    setDisplay(formatted)
    onChange(numeric)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      className={`input ${className}`}
      placeholder={placeholder}
      value={display}
      onChange={handleInput}
      onFocus={() => setDisplay(value ? value.toString() : '')}
      onBlur={() => setDisplay(value ? formatCOP(value) : '')}
    />
  )
}
