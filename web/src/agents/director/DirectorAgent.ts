// Nova Canvas - Director Agent 编导总导演
// 实现导演七步工作流：BRIEF → CONCEPT → SCRIPT → CHARACTER → STORYBOARD → EXECUTION → REVIEW

import { useTranslation } from 'react-i18next';
import {
  DirectorShot,
  validateStoryboard,
  compileStoryboardPrompts,
  getRhythmRules,
} from '@/lib/director';

export interface Brief {
  platform: string;
  duration: number;
  category: string;
  productInfo: {
    name: string;
    sellingPoints: string[];
    targetAudience: string;
    priceRange?: string;
  };
  userIntent: string;
  referenceAssets?: string[];
}

export interface Concept {
  id: string;
  title: string;
  oneLiner: string;
  visualKeywords: string[];
  emotionWords: string[];
  rationale: string;
}

export interface ScriptBeat {
  name: string;
  timeRange: string;
  purpose: string;
  visualFocus: string;
  copyFocus: string;
}

export interface CharacterAsset {
  id: string;
  name: string;
  description: string;
  visualTraits: string[];
  referenceImageId?: string;
}

export interface DirectorState {
  currentStep: number; // 1-7
  brief?: Brief;
  concepts: Concept[];
  selectedConceptId?: string;
  scriptBeats: ScriptBeat[];
  characters: CharacterAsset[];
  storyboard: DirectorShot[];
  executionPlan?: {
    prompts: Record<string, string[]>;
    modelAssignments: Record<string, string>;
  };
  reviewResult?: {
    score: number;
    issues: Array<{ shotId: string; level: 'error' | 'warning' | 'info'; message: string; fix?: string }>;
  };
  isAutoMode: boolean;
  status: 'idle' | 'running' | 'waiting_confirmation' | 'completed' | 'error';
}

export class DirectorAgent {
  private state: DirectorState;
  private t: ReturnType<typeof useTranslation>['t'];
  private onStateChange: (state: DirectorState) => void;

  constructor(t: ReturnType<typeof useTranslation>['t'], onStateChange: (state: DirectorState) => void) {
    this.t = t;
    this.onStateChange = onStateChange;
    this.state = this.getInitialState();
  }

  private getInitialState(): DirectorState {
    return {
      currentStep: 1,
      concepts: [],
      scriptBeats: [],
      characters: [],
      storyboard: [],
      isAutoMode: false,
      status: 'idle',
    };
  }

  getState(): DirectorState {
    return { ...this.state };
  }

  setAutoMode(enabled: boolean) {
    this.state.isAutoMode = enabled;
    this.notify();
  }

  // ========== 步骤 1: BRIEF 理解 ==========
  async stepBrief(userInput: string, context: {
    platform: string;
    duration: number;
    category: string;
    productInfo: Brief['productInfo'];
  }): Promise<Brief> {
    this.setStatus('running');
    
    // 解析用户意图
    const brief: Brief = {
      platform: context.platform,
      duration: context.duration,
      category: context.category,
      productInfo: context.productInfo,
      userIntent: userInput,
    };

    this.state.brief = brief;
    this.state.currentStep = 2;
    this.setStatus('waiting_confirmation');
    this.notify();

    return brief;
  }

  // ========== 步骤 2: CONCEPT 创意概念 ==========
  async stepConcept(brief: Brief): Promise<Concept[]> {
    this.setStatus('running');

    // 根据平台和类目生成 2-3 个创意方向
    const concepts = this.generateConcepts(brief);
    
    this.state.concepts = concepts;
    this.state.currentStep = 3;
    this.setStatus('waiting_confirmation');
    this.notify();

    return concepts;
  }

