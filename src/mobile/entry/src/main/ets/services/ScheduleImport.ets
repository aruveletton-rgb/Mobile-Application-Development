import { picker, fileIo } from '@kit.CoreFileKit';
import { common } from '@kit.AbilityKit';
import { Schedule } from '../model/Models';
import { parseCsv } from './ScheduleCsv';

export async function chooseCsv(context: common.UIAbilityContext): Promise<Schedule[]> {
  const selector = new picker.DocumentViewPicker(context);
  const options = new picker.DocumentSelectOptions(); options.maxSelectNumber = 1; options.fileSuffixFilters = ['CSV|.csv'];
  const uris = await selector.select(options); if (uris.length === 0) throw new Error('未选择文件');
  const file = await fileIo.open(uris[0], fileIo.OpenMode.READ_ONLY);
  try { const stat = await fileIo.stat(file.fd); if (stat.size > 256000) throw new Error('CSV 最大 256 KB'); return parseCsv(await fileIo.readText(uris[0])); }
  finally { await fileIo.close(file); }
}
