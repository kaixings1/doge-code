/**
 * src/knowledge/classics-rules.js
 *
 * 思想心虫古典规则引擎 v1.0
 * 从特定古籍章节提取可运行判断规则，直接参与 HeartFlow 判别。
 *
 * 设计原则：
 * 1. 每条规则必须有明确古籍出处 + 可触发条件 + 判别动作
 * 2. 规则不修改 thought-chain 主链路，通过 return structured signal 接入
 * 3. 规则命中后映射到 HeartFlow 既有判别维度，不新增维度
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLASSICS_BASE = path.join(__dirname, '..', '..', '..', '..', 'daizhigev20');
const SCRIPT = path.join(CLASSICS_BASE, 'scripts', 'search_guji.sh');

/**
 * 规则结构：
 * {
 *   id, source, canonical,
 *   trigger: string[] | RegExp,
 *   evaluator: (input, hits) => RuleResult,
 *   dimensions: string[],
 *   priority: number
 * }
 *
 * RuleResult:
 * {
 *   fired: boolean,
 *   signal: 'violation' | 'warn' | 'pass' | 'reference',
 *   reason: string,
 *   evidence: { file, line, raw }
 * }
 */

const CLASSICAL_RULES = [
  {
    id: 'mengzi-renzheng-policy',
    source: '孟子·梁惠王上',
    canonical: '省刑罚，薄税敛，深耕易耨，壮者以暇日修其孝悌忠信',
    trigger: ['仁政','王道','与民偕乐','保民而王','制民之产','经界','井田','庠序','孝悌'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasRenZhengClaim = /省刑罚|薄税敛|仁政|王道|保民|与民偕乐|制民之产|正经界/.test(q);
      const hasSpecificPolicy = /五亩之宅|百亩之田|庠序之教|谨庠序|申之以孝悌|深耕易耨|孝悌忠信|省刑罚|薄税敛/.test(q);
      const hasEmptyRhetoric = /仁政|王道/.test(q) && !hasSpecificPolicy && !/所以|必自|盖|凡|者/.test(q);
      if (hasRenZhengClaim && hasSpecificPolicy) {
        return { fired: true, signal: 'pass', reason: 'claim_with_policy', evidence: hits[0] || null };
      }
      if (hasEmptyRhetoric) {
        return { fired: true, signal: 'warn', reason: 'renzheng_claim_without_policy_detail', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['vagueness', 'unsupported_claim'],
    priority: 9
  },
  {
    id: 'mengzi-yili-distinction',
    source: '孟子·梁惠王上 / 孟子·公孙丑下 / 大学',
    canonical: '以义为利 / 以利为利 / 怀仁义以相接',
    trigger: ['义利','义之与比','怀德','怀土','怀刑','怀惠','为富不仁','以义为利','以利为利','利与义'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasYiLiTopic = /义利|以义为利|以利为利|怀仁义|为富不仁|利与义/.test(q);
      const hasPublicPrivate = /为公|为私|不夺|不厌|不遗亲|不后君|上下交征/.test(q);
      if (hasYiLiTopic && hasPublicPrivate) {
        return { fired: true, signal: 'reference', reason: 'yi_li_with_public_private_frame', evidence: hits[0] || null };
      }
      if (hasYiLiTopic) {
        return { fired: true, signal: 'warn', reason: 'yi_li_claim_needs_公私_distinction', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'presupposition'],
    priority: 8
  },
  {
    id: 'lunyu-zhengming-causal',
    source: '论语·子路 / 大学翼真 / 问辨录',
    canonical: '名不正则言不顺，言不顺则事不成',
    trigger: ['正名','名分','名不正','言不顺','礼乐不兴','刑罚不中','民无所措手足'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasZhengMing = /正名|名分|名不正|言不顺|礼乐不兴|刑罚不中/.test(q);
      const hasCausalChain = /所以|则|必|盖|因/.test(q);
      const hasNormativeClaim = /应当|应该|必须|必先|首先/.test(q) && /名|分|礼|法|政/.test(q);
      if (hasZhengMing && hasCausalChain) {
        return { fired: true, signal: 'reference', reason: 'zhengming_causal_chain_present', evidence: hits[0] || null };
      }
      if (hasNormativeClaim && !hasZhengMing) {
        return { fired: true, signal: 'warn', reason: 'normative_claim_without_zhengming_basis', evidence: null };
      }
      if (hasZhengMing) {
        return { fired: true, signal: 'pass', reason: 'zhengming_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'presupposition', 'vagueness'],
    priority: 9
  },
  {
    id: 'mengzi-liangzhi-renxin',
    source: '孟子·梁惠王上',
    canonical: '是心足以王矣 / 老吾老以及人之老',
    trigger: ['恻隐之心','不忍人之心','仁之端','扩充','老吾老','幼吾幼','推恩','保四海'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasRenHeart = /恻隐|不忍|仁之端|扩充|推恩|老吾老|幼吾幼/.test(q);
      const hasEmpathyGeneralization = /以及|扩充|推|及于/.test(q);
      const hasMoralClaim = /仁义|王道|仁政|保民/.test(q);
      if (hasRenHeart && hasEmpathyGeneralization) {
        return { fired: true, signal: 'pass', reason: 'renxin_with_extension_mechanism', evidence: hits[0] || null };
      }
      if (hasMoralClaim && !hasRenHeart) {
        return { fired: true, signal: 'warn', reason: 'moral_claim_without_renxin_basis', evidence: null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'presupposition'],
    priority: 8
  },
  {
    id: 'mengzi-buzuo-dangze',
    source: '孟子·梁惠王上',
    canonical: '无恒产而有恒心者惟士为能 / 制民之产',
    trigger: ['恒产','恒心','制民之产','仰足以事父母','俯足以畜妻子','乐岁终身饱','凶年免于死亡'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasHengChan = /恒产|恒心|制民之产|仰足以|俯足以|乐岁|凶年/.test(q);
      const hasStructuralClaim = /制度|经界|井田|制禄|分田/.test(q);
      if (hasHengChan && hasStructuralClaim) {
        return { fired: true, signal: 'pass', reason: 'hengchan_with_institutional_detail', evidence: hits[0] || null };
      }
      if (hasHengChan) {
        return { fired: true, signal: 'warn', reason: 'hengchan_mention_without_institutional_binding', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['goal_misalignment', 'vagueness'],
    priority: 7
  },
  {
    id: 'lunyu-zhongshu',
    source: '论语·学而 / 论语·子路 / 孟子·公孙丑上 / 中庸',
    canonical: '夫子之道忠恕而已矣 / 恕之道推己及人',
    trigger: ['忠恕','恕','己所不欲','勿施于人','恕之道','求仁莫近','强恕而行','恕以行之'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasZhongShu = /忠恕|恕|己所不欲|勿施于人|求仁莫近|强恕而行/.test(q);
      const hasReciprocal = /及人|推己|勿施|以己|度人/.test(q);
      if (hasZhongShu && hasReciprocal) {
        return { fired: true, signal: 'pass', reason: 'zhongshu_with_reciprocal_mechanism', evidence: hits[0] || null };
      }
      if (hasZhongShu) {
        return { fired: true, signal: 'reference', reason: 'zhongshu_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'presupposition'],
    priority: 8
  },
  {
    id: 'lunyu-shuoyu',
    source: '论语·颜渊 / 论语·卫灵公',
    canonical: '己所不欲，勿施于人',
    trigger: ['己所不欲','勿施于人','恕之道','己欲立而立人','己欲达而达人','施于人','不欲','勿施'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasShuoYu = /己所不欲|勿施于人/.test(q);
      const hasReciprocal = /及人|推己|以己|度人|施于人|欲立|欲达/.test(q);
      if (hasShuoYu && hasReciprocal) {
        return { fired: true, signal: 'pass', reason: 'shuoyu_with_reciprocal', evidence: hits[0] || null };
      }
      if (hasShuoYu) {
        return { fired: true, signal: 'reference', reason: 'shuoyu_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'presupposition'],
    priority: 9
  },
  {
    id: 'lunyu-zhiwei',
    source: '论语·为政 / 论语·子罕',
    canonical: '知之为知之，不知为不知，是知也',
    trigger: ['知之为知之','不知为不知','是知也','知者不惑','多闻阙疑','知之为知之不知为不知'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasZhiWei = /知之为知之|不知为不知|是知也/.test(q);
      const hasEpistemic = /阙疑|慎言|多闻|择其善者/.test(q);
      if (hasZhiWei && hasEpistemic) {
        return { fired: true, signal: 'pass', reason: 'zhiwei_with_epistemic_caution', evidence: hits[0] || null };
      }
      if (hasZhiWei) {
        return { fired: true, signal: 'reference', reason: 'zhiwei_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['evidence', 'confidence'],
    priority: 9
  },
  {
    id: 'lunyu-xiaoti',
    source: '论语·学而 / 论语·为政 / 孝经',
    canonical: '君子务本，本立而道生。孝弟也者，其为仁之本与',
    trigger: ['孝悌','孝弟','务本','本立而道生','行有馀力','以学文','泛爱众','而亲仁'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasXiaoTi = /孝悌|孝弟|务本|本立而道生|行有余力|以学文|泛爱众/.test(q);
      const hasRootClaim = /本|根本|基础|先|始/.test(q) && /仁|道|教/.test(q);
      if (hasXiaoTi && hasRootClaim) {
        return { fired: true, signal: 'pass', reason: 'xiaoti_with_root_framing', evidence: hits[0] || null };
      }
      if (hasXiaoTi) {
        return { fired: true, signal: 'reference', reason: 'xiaoti_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'vagueness'],
    priority: 7
  },
  {
    id: 'lunyu-xinyan',
    source: '论语·为政 / 论语·学而 / 论语·述而',
    canonical: '人而无信，不知其可也 / 言而有信',
    trigger: ['人而无信','不知其可','主忠信','敬事而信','民无信不立','言而有信','信近于义','信'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasXin = /人而无信|不知其可|主忠信|敬事而信|民无信不立|言而有信|信近于义/.test(q);
      const hasCommitment = /立身|处世|交友|为政|事君|使民|行己|取信|近义/.test(q);
      if (hasXin && hasCommitment) {
        return { fired: true, signal: 'pass', reason: 'xin_with_commitment', evidence: hits[0] || null };
      }
      if (hasXin) {
        return { fired: true, signal: 'reference', reason: 'xin_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'vagueness'],
    priority: 8
  },
  {
    id: 'lunyu-yi',
    source: '论语·里仁 / 论语·宪问 / 论语·述而',
    canonical: '君子喻于义，小人喻于利',
    trigger: ['君子喻于义','小人喻于利','义然后取','义以为质','见利思义','见得思义','义之所在','舍身取义','杀身成仁'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasYi = /君子喻于义|小人喻于利|义然后取|义以为质|见利思义|见得思义/.test(q);
      const hasChoice = /见利|思义|义然后取|舍身取义|杀身成仁|见得思义/.test(q);
      if (hasYi && hasChoice) {
        return { fired: true, signal: 'pass', reason: 'yi_with_choice', evidence: hits[0] || null };
      }
      if (hasYi) {
        return { fired: true, signal: 'reference', reason: 'yi_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'presupposition'],
    priority: 8
  },
  {
    id: 'liji-datong',
    source: '礼记·礼运 / 儒藏',
    canonical: '大道之行也，天下为公。选贤与能，讲信修睦',
    trigger: ['大道之行','天下为公','选贤与能','讲信修睦','故人不独亲其亲','不独子其子','男有分','女有归'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasDatong = /大道之行|天下为公|选贤与能|讲信修睦|故人不独亲其亲|不独子其子|男有分|女有归/.test(q);
      const hasInstitution = /制度|公|选贤|与能|讲信|修睦|老有所终|壮有所用|幼有所长/.test(q);
      if (hasDatong && hasInstitution) {
        return { fired: true, signal: 'pass', reason: 'datong_with_institution', evidence: hits[0] || null };
      }
      if (hasDatong) {
        return { fired: true, signal: 'reference', reason: 'datong_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'presupposition'],
    priority: 8
  },
  {
    id: 'liji-yueji',
    source: '礼记·乐记 / 儒藏',
    canonical: '乐者，天地之和也；礼者，天地之序也',
    trigger: ['乐者天地之和','礼者天地之序','乐治同','礼别异','礼乐刑政','大乐必易','大礼必简','乐者德之华'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasYueJi = /乐者[，,]?天地之和|礼者[，,]?天地之序|乐治同|礼别异|礼乐刑政/.test(q);
      const hasHarmony = /和|序|乐|礼|天地|治|同|异/.test(q);
      if (hasYueJi && hasHarmony) {
        return { fired: true, signal: 'pass', reason: 'yueji_with_harmony', evidence: hits[0] || null };
      }
      if (hasYueJi) {
        return { fired: true, signal: 'reference', reason: 'yueji_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['value_alignment', 'reasoning_coherence'],
    priority: 7
  },
  {
    id: 'mengzi-xingben',
    source: '孟子·公孙丑上 / 孟子·告子上',
    canonical: '恻隐之心，仁之端也；羞恶之心，义之端也',
    trigger: ['恻隐之心','羞恶之心','辞让之心','是非之心','四端','仁义礼智','非由外铄','我固有之','求其放心','存心养性'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasSiDuan = /恻隐之心|羞恶之心|辞让之心|是非之心|四端|仁义礼智|求其放心|存心养性/.test(q);
      const hasInnate = /固有|非由外铄|端|本|心/.test(q);
      if (hasSiDuan && hasInnate) {
        return { fired: true, signal: 'pass', reason: 'xingben_with_innate', evidence: hits[0] || null };
      }
      if (hasSiDuan) {
        return { fired: true, signal: 'reference', reason: 'xingben_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'presupposition'],
    priority: 8
  },
  {
    id: 'zhuangzi-qiushu',
    source: '庄子·秋水 / 道藏',
    canonical: '井蛙不可以语于海者，拘于虚也；夏虫不可以语于冰者，笃于时也',
    trigger: ['井蛙不可语于海','夏虫不可语于冰','秋水时至','百川灌河','东面而视','不见水端','河伯','北海若','大方之家'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasQiushu = /井蛙|夏虫|秋水|河伯|北海若|百川灌河|大方之家/.test(q);
      const hasLimitation = /不可语|拘于虚|笃于时|不见水端|东面而视|限制|时地|时也|虚也|语于海|语于冰/.test(q);
      if (hasQiushu && hasLimitation) {
        return { fired: true, signal: 'pass', reason: 'qiushu_with_limitation', evidence: hits[0] || null };
      }
      if (hasQiushu) {
        return { fired: true, signal: 'reference', reason: 'qiushu_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['vagueness', 'presupposition', 'reasoning_coherence'],
    priority: 7
  },
  {
    id: 'diamond-sutra',
    source: '金刚经 / 佛藏',
    canonical: '应无所住而生其心',
    trigger: ['应无所住','而生其心','凡所有相','皆是虚妄','若见诸相非相','即见如来','不应住色生心','不应住声香味触法'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasDiamond = /应无所住|而生其心|凡所有相|皆是虚妄|若见诸相非相|即见如来|不应住色生心|不应住声香味触法/.test(q);
      const hasNonAttach = /无住|虚妄|非相|如来|色|声|香|味|触|法|心|无/.test(q);
      if (hasDiamond && hasNonAttach) {
        return { fired: true, signal: 'pass', reason: 'diamond_nonattach', evidence: hits[0] || null };
      }
      if (hasDiamond) {
        return { fired: true, signal: 'reference', reason: 'diamond_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['value_alignment', 'presupposition'],
    priority: 8
  },
  {
    id: 'heart-sutra',
    source: '般若波罗蜜多心经 / 佛藏',
    canonical: '色不异空，空不异色；色即是空，空即是色',
    trigger: ['色不异空','空不异色','色即是空','空即是色','照见五蕴皆空','度一切苦厄','心无挂碍','无挂碍故','无有恐怖'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasHeart = /色不异空|空不异色|色即是空|空即是色|照见五蕴皆空|度一切苦厄|心无挂碍|无挂碍故|无有恐怖/.test(q);
      const hasEmptiness = /空|五蕴|色|心|挂碍|恐怖|颠倒|梦想/.test(q);
      if (hasHeart && hasEmptiness) {
        return { fired: true, signal: 'pass', reason: 'heart_emptiness', evidence: hits[0] || null };
      }
      if (hasHeart) {
        return { fired: true, signal: 'reference', reason: 'heart_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['paradox_acknowledgment', 'value_alignment'],
    priority: 8
  },
  {
    id: 'platform-sutra',
    source: '六祖坛经 / 佛藏',
    canonical: '菩提本无树，明镜亦非台。本来无一物，何处惹尘埃',
    trigger: ['菩提本无树','明镜亦非台','本来无一物','何处惹尘埃','不是风动','不是幡动','仁者心动','迷时师渡','悟了自渡'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasPlatform = /菩提本无树|明镜亦非台|本来无一物|何处惹尘埃|不是风动|不是幡动|仁者心动|迷时师渡|悟了自渡/.test(q);
      const hasNoThing = /无树|无台|无一物|无尘埃|无心|无住|心动/.test(q);
      if (hasPlatform && hasNoThing) {
        return { fired: true, signal: 'pass', reason: 'platform_nothind', evidence: hits[0] || null };
      }
      if (hasPlatform) {
        return { fired: true, signal: 'reference', reason: 'platform_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['paradox_acknowledgment', 'value_alignment'],
    priority: 8
  },
  {
    id: 'daodejing-wu-wei',
    source: '道德经 / 道藏',
    canonical: '道常无为而无不为。侯王若能守之，万物将自化',
    trigger: ['无为而治','无为故无败','无为故无失','道常无为','清静为天下正','我无为而民自化','我好静而民自正','我无事而民自富','我无欲而民自朴'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasWuWei = /无为|清静|好静|无事|无欲|自化|自正|自富|自朴/.test(q);
      const hasOutcome = /而治|自化|自正|自富|自朴|万物|天下|侯王/.test(q);
      if (hasWuWei && hasOutcome) {
        return { fired: true, signal: 'pass', reason: 'wu_wei_with_outcome', evidence: hits[0] || null };
      }
      if (hasWuWei) {
        return { fired: true, signal: 'reference', reason: 'wu_wei_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'goal_misalignment'],
    priority: 8
  },
  {
    id: 'daodejing-softness',
    source: '道德经 / 道藏',
    canonical: '上善若水，水善利万物而不争，处众人之所恶，故几于道',
    trigger: ['上善若水','水善利万物','柔弱胜刚强','坚强者死之徒','柔弱者生之徒','天下之至柔','驰骋天下之至坚'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasWater = /上善若水|水善利万物|不争|柔弱|柔软|至柔|至坚/.test(q);
      const hasVirtue = /善|德|道|万物|天下/.test(q);
      if (hasWater && hasVirtue) {
        return { fired: true, signal: 'pass', reason: 'softness_with_virtue', evidence: hits[0] || null };
      }
      if (hasWater) {
        return { fired: true, signal: 'reference', reason: 'softness_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'capability_overclaim'],
    priority: 8
  },
  {
    id: 'daodejing-reversal',
    source: '道德经 / 道藏',
    canonical: '反者道之动，弱者道之用。天下万物生于有，有生于无',
    trigger: ['反者道之动','弱者道之用','物极必反','正复为奇','善复为妖','将欲歙之','将欲取之','将欲废之','祸兮福之所倚','福兮祸之所伏'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasReversal = /反者|弱者|物极必反|正复|善复|歙之|取之|废之|祸兮|福兮|倚|伏/.test(q);
      const hasParadox = /则|反而|复为|奇|妖|祸|福|倚|伏/.test(q);
      if (hasReversal && hasParadox) {
        return { fired: true, signal: 'pass', reason: 'reversal_paradox_recognized', evidence: hits[0] || null };
      }
      if (hasReversal) {
        return { fired: true, signal: 'reference', reason: 'reversal_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'contradiction'],
    priority: 7
  },
  {
    id: 'zhuangzi-xiaoyao',
    source: '庄子·逍遥游 / 道藏',
    canonical: '北冥有鱼，其名为鲲。鲲之大，不知其几千里也。化而为鸟，其名为鹏',
    trigger: ['逍遥游','北冥有鱼','其名为鲲','化而为鸟','其名为鹏','怒而飞','翼若垂天之云','海运则将徙于南冥','天池','绝云气'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasXiaoyao = /逍遥|北冥|鲲|鹏|垂天之云|海运|南冥|天池|绝云气|扶摇/.test(q);
      const hasTransform = /化|飞|徙|游|绝|扶摇/.test(q);
      if (hasXiaoyao && hasTransform) {
        return { fired: true, signal: 'pass', reason: 'xiaoyao_with_transform', evidence: hits[0] || null };
      }
      if (hasXiaoyao) {
        return { fired: true, signal: 'reference', reason: 'xiaoyao_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['meaning_purpose', 'counterfactual'],
    priority: 7
  },
  {
    id: 'zhuangzi-qiwu',
    source: '庄子·齐物论 / 道藏',
    canonical: '昔者庄周梦为胡蝶，栩栩然胡蝶也。不知周也。俄然觉，则蘧蘧然周也',
    trigger: ['庄周梦蝶','昔者庄周','栩栩然','蘧蘧然','物化','彼是','方生方死','方死方生','一与言为二','二与一为三','莫非皆辩'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasButterfly = /庄周|胡蝶|栩栩|蘧蘧|梦蝶/.test(q);
      const hasRelativity = /物化|彼是|方生|方死|皆辩|一与言/.test(q);
      if (hasButterfly && hasRelativity) {
        return { fired: true, signal: 'pass', reason: 'qiwu_relativity', evidence: hits[0] || null };
      }
      if (hasButterfly) {
        return { fired: true, signal: 'reference', reason: 'butterfly_dream_detected', evidence: hits[0] || null };
      }
      if (hasRelativity) {
        return { fired: true, signal: 'reference', reason: 'relativity_terms_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'contradiction', 'counterfactual'],
    priority: 7
  },
  {
    id: 'zhuangzi-yangsheng',
    source: '庄子·养生主 / 道藏',
    canonical: '吾生也有涯，而知也无涯。以有涯随无涯，殆已。已而为智者，殆而已矣',
    trigger: ['吾生也有涯','而知也无涯','以有涯随无涯','缘督以为经','保身','全生','养亲','尽年','庖丁解牛','批郤导窾','游刃有余','刀刃若新发于硎'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasFinite = /有涯|无涯|殆|已而为智|缘督|保身|全生|养亲|尽年/.test(q);
      const hasSkill = /庖丁|解牛|批郤|导窾|游刃|刀刃|硎/.test(q);
      if (hasFinite && hasSkill) {
        return { fired: true, signal: 'pass', reason: 'yangsheng_skill_path', evidence: hits[0] || null };
      }
      if (hasFinite) {
        return { fired: true, signal: 'reference', reason: 'yangsheng_finite_life', evidence: hits[0] || null };
      }
      if (hasSkill) {
        return { fired: true, signal: 'reference', reason: 'yangsheng_skill_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['meaning_purpose', 'goal_misalignment', 'capability_overclaim'],
    priority: 8
  },
  {
    id: 'zhongyong-chengming',
    source: '中庸 / 大学本旨 / 四书大全',
    canonical: '自诚明谓之性；自明诚谓之教。诚则明矣，明则诚矣',
    trigger: ['诚则明','明则诚','诚明','至诚','尽性','至诚无息','溥博渊泉'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasChengMing = /诚则明|明则诚|诚明|至诚|尽性|至诚无息|溥博渊泉/.test(q);
      const hasEffort = /戒惧|慎独|博学|审问|慎思|明辨|笃行|择善|固执/.test(q);
      if (hasChengMing && hasEffort) {
        return { fired: true, signal: 'pass', reason: 'chengming_with_ cultivation_path', evidence: hits[0] || null };
      }
      if (hasChengMing) {
        return { fired: true, signal: 'reference', reason: 'chengming_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'presupposition'],
    priority: 8
  },
  {
    id: 'mengzi-archery-selfcultivation',
    source: '孟子·公孙丑上 / 孟子·万章下',
    canonical: '射者，仁之道也。射求正诸己，己正而后发，发而不中，则不怨胜己者，反求诸己而已矣',
    trigger: ['射者','仁之道也','射求正诸己','己正而后发','发而不中','不怨胜己者','反求诸己','正诸己','求正诸己'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasArchery = /射者|射求正诸己|己正而后发|发而不中|不怨胜己者/.test(q);
      const hasSelfReflection = /反求诸己|求正诸己|正诸己|正而后发/.test(q);
      const hasRenDao = /仁之道|仁之道也/.test(q);
      if (hasArchery && hasSelfReflection) {
        return { fired: true, signal: 'pass', reason: 'archery_selfcultivation_full_chain', evidence: hits[0] || null };
      }
      if (hasRenDao && hasSelfReflection) {
        return { fired: true, signal: 'pass', reason: 'ren_dao_with_self_reflection', evidence: hits[0] || null };
      }
      if (hasArchery) {
        return { fired: true, signal: 'reference', reason: 'archery_metaphor_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'presupposition'],
    priority: 8
  },

  {
    id: 'zhongyong-zhonghe',
    source: '中庸 / 四书大全 / 问辨录',
    canonical: '喜怒哀乐之未发谓之中，发而皆中节谓之和',
    trigger: ['中和','未发','中节','致中和','天地位焉','万物育焉','大本','达道','中和位育'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasZhongHe = /中和|未发|中节|致中和|天地位焉|万物育焉|大本|达道/.test(q);
      const hasCultivation = /修道|慎独|戒惧|性情|情性|感而遂通/.test(q);
      if (hasZhongHe && hasCultivation) {
        return { fired: true, signal: 'pass', reason: 'zhonghe_with_cultivation', evidence: hits[0] || null };
      }
      if (hasZhongHe) {
        return { fired: true, signal: 'reference', reason: 'zhonghe_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'vagueness'],
    priority: 7
  },

  {
    id: 'xiaojing-xiaoti',
    source: '儒藏/孝经/孝经问/孝经述注',
    canonical: '资于事父以事母而爱同 / 以孝事君则忠 / 以敬事长则顺',
    trigger: ['孝经','以孝事君','资于事父','事母而爱同','事君而敬同','忠顺','保其禄位','夙兴夜寐'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasXiaoJing = /资于事父|以孝事君|忠顺|保其禄位|夙兴夜寐|孝经/.test(q);
      const hasLoyaltyExtension = /事母|事君|敬长|忠.*顺/.test(q);
      if (hasXiaoJing && hasLoyaltyExtension) {
        return { fired: true, signal: 'pass', reason: 'xiaojing_with_loyalty_extension', evidence: hits[0] || null };
      }
      if (hasXiaoJing) {
        return { fired: true, signal: 'reference', reason: 'xiaojing_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'presupposition'],
    priority: 8
  },
  {
    id: 'mengxue-disi',
    source: '儒藏/启蒙蒙学/四字经/蒙训/好人歌',
    canonical: '人要孝悌，好学好文 / 好人先忠信，好人重孝弟 / 家为孝子，朝作忠臣',
    trigger: ['孝悌','忠信','好学','尊敬长上','和睦宗亲','本分','谨慎','好人','孝子','忠臣'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasMengxueEthics = /孝悌|忠信|好学|尊敬长上|和睦宗亲|本分|谨慎/.test(q);
      const hasPracticalVirtue = /孝子|忠臣|好人|成人|成材|处世/.test(q);
      if (hasMengxueEthics && hasPracticalVirtue) {
        return { fired: true, signal: 'pass', reason: 'mengxue_ethics_with_practice', evidence: hits[0] || null };
      }
      if (hasMengxueEthics) {
        return { fired: true, signal: 'reference', reason: 'mengxue_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'goal_misalignment'],
    priority: 7
  },
  {
    id: 'xiushen-zhi-xing',
    source: '儒藏/修身治家/温氏母训/玉笑零音',
    canonical: '世人多被心肠好三字坏了 / 凡子弟每事一禀命于所尊，便是孝弟 / 祭葬厚而奉养薄，末世之孝子也',
    trigger: ['修身','治家','心肠好','禀命','奉养','孝子','忠臣','犯颜','事亲','事君'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasSelfCultivation = /修身|治家|心肠好|禀命|奉养|事亲|事君/.test(q);
      const hasActionRequirement = /行径|勤苦|犯颜|实际|做事|做人/.test(q);
      if (hasSelfCultivation && hasActionRequirement) {
        return { fired: true, signal: 'pass', reason: 'xiushen_with_action', evidence: hits[0] || null };
      }
      if (hasSelfCultivation && !hasActionRequirement) {
        return { fired: true, signal: 'warn', reason: 'xiushen_mention_without_action', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['presupposition', 'goal_misalignment'],
    priority: 7
  },
  {
    id: 'jingxue-jingfa',
    source: '儒藏/五经总义/经咫/简端录/驳五经异义',
    canonical: '先甲三日谋始之预也 / 后甲三日虑终之远也 / 中孚兼虚实而取之',
    trigger: ['经义','五经','先甲','后甲','中孚','务实','稽古','经解','经典','疏义'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasMethodology = /先甲|后甲|中孚|务实|稽古|经解|经典|疏义|方法/.test(q);
      const hasPracticalApplication = /谋始|虑终|实务|行事|功夫/.test(q);
      if (hasMethodology && hasPracticalApplication) {
        return { fired: true, signal: 'pass', reason: 'jingxue_with_practice', evidence: hits[0] || null };
      }
      if (hasMethodology) {
        return { fired: true, signal: 'reference', reason: 'jingxue_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'presupposition'],
    priority: 6
  },
  {
    id: 'yuejing-liyue',
    source: '儒藏/乐经/律吕新书/琴旨/韶舞九成乐补',
    canonical: '闻宫音使人和厚而忠诚 / 闻角音使人欢喜而慈爱 / 闻商音使人奋发而好义',
    trigger: ['乐教','律吕','五音','宫商角徵羽','韶舞','礼乐','音乐','琴谱','声律'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasMusicTheory = /乐教|律吕|五音|宫商|韶舞|礼乐|音乐|声律/.test(q);
      const hasMoralEffect = /和厚|忠诚|欢喜|慈爱|奋发|好义|感人|化民/.test(q);
      if (hasMusicTheory && hasMoralEffect) {
        return { fired: true, signal: 'pass', reason: 'yuejing_with_moral_effect', evidence: hits[0] || null };
      }
      if (hasMusicTheory) {
        return { fired: true, signal: 'reference', reason: 'yuejing_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'moral_foundations'],
    priority: 6
  },
  {
    id: 'fojia-cibei-nongge',
    source: '佛说大乘无量寿庄严清净平等觉经 / 大藏经',
    canonical: '无缘大慈，同体大悲 / 慈悲喜舍',
    trigger: ['慈悲','无缘大慈','同体大悲','慈悲喜舍','不忍众生苦','拔苦与乐'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasCompassion = /慈悲|无缘大慈|同体大悲|不忍|拔苦与乐|慈悲观/.test(q);
      const hasSentientBeing = /众生|有情|万类|万物|民|人/.test(q);
      if (hasCompassion && hasSentientBeing) {
        return { fired: true, signal: 'pass', reason: 'compassion_with_sentient_scope', evidence: hits[0] || null };
      }
      if (hasCompassion) {
        return { fired: true, signal: 'warn', reason: 'compassion_without_sentient_scope', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'presupposition'],
    priority: 8
  },
  {
    id: 'fojia-banruo-wuwo',
    source: '大般若波罗蜜多经 / 金刚经 / 大藏经',
    canonical: '色即是空，空即是色 / 诸法无我',
    trigger: ['般若','空','无我','诸法空相','色即是空','缘起性空','无自性','空性'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasWisdom = /般若|空性|空|无我|无自性|缘起/.test(q);
      const hasDualitySublation = /即|是|亦|非/.test(q) && /空|色|有|无/.test(q);
      if (hasWisdom && hasDualitySublation) {
        return { fired: true, signal: 'pass', reason: 'wisdom_with_duality_sublation', evidence: hits[0] || null };
      }
      if (hasWisdom) {
        return { fired: true, signal: 'reference', reason: 'wisdom_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'presupposition'],
    priority: 8
  },
  {
    id: 'fojia-jielv-cause-effect',
    source: '大藏经/律藏 / 优婆塞戒经 / 地藏经',
    canonical: '诸恶莫作，众善奉行，自净其意，是诸佛教',
    trigger: ['戒律','五戒','十善','因果','报应','持戒','犯戒','净行','律仪'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasPrecept = /戒|持戒|犯戒|五戒|十善|律仪|净行/.test(q);
      const hasConsequence = /因果|报应|果报|业力|善业|恶业/.test(q);
      if (hasPrecept && hasConsequence) {
        return { fired: true, signal: 'pass', reason: 'precept_with_causal_consequence', evidence: hits[0] || null };
      }
      if (hasPrecept && !hasConsequence) {
        return { fired: true, signal: 'warn', reason: 'precept_without_causal_consequence', evidence: hits[0] || null };
      }
      if (hasConsequence && !hasPrecept) {
        return { fired: true, signal: 'reference', reason: 'cause_effect_without_precept', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'goal_misalignment'],
    priority: 7
  },
  {
    id: 'fojia-sidizhudaoxiang',
    source: '大藏经/经藏 / 阿含部 / 杂阿含经',
    canonical: '苦集灭道 / 八正道：正见正思惟正语正业正命正精进正念正定',
    trigger: ['四谛','苦谛','集谛','灭谛','道谛','八正道','正见','正思惟','正语','正业','正命','正精进','正念','正定'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasFourNoble = /四谛|苦谛|集谛|灭谛|道谛|苦集灭道/.test(q);
      const hasNobleEightfold = /八正道|正见|正思惟|正语|正业|正命|正精进|正念|正定/.test(q);
      if (hasFourNoble && hasNobleEightfold) {
        return { fired: true, signal: 'pass', reason: 'four_nobles_with_eightfold_path', evidence: hits[0] || null };
      }
      if (hasFourNoble || hasNobleEightfold) {
        return { fired: true, signal: 'reference', reason: 'noble_path_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'vagueness'],
    priority: 7
  },
  {
    id: 'xiaoxue-xungu',
    source: '儒藏/小学/五经文字/说文解字系传/易音',
    canonical: '六书谓象形指事会意形声转注假借六者造字之本 / 忠信为周',
    trigger: ['小学','六书','说文','字林','石经','音韵','训诂','解字','音义'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasPhilology = /小学|六书|说文|字林|石经|音韵|训诂|解字|音义/.test(q);
      const hasClassicalReference = /经典|古文字|篆文|隸书|古本|郑氏|孔安国/.test(q);
      if (hasPhilology && hasClassicalReference) {
        return { fired: true, signal: 'pass', reason: 'xiaoxue_with_classical_ref', evidence: hits[0] || null };
      }
      if (hasPhilology) {
        return { fired: true, signal: 'reference', reason: 'xiaoxue_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['presupposition', 'reasoning_coherence'],
    priority: 5
  },
  {
    id: 'qianlong-shengxian',
    source: '佛藏/乾隆藏/彰所知论/菩萨善戒经/大乘律',
    canonical: '无明灭即行等灭 / 菩萨摩诃萨初发菩提心有五事 / 三事皆当谨守法度不敢逾越礼分',
    trigger: ['乾隆藏','大藏经','菩萨戒','菩提心','无明','缘生','十二因缘','三事','法度'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasBuddhistCanon = /乾隆藏|大藏经|菩萨戒|菩提心|无明|缘生|十二因缘/.test(q);
      const hasCultivationPath = /三事|法度|戒律|忍辱|精进|禅定|般若/.test(q);
      if (hasBuddhistCanon && hasCultivationPath) {
        return { fired: true, signal: 'pass', reason: 'qianlong_with_cultivation', evidence: hits[0] || null };
      }
      if (hasBuddhistCanon) {
        return { fired: true, signal: 'reference', reason: 'qianlong_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'goal_misalignment'],
    priority: 7
  },
  {
    id: 'jiaxing-minjian',
    source: '佛藏/嘉兴藏/香岩洗心水/牧云和尚/蕅益大师',
    canonical: '天得一以清，地得一以宁 / 人生本来面目 / 本来全面目',
    trigger: ['嘉兴藏','禅宗','牧云','香岩','洗心','本来面目','参禅','开悟','大丈夫','本来'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasChanLanguage = /本来面目|开悟|参禅|牧云|香岩|洗心|大丈夫|本来/.test(q);
      const hasDirectPointing = /见性|直指|心要|本来|面目|当下|即心/.test(q);
      if (hasChanLanguage && hasDirectPointing) {
        return { fired: true, signal: 'pass', reason: 'jiaxing_with_direct_pointing', evidence: hits[0] || null };
      }
      if (hasChanLanguage) {
        return { fired: true, signal: 'reference', reason: 'jiaxing_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['presupposition', 'pseudo_profundity'],
    priority: 6
  },
  {
    id: 'xuzang-zhongguo',
    source: '佛藏/续藏经/中国撰述/首楞严坛场/西归行仪',
    canonical: '愿我临欲命终时 / 尽除一切诸障 / 面见彼佛阿弥陀',
    trigger: ['续藏经','中国撰述','首楞严','忏悔','往生','阿弥陀','净土','十心','逆顺'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasChineseBuddhism = /续藏经|中国撰述|首楞严|忏悔|往生|阿弥陀|净土|十心/.test(q);
      const hasPracticeMethod = /发露|断相续|菩提心|修功|补过|随喜|念佛|回向/.test(q);
      if (hasChineseBuddhism && hasPracticeMethod) {
        return { fired: true, signal: 'pass', reason: 'xuzang_with_practice', evidence: hits[0] || null };
      }
      if (hasChineseBuddhism) {
        return { fired: true, signal: 'reference', reason: 'xuzang_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['moral_foundations', 'emotional_manipulation'],
    priority: 7
  },
  {
    id: 'cangwai-yishi',
    source: '佛藏/藏外/达摩出身传灯传/梵网经忏悔行法',
    canonical: '一诏不至，再诏始来 / 疗疾无他策，着令东宫太子为王宥罪施恩 / 我与众生无始来今由爱见故',
    trigger: ['藏外','达摩','传灯','忏悔','梵网','戒律','菩提心','一诏','再诏','宥罪'],
    evaluator(input, hits) {
      const q = input.toLowerCase();
      const hasApocryphalText = /藏外|达摩|传灯|梵网|戒律|菩提心/.test(q);
      const hasCulturalIntegration = /诏书|太医|太子|施恩|忏悔|爱见|无始/.test(q);
      if (hasApocryphalText && hasCulturalIntegration) {
        return { fired: true, signal: 'pass', reason: 'cangwai_with_culture', evidence: hits[0] || null };
      }
      if (hasApocryphalText) {
        return { fired: true, signal: 'reference', reason: 'cangwai_term_detected', evidence: hits[0] || null };
      }
      return { fired: false, signal: 'none', reason: null, evidence: null };
    },
    dimensions: ['reasoning_coherence', 'presupposition'],
    priority: 5
  },
];

const DOMAIN_RULES = [
  {
    id: 'confucian-governance',
    keywords: ['为政','治国','礼','仁政','德治','法','刑','王道','霸道','君臣','教化'],
    scope: '儒藏/四书'
  },
  {
    id: 'confucian-self',
    keywords: ['修身','正心','诚意','格物','致知','君子','小人','义','利','天命','性'],
    scope: '儒藏/四书'
  },
  {
    id: 'confucian-xiaojing',
    keywords: ['孝经','以孝事君','资于事父','忠顺','保其禄位','夙兴夜寐','事母','事君'],
    scope: '儒藏/孝经'
  },
  {
    id: 'confucian-mengxue',
    keywords: ['孝悌','忠信','好学','尊敬长上','和睦宗亲','本分','谨慎','好人','孝子','忠臣'],
    scope: '儒藏/启蒙蒙学'
  },
  {
    id: 'confucian-xiushen',
    keywords: ['修身','治家','心肠好','禀命','奉养','孝子','忠臣','犯颜','事亲','事君'],
    scope: '儒藏/修身治家'
  },
  {
    id: 'confucian-jingxue',
    keywords: ['经义','五经','先甲','后甲','中孚','务实','稽古','经解','经典','疏义'],
    scope: '儒藏/五经总义'
  },
  {
    id: 'confucian-yuejing',
    keywords: ['乐教','律吕','五音','宫商角徵羽','韶舞','礼乐','音乐','琴谱','声律'],
    scope: '儒藏/乐经'
  },
  {
    id: 'confucian-xiaoxue',
    keywords: ['小学','六书','说文','字林','石经','音韵','训诂','解字','音义'],
    scope: '儒藏/小学'
  },
  {
    id: 'buddhist-suffering',
    keywords: ['苦','集','灭','道','般若','空','缘起','无明','涅槃','众生','贪','嗔','痴'],
    scope: '佛藏/大藏经'
  },
  {
    id: 'daoist-naturalness',
    keywords: ['道','自然','无为','清静','柔弱','不争','万物','上善','若水','反者','弱者','致虚','守静','大音','希声','大象','无形','归朴','朴'],
    scope: '道藏'
  },
  {
    id: 'buddhist-ethics',
    keywords: ['戒','定','慧','慈悲','布施','持戒','因果','报应','五戒','十善'],
    scope: '佛藏/大藏经'
  },
  {
    id: 'buddhist-qianlong',
    keywords: ['乾隆藏','大藏经','菩萨戒','菩提心','无明','缘生','十二因缘','法度','三事'],
    scope: '佛藏/乾隆藏'
  },
  {
    id: 'buddhist-jiaxing',
    keywords: ['嘉兴藏','禅宗','牧云','香岩','洗心','本来面目','参禅','开悟','大丈夫'],
    scope: '佛藏/嘉兴藏'
  },
  {
    id: 'buddhist-xuzang',
    keywords: ['续藏经','中国撰述','首楞严','忏悔','往生','阿弥陀','净土','十心','逆顺'],
    scope: '佛藏/续藏经'
  },
  {
    id: 'buddhist-cangwai',
    keywords: ['藏外','达摩','传灯','忏悔','梵网','戒律','菩提心','一诏','再诏','宥罪'],
    scope: '佛藏/藏外'
  },  {
    id: 'justice-and-fate',
    keywords: ['命运','因果','报应','公平','正义','善恶','天理','公道','是非'],
    scope: ''
  }
];

function matchDomain(input) {
  const q = input.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const rule of DOMAIN_RULES) {
    const score = rule.keywords.reduce((acc, kw) => acc + (q.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }
  return bestScore > 0 ? best : null;
}

function searchClassics(keyword, scope) {
  // NOTE: search_guji.sh is not bundled; this is dead code pending future integration.
  // When enabled, replace execSync string interpolation with parameterized array to prevent shell injection.
  if (!fs.existsSync(SCRIPT)) {
    return { hits: [], error: 'searchClassics disabled: search_guji.sh not found' };
  }
  try {
    const cmd = scope ? `bash "${SCRIPT}" "${keyword}" "${scope}"` : `bash "${SCRIPT}" "${keyword}"`;
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 15000 });
    const lines = out.split(/\r?\n/).filter(Boolean);
    return {
      keyword,
      scope: scope || 'all',
      hits: lines.slice(0, 20).map(line => ({ raw: line }))
    };
  } catch (e) {
    return { keyword, scope: scope || 'all', hits: [], error: e.message };
  }
}

function searchClassicsBatch(keywords, scope) {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return { hits: [], error: 'keywords must be a non-empty array' };
  }
  const combined = [];
  const seen = new Set();
  for (const kw of keywords) {
    const result = searchClassics(kw, scope);
    for (const hit of result.hits || []) {
      const key = hit.raw?.slice(0, 64);
      if (key && !seen.has(key)) {
        seen.add(key);
        combined.push(hit);
      }
    }
  }
  return { hits: combined.slice(0, 40), scope: scope || 'all', keywords };
}

function parseHit(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^(.+?):(\d+):(.*)$/);
  if (!m) return { file: null, line: null, raw };
  return { file: m[1], line: Number(m[2]), raw: m[3].trim() };
}

function evaluateRules(input) {
    // ─── Confucian pre-check: avoid Buddhist domain stealing ───
  // 《孟子》《论语》等先秦儒学文本含'道''仁''义'等字，易被 Buddhist keywords 匹配，
  // 必须优先判断是否为强 Confucian 文本
  let domain = null;
  if (typeof input === 'string' && input.length >= 10) {
    const confucianStrong = /射者|仁之道|射求正诸己|反求诸己|求其放心|恻隐之心|羞恶之心|辞让之心|是非之心|四端|浩然之气|集义|知言|养气|尽心知性|存心养性|知天|事天|立命|正命|万物皆备|反身而诚|强恕而行|求仁莫近|深造之以道|自得之|居安资深|左右逢源|博学详说|以友辅仁|尊德乐义|穷达/.test(input);
    if (confucianStrong) {
      domain = { id: 'confucian', keywords: ['仁','道','义','礼','智','信','心','性','命','天','己','射','求','正'], scope: '儒藏/四书' };
    }
  }
  if (!domain) {
    const daoistStrong = /道可道|非常道|名可名|非常名|上善若水|水善利万物|不争|人法地|地法天|天法道|道法自然|致虚极|守静笃|大音希声|大象无形|无为而治|清静为天下正|柔弱胜刚强|归朴|守静|致虚/.test(input);
    if (daoistStrong) {
      domain = { id: 'daoist-naturalness', keywords: ['道','自然','无为','清静','柔弱','不争','万物'], scope: '道藏' };
    }
  }

  if (!domain) {
    const buddhistStrong = /诸行无常|生灭法|寂灭|四十二章|法句经|八大人|比丘|沙门|阿罗汉|须陀洹|斯陀含|阿那含|五戒|十善|十二因缘|无明|爱取有|生老病死|般若|波罗蜜|菩萨|菩提|忍辱|精进|禅定|三学|四谛|八正道|十二缘起|正法|调御|正念|出离|爱憎|寂静|降伏|系念|慧|戒|妙药|狂乱|象心|永安/.test(input);
    if (buddhistStrong) {
      domain = { id: 'buddhist-suffering', keywords: ['苦','集','灭','道','般若','空','缘起','无明','涅槃','众生'], scope: '佛藏/大藏经' };
    }
  }
  if (!domain) {
    domain = matchDomain(input);
  }

  if (!domain && typeof input === 'string' && input.length >= 10) {
    const buddhistSoft = /戒|定|慧|出离|寂静|涅槃|无明|爱憎|苦集|灭道|四谛|八正道|十二因缘|般若|波罗蜜|菩萨|菩提|忍辱|精进|禅定|三学|四生|八苦|三毒|五蕴|六度|七觉/.test(input);
    const confucianSoft = /为政|治国|礼|仁政|德治|法|刑|王道|霸道|君臣|教化/.test(input);
    if (buddhistSoft && !confucianSoft) {
      domain = { id: 'buddhist-suffering', keywords: ['苦','集','灭','道','般若','空','缘起','无明','涅槃','众生'], scope: '佛藏/大藏经' };
    } else if (buddhistSoft && confucianSoft) {
      const bScore = input.match(/戒|定|慧|出离|寂静|涅槃|无明|爱憎|苦集|灭道|四谛|八正道|十二因缘|般若|波罗蜜|菩萨|菩提|忍辱|精进|禅定|三学|四生|八苦|三毒|五蕴|六度|七觉/g) || [];
      const cScore = input.match(/为政|治国|礼|仁政|德治|法|刑|王道|霸道|君臣|教化/g) || [];
      if (bScore.length > cScore.length) {
        domain = { id: 'buddhist-suffering', keywords: ['苦','集','灭','道','般若','空','缘起','无明','涅槃','众生'], scope: '佛藏/大藏经' };
      }
    }
  }

  let keywords = domain ? Array.from(new Set([domain.keywords[0], domain.keywords[1], domain.keywords[2]].filter(Boolean))) : [];
  let retrieval = keywords.length > 0 ? searchClassicsBatch(keywords, domain?.scope) : { hits: [] };
  let hits = retrieval.hits || [];

  // 后备：若域名匹配为空，但文本含明显先秦 markers，先以整句前 40 字在儒藏/四书做一次广检索
  if (!domain && typeof input === 'string' && input.length >= 10) {
    const classicalMarkers = /之|乎|者|也|矣|焉|哉|则|而|以|于|若|其|虽|亦|且|盖|夫|必|尝|昔|今|终|始|反|求|诸|己|射|仁|道|政|心|性|天|命|礼|义|利|名/.test(input);
    if (classicalMarkers) {
      const excerpt = input.replace(/[\\s,，。.？?！!；;：:、\\-—]/g, '').slice(0, 40);
      const fallback = searchClassicsBatch([excerpt], '儒藏/四书');
      if ((fallback.hits || []).length >= 3) {
        domain = { id: 'confucian-fallback', keywords: [], scope: '儒藏/四书' };
        keywords = [excerpt];
        hits = fallback.hits;
        retrieval = fallback;
      }
    }
  }

  const applicable = CLASSICAL_RULES.filter(r => {
    const textHit = r.trigger.some(kw => input.toLowerCase().includes(kw));
    const contentHit = hits.some(h => h.raw && r.canonical && h.raw.includes(r.canonical.slice(0, 6)));
    return textHit || contentHit;
  });

  // 后备：当检索已明确命中古典语料时，仍视为古典相关（不要求规则必须 fired）
  const classicalByHitDensity = hits.length >= 3;

  const results = applicable.map(rule => {
    try {
      return rule.evaluator(input, hits);
    } catch (e) {
      return { fired: false, signal: 'none', reason: 'eval_error:' + e.message, evidence: null };
    }
  });

  const fired = results.filter(r => r.fired);
  const warnings = fired.filter(r => r.signal === 'warn');
  const violations = fired.filter(r => r.signal === 'violation');
  const passes = fired.filter(r => r.signal === 'pass');
  const references = fired.filter(r => r.signal === 'reference');

  const findings = fired.map(r => {
    const idx = results.indexOf(r);
    const rule = applicable[idx];
    const evidence = r.evidence ? parseHit(r.evidence.raw || r.evidence) : null;
    return {
      ruleId: rule?.id || 'unknown',
      signal: r.signal,
      reason: r.reason,
      dimensions: rule?.dimensions || [],
      evidence
    };
  }).filter(f => f.ruleId !== 'unknown');

  // [思想心虫 v1] 反哺机制：对命中原文做候选触发词提取，供规则维护者Review
  let feedbackSuggestions = null;
  try {
    const { analyzeRuleCoverage } = require('./classics-feedback.js');
    const allTriggers = Array.from(new Set(CLASSICAL_RULES.flatMap(r => r.trigger)));
    const coverage = analyzeRuleCoverage(
      { findings, hitCount: hits.length, domain: domain?.id || null },
      allTriggers
    );
    if (coverage.suggestions.length > 0) {
      feedbackSuggestions = coverage;
    }
  } catch (e) {
    feedbackSuggestions = null;
  }

  return {
    classicalRelevant: fired.length > 0 || classicalByHitDensity,
    domain: domain ? domain.id : null,
    ruleCount: fired.length > 0 ? fired.length : (classicalByHitDensity ? 1 : 0),
    summary: {
      violations: violations.length,
      warnings: warnings.length,
      passes: passes.length,
      references: references.length
    },
    findings: findings.length > 0 ? findings : (classicalByHitDensity ? [{
      ruleId: 'classical-hit-density',
      signal: 'reference',
      reason: 'high_density_hits_without_rule_match',
      dimensions: ['reasoning_coherence', 'presupposition'],
      evidence: null
    }] : []),
    hits,
    hitCount: hits.length,
    feedbackSuggestions
  };
}

function evaluate(input) {
  const ruleOut = evaluateRules(input);
  if (!ruleOut.classicalRelevant) {
    return {
      classicsRelevant: false,
      recommendedAction: 'skip_classics',
      dimensions: [],
      hits: []
    };
  }
  return {
    classicsRelevant: true,
    recommendedAction: 'consult_classics',
    domain: ruleOut.domain,
    retrieval: ruleOut.hits.length > 0 ? { keyword: ruleOut.hits[0].raw.slice(0, 30), scope: 'daizhigev20' } : null,
    dimensions: Array.from(new Set(ruleOut.findings.flatMap(f => f.dimensions))),
    hits: ruleOut.hits,
    hitCount: ruleOut.hitCount,
    classicalRules: ruleOut
  };
}

module.exports = {
  evaluate,
  evaluateRules,
  matchDomain,
  searchClassics,
  searchClassicsBatch,
  parseHit,
  CLASSICAL_RULES,
  DOMAIN_RULES
};