  private generateConcepts(brief: Brief): Concept[] {
    const { platform, duration, category, productInfo } = brief;
    const isShortVideo = platform === 'douyin' || platform === 'xiaohongshu' || platform === 'tiktok';
    const isAd = category === 'advertising';
    const isDrama = category === 'drama';

    // 基础创意方向
    const baseConcepts: Concept[] = [
      {
        id: 'concept_1',
        title: this.t('director.concept.titlePainPointFirst'),
        oneLiner: this.t('director.concept.oneLinerPainPoint', { product: productInfo.name }),
        visualKeywords: ['pain_point', 'contrast', 'solution_reveal'],
        emotionWords: ['anxiety', 'relief', 'satisfaction'],
        rationale: this.t('director.concept.rationalePainPoint'),
      },
      {
        id: 'concept_2',
        title: this.t('director.concept.titleResultFirst'),
        oneLiner: this.t('director.concept.oneLinerResult', { product: productInfo.name }),
        visualKeywords: ['result_preview', 'transformation', 'benefit_demo'],
        emotionWords: ['amazement', 'desire', 'trust'],
        rationale: this.t('director.concept.rationaleResult'),
      },
      {
        id: 'concept_3',
        title: this.t('director.concept.titleLifestyle'),
        oneLiner: this.t('director.concept.oneLinerLifestyle', { product: productInfo.name }),
        visualKeywords: ['lifestyle_scene', 'emotional_connection', 'usage_context'],
        emotionWords: ['warmth', 'aspiration', 'belonging'],
        rationale: this.t('director.concept.rationaleLifestyle'),
      },
    ];

    // 根据时长和类型调整
    if (isShortVideo && duration <= 15) {
      return baseConcepts.slice(0, 2); // 短视频只需 2 个方向
    }
    if (isDrama) {
      return [
        {
          id: 'concept_drama_1',
          title: '悬疑开场·反转结局',
          oneLiner: `用${productInfo.name}化解生活危机的微短剧`,
          visualKeywords: ['suspense', 'twist', 'product_as_hero'],
          emotionWords: ['tension', 'surprise', 'relief'],
          rationale: '短剧形式强情节，产品作为解决冲突的关键道具',
        },
        {
          id: 'concept_drama_2',
          title: '共鸣日常·温情治愈',
          oneLiner: `记录${productInfo.name}陪伴的治愈时刻`,
          visualKeywords: ['daily_life', 'warmth', 'product_companion'],
          emotionWords: ['comfort', 'nostalgia', 'trust'],
          rationale: '治愈系短剧强情绪连接，产品自然融入生活场景',
        },
      ];
    }
    if (isAd) {
      return [
        {
          id: 'concept_ad_1',
          title: '品牌大片·电影质感',
          oneLiner: `用电影语言讲${productInfo.name}的品牌故事`,
          visualKeywords: ['cinematic', 'brand_story', 'emotional_arc'],
          emotionWords: ['inspiration', 'pride', 'loyalty'],
          rationale: '品牌广告需建立情感资产，电影感提升品牌溢价',
        },
        {
          id: 'concept_ad_2',
          title: '硬核产品力·极简展示',
          oneLiner: `用极简镜头证明${productInfo.name}的硬核实力`,
          visualKeywords: ['minimalist', 'product_detail', 'proof'],
          emotionWords: ['confidence', 'clarity', 'conviction'],
          rationale: '功能型产品适合直观展示，减少干扰聚焦核心价值',
        },
      ];
    }

    return baseConcepts;
  }

  // ========== 步骤 3: SCRIPT 剧本节拍 ==========
  async stepScript(concept: Concept, duration: number): Promise<ScriptBeat[]> {
    this.setStatus('running');

    const rhythmRules = getRhythmRules();
    const template = duration <= 15 ? rhythmRules.structure_15s : rhythmRules.structure_30s;
    
    const scriptBeats = this.generateScriptBeats(concept, template, duration);

    this.state.scriptBeats = scriptBeats;
    this.state.currentStep = 4;
    this.setStatus('waiting_confirmation');
    this.notify();

    return scriptBeats;
  }

  private generateScriptBeats(concept: Concept, template: string[], duration: number): ScriptBeat[] {
    const beatNames = duration <= 15 
      ? ['Hook', 'Pain Point', 'Product Reveal', 'Selling Points', 'CTA']
      : ['Hook', 'Pain Point', 'Product + Selling Point 1', 'Selling Point 2 + Scene', 'Testimonial/Comparison', 'CTA + Offer'];

    return template.map((timeRange, idx) => ({
      name: beatNames[idx] || `Beat ${idx + 1}`,
      timeRange,
      purpose: this.getBeatPurpose(beatNames[idx] || `Beat ${idx + 1}`),
      visualFocus: this.getVisualFocus(concept, idx),
      copyFocus: this.getCopyFocus(concept, idx),
    }));
  }

