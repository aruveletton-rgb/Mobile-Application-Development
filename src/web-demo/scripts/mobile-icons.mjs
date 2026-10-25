import { House, MessagesSquare, LayoutGrid, UserRound, Bell, CalendarDays, Wrench, Search, Ticket, GraduationCap } from 'lucide';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const target = fileURLToPath(new URL('../../mobile/entry/src/main/resources/base/media/', import.meta.url));
mkdirSync(target, { recursive: true });
for (const [name, nodes] of Object.entries({ home: House, chat: MessagesSquare, services: LayoutGrid, profile: UserRound, notice: Bell, schedule: CalendarDays, repair: Wrench, lost: Search, activity: Ticket, campus: GraduationCap })) {
  const shapes = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}/>`).join('');
  writeFileSync(target + name + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#15796e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>\n`);
}
