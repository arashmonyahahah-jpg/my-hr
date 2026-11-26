// Date formatting for Jalali (Persian) and Gregorian calendars using the built-in Intl API.
export function fmt(value, calendar, lang, withTime = false) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const jalali = calendar === 'jalali';
  const locale = lang === 'fa'
    ? `fa-IR-u-ca-${jalali ? 'persian' : 'gregory'}`
    : `en-US-u-ca-${jalali ? 'persian' : 'gregory'}`;
  const opts = withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' };
  return new Intl.DateTimeFormat(locale, opts).format(d);
}

export const isOverdue = (task, now = Date.now()) =>
  !!task.deadline && !['done', 'cancelled'].includes(task.status) && new Date(task.deadline).getTime() < now;
