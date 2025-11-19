// src/lib/money.ts

// Format COP with thousand separators
export const formatCOP = (value: number): string =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)

// Same but including COP symbol
export const formatCOPWithSymbol = (value: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)

// Strip formatting → numeric value
export const parseCOP = (text: string): number =>
  Number(text.replace(/\./g, '').replace(/[^0-9]/g, '')) || 0
