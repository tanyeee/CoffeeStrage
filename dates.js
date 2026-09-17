const DAY = 86400000;
export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays(year, month)) return null;
  return { year, month, day };
}
export function monthDays(year, month) {
  return [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function today(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function dayNumber(value) {
  const p = parseDate(value);
  if (!p) throw new Error('日付が正しくありません。');
  const date = new Date(0);
  date.setUTCFullYear(p.year, p.month - 1, p.day);
  return date.getTime() / DAY;
}
export function ageDays(start, end = today()) { return dayNumber(end) - dayNumber(start); }
function addMonths(p, months) {
  const index = p.year * 12 + p.month - 1 + months;
  const year = Math.floor(index / 12), month = index % 12 + 1;
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(Math.min(p.day,monthDays(year,month))).padStart(2,'0')}`;
}
// Completed calendar months; a missing day (e.g. 31st) falls back to the month end.
export function elapsedMonths(start, end = today()) {
  if (ageDays(start, end) < 0) return -1;
  const a = parseDate(start), b = parseDate(end);
  const months = (b.year - a.year) * 12 + b.month - a.month;
  return b.day < Math.min(a.day, monthDays(b.year, b.month)) ? months - 1 : months;
}
// Under 1 month: days. Under 1 year: months floored to 0.1 (7.5ヶ月). Otherwise: 1年8ヶ月.
export function ageLabel(start, end = today()) {
  const months = elapsedMonths(start, end);
  if (months < 0) return '焙煎日を確認';
  if (months === 0) return `${ageDays(start, end)}日`;
  if (months < 12) {
    const a = parseDate(start), anniversary = addMonths(a, months);
    const tenths = months * 10 + Math.floor(ageDays(anniversary, end) * 10 / ageDays(anniversary, addMonths(a, months + 1)));
    return `${(tenths / 10).toFixed(1)}ヶ月`;
  }
  const years = Math.floor(months / 12), rest = months % 12;
  return `${years}年${rest ? `${rest}ヶ月` : ''}`;
}
export function dateLabel(value) { return value.replaceAll('-', '/'); }
export function sortBeans(beans, archived = false) {
  return [...beans].sort((a, b) => archived
    ? b.finishedAt.localeCompare(a.finishedAt) || a.id.localeCompare(b.id)
    : a.roastDate.localeCompare(b.roastDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function compactDate(value) { const p=parseDate(value);return `${String(p.year).slice(-2).padStart(2,'0')}/${p.month}/${p.day}`; }
