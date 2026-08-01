export function slugifyId(value: string, fallback: string, maxLength = 72): string {
  const normalized = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return (normalized || fallback).slice(0, maxLength).replace(/-+$/g, '') || fallback
}
