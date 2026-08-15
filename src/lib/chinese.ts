import * as OpenCC from "opencc-js";

// Cached converter
let s2twConverter: ((text: string) => string) | null = null;

export function getS2TWConverter() {
  if (!s2twConverter) {
    s2twConverter = OpenCC.Converter({ from: "cn", to: "twp" });
  }
  return s2twConverter;
}

/**
 * Converts Simplified Chinese text to Traditional Chinese (Taiwan phrase standard)
 */
export function convertToTraditional(text: string): string {
  if (!text) return "";
  const converter = getS2TWConverter();
  return converter(text);
}

// 200+ high frequency Simplified-only characters (never used in Traditional Chinese)
const SIMPLIFIED_CHARS_REGEX =
  /[说这们时后么样体国发对来为动经书点进过头没现开门间机长面当电车两关实学问见听写给应带结总爱与变传奇修仙韩录内从让还别节双乐东买乱争产仅众伤传体余内册写击别到制刷券刺创剧刘剑划办功务劳动医单卖卫变台听员告呼图圆圈场坏坚处备头奇奖妇妈妹姐始娘婚妇婴学安宝实客家导将小尚尘就尽局屡层岗岛峡师带广库应底庞度座庭康开异张弯弱强弹归录彻往径很律得微德心忆志忙忠忧快念怎怒怕思急总恋恶悔想意感愛態慢慶憐應戈战戏户手扫拉扩拔拜持拦拧拨拾挂指按挺挫挡挤挣挥捞损换捣推损摇搜搞搭撕播揽支收故效救敏教敕敢散文断斯无时显晕晚暂晴暗暴月机杀杂权条来极构枪柜某枯标栈树栗校株样核根格梁梦棋森楚楼概榄榻樟横树桥橙橘机欠欧欢步武死残段毁殴母每毒毕水永汉江污汝池汤汪汰汽沃沈沉沐沙油治沼沿泉泊法沫河波泣注泥泰泳洋洗洛洞津流活浅济测浑浓海涂涛润液涵凉淘深混淹添清渐渡渴渣温港溃满源溪湿演汉漆漫渐漂漏演漪漫潇潮澎澜澡瀚火灯灰灵灶灿炎炒炖炭炮炸炳炼烈烦烧热烹烽焕焊烦熄焦焰然然照煤煅煨煊煞熊煽熄熏熔熟热熠燃熬燎磷烧爆爱爷父片牌牛牡牢牧物牲牵特犀狂狗狐狗狠狡独狸狼猎猫猪猴猬猕犯王环玷现珀玲珊珍珠班珪球理琉琪琴瑞瑙瑗瑚璀璃瓜瓣瓦瓶瓷产用申由男町畅界留略畴疏痘痛痣疾痂疴病症痛痴瘤瘫瘦癞白百皮盘盆益盯目盲直省相盼眨看眉看真眯眶睁眩眼着睡睬瞄瞩瞻盲矢知短石研破砰砺硝碎硬砸碍碟碰磁磨磷磐碑碾社祝祖神祠祥祷票礼禧离秀私秋科秒秘租称秸移秽税种稀稻稼穗穆秋穰穿空穷窑窝立竖站竞竞笃竿笛符笨第笔筑筝等筐筒答筵筷箍简箫篑籍签管箱篇簿簧米类粗粉粘粝粮粹精糟糯团糖糙糕系索紧红纤约级纪纫纪纫纯纳纽纸线结练组细终经结给绞络统绢绣继续综维缆缎缕编缚练缆绳缠续缺网罚罘罟群罪置罩罗罚署羊美羔羞羚群羽羿翁翅翊翌翔翡篇翩翼耀老者考耍耐耕耗耿耽聊聋职联圣聘聚聪聂耸肆耻肃育肩肯肋股肢胀肤育朋肥服肠股肢肤服股肢肪肱服肴肯肢脱腿腰肠腮腥膜膨膳臆腹臃臆臣卧临自臭至致臻臼舍舒舟航般舰舱船艨良艰色艳花芳芹芽芝芥芦苇劳芭芬芮花芳芸芳苦苗苑若英苦苯苹果茂范苞苟茄苹若苔茜茵茧茶草荒荐荞荟荠荤荆荳荷荸莆荼荽草荧茜荒荔荭荷荣菇菊菌菽菜菠菩华萎菱菜萃菲萌萍著萱落葡萄葵苇葬董葭葱蒜蒂蒙蒲蒸蓬莲葵蓼蒲蒸蒙蓉蓑蔗暮蔚莲荫蔡薄蘧蘑藻兰蘼虎虚虫蚊蚪蚌蚩蚓蚜蚕蚤蚬蚯蚱蛙蛞蜓蛔蛞蛳蛛蛤蛮蜂蜇蜃蜗蝇蜘蝉蜷螟螂蝼螯蟋蟑蟀蟹蟾蠊蚁蚁螨蠡蚕衄血行街衙补表衩衫衬袍衰袷袱裕袴裱裙裹褶襄西要见规觅视览觉觉角解觞触言计订讣认讥讨让训议记讯讲讳讴讶讷许讹论讼讽设访诀证评识诈诉诉词译试诗诚诘话详诙诡询诣试诗诚诘话详诙诡询诣诤该详试诚话诞诟诠诡询诣诫诬语诚诞误诰说诬诵诲说诺读诽谁调谂谄谒课谆谈谊谋谌谍谎谏谐谙谌谕谨谙谎谴谬谭谮识谯谱谶贝贞负财贡贫货质贩贪贬购贮贯贰贱贴贵贷贸费贺贻贼贽贾贿赀赁赂赃资赅贼赈赊赋赌赎赏赐赔赖赘赚赛赜赠赞赡赢赡赢赢走起赵赴趣趋跌跎跑践踏踢踩蹉蹬蹄蹑跃躁身躯车轧轨轩转轮软轰轻载轿较较辆辇输辑输辕辗舆毂辖轿辙辎车轰辟辛辣辨辨辨辫辞边辽达迁过迈迈迎运近还进远违连迟述迳迷迹适追退送适逃逆选逊透逐途通逗逝速造逡逢逦逮週进逵逶逸逻逼逾遁遂遇游运遍过遏遐遑道达遗违遥遥遛遘遨遭遮遴遵迁选遗辽避邀邂邃迈邺邦邮邻邹邸郁郊郎郑郝郡都部郭郛郸邹郧乡鄙郑邓邝酉酊酉酋酸醃酽醸重野量金针钉钊钏钓钏钗钙钝钞钢钡钠钣钤钮钜钝铃钥钧钨钩纽钗钮钱钳钵钻钾铀铁铂铃钳铅铆钱钵钻钾铀铁铜铃钻铐铎铭阀铦铸铺铦铦铺铤链锁锄锉锅锆锈锋锌锐铺铤链锁锄锉锋锌锐锅铅铤链锁锄锉锋锌锐镐锢镍镌锅锻镝镖镗镘镛镂镑镜镝鏖镘镛镖镞镗镜镑镰镌镍镣镧镦镤镲镱长门闪闭开闰闲间闶闷闵闵闺闻阅闽阀阁阁闽阀阁阀阁阅阐阐防阴阵阳阶附际陆陈陋陌降限陕院陡陡陕院陵陶陷陪陬陴陵陶陷陬陲陪陲隋随隅障隧随险隘隙障隐随险隰隐隶难雄雅集集集零雷雹电雾霁霆霈霏霍霖震霎霏霍霎霈霜霞霸雪雾霸霹霾霸霁霁雷霜霭霸靂青靓靖静靛非靠面靥顶顷项顺须顼顽顾顿颀颁颂颂预预颅领颇颈颉颊颡颉颌颉页颉页颉颡颌页页颌页飙飞食餐饥饭饪饬饮饯饱饰饱饰饺饼饼饥饵馆饽馒馈馒馔饽馈首香马驭驮驰驱驴驳驴驶驷驸驹驻驼驾驿驶驻骆驾骅骆骏骑骈骠骡骢骠骖骝骑骄骁骊验骤骥驴骨髓髓高髭髦闹鬈魅魉魔鱼鲁鲂鲅鲁鲍鲒鲤鲨鲒鲱鲲鲳鲷鲸鳐鳍鳃鲽鳒鳍鳐鳔鳝鳜鳞鳄鲈鸟鸠鸢呜鸥鸨鹞鸦]/;

/**
 * Checks if the given text contains Simplified Chinese characters
 */
export function isSimplifiedChinese(text: string, detectedEncoding?: string): boolean {
  if (!text) return false;

  // 1. If encoding is GBK / GB2312 / GB18030, it is 100% Simplified Chinese
  if (
    detectedEncoding &&
    (detectedEncoding.includes("gb") ||
      detectedEncoding.includes("cp936") ||
      detectedEncoding.includes("hz"))
  ) {
    return true;
  }

  // 2. Sample 8,000 characters from both start and middle
  const sample = text.slice(0, 8000);

  // 3. Fast regex check for common Simplified Chinese characters
  if (SIMPLIFIED_CHARS_REGEX.test(sample)) {
    return true;
  }

  // 4. OpenCC converter comparison
  try {
    const converter = getS2TWConverter();
    const converted = converter(sample);
    if (converted !== sample) {
      return true;
    }
  } catch (e) {
    console.warn("OpenCC conversion error during detection:", e);
  }

  return false;
}