  private getBeatPurpose(beatName: string): string {
    const purposes: Record<string, string> = {
      'Hook': '前3秒抓住注意力，制造冲突/悬念/反差',
      'Pain Point': '直击用户痛点，建立共鸣',
      'Product Reveal': '产品亮相，作为解决方案登场',
      'Selling Points': '核心卖点轰炸，建立信任',
      'CTA': '明确行动号召，转化促单',
      'Product + Selling Point 1': '产品亮相+首个核心卖点',
      'Selling Point 2 + Scene': '次要卖点+使用场景',
      'Testimonial/Comparison': '用户见证/对比强化',
      'CTA + Offer': '行动号召+优惠信息',
    };
    return purposes[beatName] || '推进叙事';
  }

  private getVisualFocus(concept: Concept, idx: number): string {
    const focuses = [
      '强视觉冲击/冲突画面',
      '痛点场景特写/用户困扰表情',
      '产品英雄镜头/包装特写',
      '卖点演示/细节特写/对比画面',
      '购买路径/优惠信息/品牌Logo',
    ];
    return focuses[idx] || '叙事推进画面';
  }

  private getCopyFocus(concept: Concept, idx: number): string {
    const focuses = [
      '痛点提问/结果前置/价格冲击',
      '痛点具象化/情绪共鸣',
      '产品名称/核心价值/差异化',
      '卖点罗列/数据佐证/权威背书',
      '行动指令/优惠截止/品牌Slogan',
    ];
    return focuses[idx] || '辅助叙事文案';
  }

  // ========== 步骤 4: CHARACTER 角色设定 ==========
  async stepCharacter(scriptBeats: ScriptBeat[]): Promise<CharacterAsset[]> {
    this.setStatus('running');

    // 分析剧本是否需要人物
    const needsCharacter = scriptBeats.some(b => 
      b.visualFocus.includes('人物') || b.visualFocus.includes('表情') || b.copyFocus.includes('口播')
    );

    let characters: CharacterAsset[] = [];
    if (needsCharacter) {
      characters = this.generateDefaultCharacters(scriptBeats);
    }

    this.state.characters = characters;
    this.state.currentStep = 5;
    this.setStatus('waiting_confirmation');
    this.notify();

    return characters;
  }

  private generateDefaultCharacters(scriptBeats: ScriptBeat[]): CharacterAsset[] {
    // 默认生成 1-2 个角色
    return [
      {
        id: 'char_1',
        name: '主角',
        description: '25-30岁，都市白领，追求品质生活',
        visualTraits: ['干净利落的发型', '得体休闲装', '自然妆容', '自信微笑'],
      },
      {
        id: 'char_2',
        name: '配角/路人',
        description: '同龄朋友/同事，见证产品效果',
        visualTraits: ['自然状态', '真实反应', '轻松互动'],
      },
    ];
  }

  // ========== 步骤 5: STORYBOARD 分镜设计 ==========
  async stepStoryboard(
    scriptBeats: ScriptBeat[],
    characters: CharacterAsset[],
    brief: Brief
  ): Promise<DirectorShot[]> {
    this.setStatus('running');

    const storyboard = this.generateStoryboard(scriptBeats, characters, brief);

    this.state.storyboard = storyboard;
    this.state.currentStep = 6;
    this.setStatus('waiting_confirmation');
    this.notify();

    return storyboard;
  }

