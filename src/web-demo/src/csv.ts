import Papa from 'papaparse';
import type { ScheduleItem } from './types';

export function parseScheduleCsv(text: string): ScheduleItem[] {
  if (new TextEncoder().encode(text).length > 256_000) throw new Error('CSV 最大 256 KB');
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: s => s.trim() });
  const required = ['title', 'kind', 'location', 'startsAt', 'endsAt'];
  if (parsed.errors.length) throw new Error(`CSV 格式错误：${parsed.errors[0].message}`);
  if (parsed.meta.fields?.length !== 5 || required.some(key => !parsed.meta.fields?.includes(key))) throw new Error('列必须为 title,kind,location,startsAt,endsAt（不可重复或添加其他列）');
  if (!parsed.data.length || parsed.data.length > 500) throw new Error('CSV 需要 1–500 条日程');
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
  const validTime = (value: string) => {
    if (!iso.test(value) || !Number.isFinite(Date.parse(value))) return false;
    const day = value.slice(0, 10), utcDay = new Date(`${day}T00:00:00Z`);
    return utcDay.toISOString().slice(0, 10) === day;
  };
  const seen = new Set<string>();
  return parsed.data.map((row, index) => {
    const values = required.map(key => row[key]?.trim() ?? '');
    const [title, kind, location, startsAt, endsAt] = values;
    if (values.some(s => !s || s.length > 200) || !['course', 'exam'].includes(kind) || !validTime(startsAt) || !validTime(endsAt) || Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error(`第 ${index + 2} 行：字段、kind 或时间无效（结束必须晚于开始，时间须含时区）`);
    const signature = JSON.stringify(values);
    if (seen.has(signature)) throw new Error(`第 ${index + 2} 行：重复日程`);
    seen.add(signature);
    return { scheduleId: `personal-${crypto.randomUUID()}`, title, kind: kind as 'course' | 'exam', location, startsAt, endsAt, synthetic: false, localPersonal: true };
  });
}
