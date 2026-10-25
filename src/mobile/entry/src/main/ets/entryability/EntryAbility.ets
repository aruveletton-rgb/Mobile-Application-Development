import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { Want } from '@kit.AbilityKit';

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want): void {}

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        console.error(`loadContent failed: ${err.code} ${err.message}`);
      }
    });
  }

  onWindowStageDestroy(): void {}
  onForeground(): void {}
  onBackground(): void {}
}
