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
export function ageLabel(start, end = today()) {
  if (ageDays(start, end) < 0) return '焙煎日を確認';
  const a = parseDate(start), b = parseDate(end);
  let months = (b.year - a.year) * 12 + b.month - a.month;
  if (b.day < Math.min(a.day, monthDays(b.year, b.month))) months--;
  if (months < 12) {
    const monthIndex = a.year * 12 + a.month - 1 + months;
    const year = Math.floor(monthIndex / 12), month = monthIndex % 12 + 1;
    const anniversary = `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(Math.min(a.day,monthDays(year,month))).padStart(2,'0')}`;
    const days = ageDays(anniversary,end);
    return months ? `${months}か月${days ? `${days}日` : ''}` : `${days}日`;
  }
  const years = Math.floor(months / 12), rest = months % 12;
  return years ? `${years}年${rest ? `${rest}か月` : ''}` : `${rest}か月`;
}
export function dateLabel(value) { return value.replaceAll('-', '/'); }
export function sortBeans(beans, archived = false) {
  return [...beans].sort((a, b) => archived
    ? b.finishedAt.localeCompare(a.finishedAt) || a.id.localeCompare(b.id)
    : a.roastDate.localeCompare(b.roastDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function compactDate(value) { const p=parseDate(value);return `${String(p.year).slice(-2).padStart(2,'0')}/${p.month}/${p.day}`; }
