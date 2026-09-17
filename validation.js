import { parseDate, today } from './dates.js';
export class ValidationError extends Error {
  constructor(fields) { super('入力内容を確認してください。'); this.fields = fields; }
}
export function validateBean(input, currentDate = today()) {
  const fields = {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) fields.name = '豆名を入力してください。';
  if (!parseDate(input.roastDate)) fields.roastDate = '正しい焙煎日を入力してください。';
  else if (input.roastDate > currentDate) fields.roastDate = '未来の焙煎日は登録できません。';
  const custom = typeof input.roastCustom === 'string' ? input.roastCustom.trim() : '';
  if (input.roastType === 'scale') {
    if (!Number.isInteger(input.roastValue) || input.roastValue < 1 || input.roastValue > 5) fields.roast = '焙煎度を選んでください。';
  } else if (input.roastType === 'custom') {
    if (!custom) fields.roastCustom = '焙煎度を入力してください。';
  } else fields.roast = '焙煎度を選んでください。';
  if (Object.keys(fields).length) throw new ValidationError(fields);
  return { name, roastDate: input.roastDate, roastType: input.roastType,
    roastValue: input.roastType === 'scale' ? input.roastValue : null,
    roastCustom: input.roastType === 'custom' ? custom : null };
}
export function roastLabel(bean) { return bean.roastType === 'scale' ? `${bean.roastValue} / 5` : bean.roastCustom; }
