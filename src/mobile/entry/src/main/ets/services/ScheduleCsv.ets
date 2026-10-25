import Papa from '../vendor/papaparse';
import { Schedule, makeId } from '../model/Models';
export function parseCsv(text: string): Schedule[] {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (parsed.errors.length > 0) throw new Error(`CSV 格式错误: ${parsed.errors[0].message}`);
  const header = parsed.data.shift();
  if (!header || header.join(',') !== 'title,kind,location,startsAt,endsAt') throw new Error('列顺序必须为 title,kind,location,startsAt,endsAt');
  if (parsed.data.length < 1 || parsed.data.length > 500) throw new Error('日程数量须为 1–500');
  const seen: string[] = [];
  return parsed.data.map((row: string[], index: number): Schedule => {
    if (row.length !== 5) throw new Error(`第${index + 2}行列数无效`);
    const title = row[0].trim(), kind = row[1].trim(), location = row[2].trim(), startsAt = row[3].trim(), endsAt = row[4].trim();
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
    if (!title || !location || title.length > 200 || location.length > 200 || !['course', 'exam'].includes(kind) || !iso.test(startsAt) || !iso.test(endsAt) || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error(`第${index + 2}行字段或时间无效`);
    if (new Date(startsAt.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== startsAt.slice(0, 10) || new Date(endsAt.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== endsAt.slice(0, 10)) throw new Error('日历日期无效');
    const signature = row.join('|'); if (seen.includes(signature)) throw new Error('CSV 有重复日程'); seen.push(signature);
    return { scheduleId: makeId('personal'), title, kind, location, startsAt, endsAt, personal: true };
  });
}
