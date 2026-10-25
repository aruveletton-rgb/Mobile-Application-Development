const cardStorage: LocalStorage = new LocalStorage();

@Entry(cardStorage)
@Component
struct CampusCard {
  @LocalStorageProp('title') title: string = '校园服务';
  @LocalStorageProp('subtitle') subtitle: string = '合成通知与日程';
  @LocalStorageProp('status') status: string = '合成演示 · 非真实受理';
  build() {
    Column({ space: 8 }) {
      Text(this.title).fontSize(16).fontWeight(FontWeight.Bold).fontColor('#25303A');
      Text(this.subtitle).fontSize(13).fontColor('#4B5965').maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis });
      Text(this.status).fontSize(10).fontColor('#146551');
    }.width('100%').height('100%').padding(16).backgroundColor('#F2F8F5').alignItems(HorizontalAlign.Start).justifyContent(FlexAlign.Center)
      .onClick(() => { postCardAction(this, { action: 'router', abilityName: 'EntryAbility', params: { fromCard: true } }); });
  }
}