  private generateStoryboard(
    scriptBeats: ScriptBeat[],
    characters: CharacterAsset[],
    brief: Brief
  ): DirectorShot[] {
    const shots: DirectorShot[] = [];
    let shotIndex = 0;

    for (const beat of scriptBeats) {
      const beatDuration = this.parseTimeRange(beat.timeRange);
      const shotCount = Math.max(1, Math.round(beatDuration / 3)); // 每 3 秒一个镜头
      const shotDuration = beatDuration / shotCount;

      for (let i = 0; i < shotCount; i++) {
        const isFirstShot = i === 0;
        const isLastShot = i === shotCount - 1;
        
        shots.push({
          id: `shot_${++shotIndex}`,
          index: shotIndex,
          duration: Math.round(shotDuration * 10) / 10,
          shotType: this.selectShotType(isFirstShot, isLastShot, shotIndex),
          cameraMove: this.selectCameraMove(isFirstShot, isLastShot),
          angle: 'eye-level',
          content: this.generateShotContent(beat, isFirstShot, isLastShot),
          dialogue: isFirstShot ? this.generateHookLine() : undefined,
          voiceover: this.generateVoiceover(beat),
          sound: {
            bgm: this.selectBGM(),
            bgmBpm: this.selectBPM(),
            sfx: isFirstShot ? '环境音/转场音效' : undefined,
          },
          emotion: this.selectEmotion(beat.name),
          function: this.selectFunction(shotIndex, shots.length),
          hook: isFirstShot && shotIndex === 1,
          status: 'draft',
        });
      }
    }

    return shots;
  }

  private parseTimeRange(timeRange: string): number {
    const match = timeRange.match(/(\d+)-(\d+)s/);
    if (match) {
      return parseInt(match[2]) - parseInt(match[1]);
    }
    return 3;
  }

  private selectShotType(isFirst: boolean, isLast: boolean, index: number): string {
    if (isFirst) return 'close-up';
    if (isLast) return 'medium';
    const types = ['medium', 'close-up', 'wide', 'full'];
    return types[index % types.length];
  }

  private selectCameraMove(isFirst: boolean, isLast: boolean): string {
    if (isFirst) return 'push-in';
    if (isLast) return 'pull-out';
    const moves = ['static', 'push-in', 'pan-right', 'orbit', 'handheld'];
    return moves[Math.floor(Math.random() * moves.length)];
  }

  private generateShotContent(beat: ScriptBeat, isFirst: boolean, isLast: boolean): string {
    if (isFirst) return `钩子画面：${beat.visualFocus}`;
    if (isLast) return `收尾画面：品牌Logo + CTA`;
    return `${beat.visualFocus} - ${beat.purpose}`;
  }

  private generateHookLine(): string {
    const hooks = [
      '你还在为xxx发愁？',
      '这才是xxx的正确打开方式！',
      'xxx元就能搞定xxx？',
      '90%的人都不知道的xxx技巧',
    ];
    return hooks[Math.floor(Math.random() * hooks.length)];
  }

  private generateVoiceover(beat: ScriptBeat): string {
    return beat.copyFocus;
  }

  private selectBGM(): string {
    const bgms = ['轻快节奏', '温馨钢琴', '科技感合成器', '电影感弦乐', '生活流民谣'];
    return bgms[Math.floor(Math.random() * bgms.length)];
  }

  private selectBPM(): number {
    const bpms = [118, 105, 95, 85, 75];
    return bpms[Math.floor(Math.random() * bpms.length)];
  }

  private selectEmotion(beatName: string): string {
    const emotions: Record<string, string> = {
      'Hook': '紧张/好奇',
      'Pain Point': '共鸣/焦虑',
      'Product Reveal': '惊喜/期待',
      'Selling Points': '信赖/确信',
      'CTA': '冲动/行动',
      'Product + Selling Point 1': '惊喜/信任',
      'Selling Point 2 + Scene': '向往/认同',
      'Testimonial/Comparison': '认同/说服',
      'CTA + Offer': '冲动/紧迫',
    };
    return emotions[beatName] || '中性';
  }

  private selectFunction(index: number, total: number): DirectorShot['function'] {
    if (index === 0) return 'narrative';
    if (index === total - 1) return 'narrative';
    if (index === 1 || index === total - 2) return 'emotion';
    return 'narrative';
  }

