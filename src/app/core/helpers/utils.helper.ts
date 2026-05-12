/**
 * Helper genérico de ejemplo.
 * Principio SOLID (S): Funciones puras con responsabilidad única.
 */

/**
 * Formatea una fecha al formato local (dd/mm/yyyy).
 */
export function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Trunca un texto a un máximo de caracteres.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Genera las iniciales de un nombre completo.
 */
export function getInitials(fullName: string): string {
  if (!fullName) return 'U';
  const parts = fullName.trim().split(/\s+/).filter(p => p.length > 0);
  return parts
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';
}