  // ========== 步骤 6: EXECUTION 执行调度 ==========
  async stepExecution(storyboard: DirectorShot[]): Promise<{
    prompts: Record<string, string[]>;
    modelAssignments: Record<string, string>;
  }> {
    this.setStatus('running');

    if (!this.state.isAutoMode) {
      this.setStatus('waiting_confirmation');
      this.notify();
      // 等待用户确认...
      // 实际实现中需要等待外部确认信号
    }

    // 编译各模型提示词
    const modelTypes = ['nova_reel', 'seedance', 'kling', 'wan'] as const;
    const prompts: Record<string, string[]> = {};
    const modelAssignments: Record<string, string> = {};

    for (const model of modelTypes) {
      prompts[model] = compileStoryboardPrompts(this.state.storyboard, model);
      // 分配策略：按镜头轮询分配
      this.state.storyboard.forEach((shot, idx) => {
        modelAssignments[shot.id] = modelTypes[idx % modelTypes.length];
      });
    }

    this.state.executionPlan = { prompts, modelAssignments };
    this.state.currentStep = 7;
    this.setStatus('waiting_confirmation');
    this.notify();

    return { prompts, modelAssignments };
  }

  // ========== 步骤 7: REVIEW 编导审片 ==========
  async stepReview(storyboard: DirectorShot[], generatedResults: Record<string, string>): Promise<{
    score: number;
    issues: Array<{ shotId: string; level: 'error' | 'warning' | 'info'; message: string; fix?: string }>;
  }> {
    this.setStatus('running');

    // 规则通道校验
    const validation = validateStoryboard(storyboard);
    
    // 视觉通道（模拟：实际应调用多模态模型）
    const visualIssues = this.simulateVisualReview(storyboard, generatedResults);

    const allIssues = [
      ...validation.errors.map(e => ({ shotId: 'global', level: 'error' as const, message: e })),
      ...validation.warnings.map(w => ({ shotId: 'global', level: 'warning' as const, message: w })),
      ...visualIssues,
    ];

    // 计算总分
    const errorCount = allIssues.filter(i => i.level === 'error').length;
    const warningCount = allIssues.filter(i => i.level === 'warning').length;
    const score = Math.max(0, 10 - errorCount * 2 - warningCount * 0.5);

    const reviewResult = { score, issues: allIssues };
    this.state.reviewResult = reviewResult;
    this.state.currentStep = 7;
    this.setStatus('completed');
    this.notify();

    return reviewResult;
  }

  private simulateVisualReview(
    storyboard: DirectorShot[],
    generatedResults: Record<string, string>
  ): Array<{ shotId: string; level: 'error' | 'warning' | 'info'; message: string; fix?: string }> {
    // 模拟视觉审片结果
    return storyboard.map((shot, idx) => {
      const hasResult = generatedResults[shot.id];
      if (!hasResult) {
        return { shotId: shot.id, level: 'error' as const, message: '该镜头未生成结果', fix: '重新生成该镜头' };
      }
      // 模拟随机问题
      const rand = Math.random();
      if (rand < 0.1) {
        return { shotId: shot.id, level: 'warning' as const, message: '构图偏右，主体不在三分线', fix: '调整构图或重新生成' };
      }
      if (rand < 0.15) {
        return { shotId: shot.id, level: 'info' as const, message: '文字可读性一般，建议增大字号', fix: '调整字体大小' };
      }
      return { shotId: shot.id, level: 'info' as const, message: '画面质量良好' };
    });
  }

  // ========== 辅助方法 ==========
  selectConcept(conceptId: string) {
    this.state.selectedConceptId = conceptId;
    this.notify();
  }

  updateStoryboard(shotId: string, updates: Partial<DirectorShot>) {
    this.state.storyboard = this.state.storyboard.map(s => 
      s.id === shotId ? { ...s, ...updates } : s
    );
    this.notify();
  }

  regenerateShot(shotId: string) {
    // 触发单镜头重新生成
    this.setStatus('running');
    // 实际实现中调用生成服务
    this.notify();
  }

  private setStatus(status: DirectorState['status']) {
    this.state.status = status;
    this.notify();
  }

  private notify() {
    this.onStateChange(this.getState());
  }
}

export function createDirectorAgent(
  t: ReturnType<typeof useTranslation>['t'],
  onStateChange: (state: DirectorState) => void
) {
  return new DirectorAgent(t, onStateChange);
}