import { loadMemory, saveMemory, findSceneById, findScenesByCharacter, generateId, now } from './memory-manager';
import type { Scene, Cut, WriterMemory } from './memory-manager';

// === 韩语情感词汇 ===
const EMOTION_VOCABULARY: string[] = [
  "긴장", "설렘", "불안", "평온", "갈등",
  "슬픔", "기쁨", "분노", "체념", "희망",
  "외로움", "그리움", "애틋함", "당혹", "환희",
  "공포", "안도", "후회", "결의", "허탈"
];

const CUT_TYPE_LABELS: Record<string, string> = {
  dialogue: "대사",
  narration: "내레이션",
  action: "액션",
  internal: "내면"
};

// === 类型定义 ===
export interface SceneSummary {
  id: string;
  title: string;
  chapter?: string;
  order: number;
  characterCount: number;
  cutCount: number;
  emotionTags: string[];
}

export interface SceneFlowEntry {
  order: number;
  title: string;
  chapter?: string;
  primaryEmotion: string;
  characters: string[];
  cutCount: number;
}

// === 场景 CRUD ===

export function addScene(title: string, options?: {
  chapter?: string;
  characters?: string[];
  emotionTags?: string[];
  narrationTone?: string;
  notes?: string;
}): Scene | null {
  try {
    const memory = loadMemory();

    const newScene: Scene = {
      id: generateId('scene'),
      title,
      chapter: options?.chapter,
      characters: options?.characters || [],
      emotionTags: options?.emotionTags || [],
      cuts: [],
      narrationTone: options?.narrationTone || '',
      notes: options?.notes || '',
      order: memory.scenes.length,
      created: now()
    };

    memory.scenes.push(newScene);
    saveMemory(memory);

    return newScene;
  } catch (error) {
    console.error('添加场景失败：', error);
    return null;
  }
}

export function updateScene(sceneId: string, updates: Partial<Scene>): Scene | null {
  try {
    const memory = loadMemory();
    const scene = findSceneById(memory, sceneId);

    if (!scene) {
      console.error(`未找到场景：${sceneId}`);
      return null;
    }

    // 应用更新（保留不可变字段）
    Object.assign(scene, {
      ...updates,
      id: scene.id,
      created: scene.created
    });

    saveMemory(memory);
    return scene;
  } catch (error) {
    console.error('更新场景失败：', error);
    return null;
  }
}

export function removeScene(sceneId: string): boolean {
  try {
    const memory = loadMemory();
    const index = memory.scenes.findIndex(s => s.id === sceneId);

    if (index === -1) {
      console.error(`未找到场景：${sceneId}`);
      return false;
    }

    memory.scenes.splice(index, 1);

    // 重排剩余场景的顺序
    memory.scenes.forEach((scene, idx) => {
      scene.order = idx;
    });

    saveMemory(memory);
    return true;
  } catch (error) {
    console.error('删除场景失败：', error);
    return false;
  }
}

export function getScene(sceneId: string): Scene | null {
  try {
    const memory = loadMemory();
    return findSceneById(memory, sceneId);
  } catch (error) {
    console.error('获取场景失败：', error);
    return null;
  }
}

export function listScenes(options?: {
  chapter?: string;
  character?: string;
  emotionTag?: string;
}): SceneSummary[] {
  try {
    const memory = loadMemory();
    let scenes = [...memory.scenes];

    // 应用筛选条件
    if (options?.chapter) {
      scenes = scenes.filter(s => s.chapter === options.chapter);
    }

    if (options?.character) {
      scenes = scenes.filter(s => s.characters.includes(options.character!));
    }

    if (options?.emotionTag) {
      scenes = scenes.filter(s => s.emotionTags.includes(options.emotionTag!));
    }

    // 按顺序排序
    scenes.sort((a, b) => a.order - b.order);

    // 转换为摘要
    return scenes.map(scene => ({
      id: scene.id,
      title: scene.title,
      chapter: scene.chapter,
      order: scene.order,
      characterCount: scene.characters.length,
      cutCount: scene.cuts.length,
      emotionTags: scene.emotionTags
    }));
  } catch (error) {
    console.error('列出场景失败：', error);
    return [];
  }
}

// === 镜头管理（콘티 컷） ===

export function addCut(sceneId: string, cut: {
  type: "dialogue" | "narration" | "action" | "internal";
  content: string;
  character?: string;
  emotionTag?: string;
}): boolean {
  try {
    const memory = loadMemory();
    const scene = findSceneById(memory, sceneId);

    if (!scene) {
      console.error(`未找到场景：${sceneId}`);
      return false;
    }

    const newCut: Cut = {
      order: scene.cuts.length,
      type: cut.type,
      content: cut.content,
      character: cut.character,
      emotionTag: cut.emotionTag
    };

    scene.cuts.push(newCut);

    saveMemory(memory);
    return true;
  } catch (error) {
    console.error('添加镜头失败：', error);
    return false;
  }
}

export function updateCut(sceneId: string, cutOrder: number, updates: Partial<Cut>): boolean {
  try {
    const memory = loadMemory();
    const scene = findSceneById(memory, sceneId);

    if (!scene) {
      console.error(`未找到场景：${sceneId}`);
      return false;
    }

    const cut = scene.cuts.find(c => c.order === cutOrder);

    if (!cut) {
      console.error(`未找到镜头：场景 ${sceneId} 中不存在顺序 ${cutOrder}`);
      return false;
    }

    // 应用更新（保留顺序）
    Object.assign(cut, {
      ...updates,
      order: cut.order
    });

    saveMemory(memory);
    return true;
  } catch (error) {
    console.error('更新镜头失败：', error);
    return false;
  }
}

export function removeCut(sceneId: string, cutOrder: number): boolean {
  try {
    const memory = loadMemory();
    const scene = findSceneById(memory, sceneId);

    if (!scene) {
      console.error(`未找到场景：${sceneId}`);
      return false;
    }

    const index = scene.cuts.findIndex(c => c.order === cutOrder);

    if (index === -1) {
      console.error(`未找到镜头：场景 ${sceneId} 中不存在顺序 ${cutOrder}`);
      return false;
    }

    scene.cuts.splice(index, 1);

    // 重排剩余镜头的顺序
    scene.cuts.forEach((cut, idx) => {
      cut.order = idx;
    });

    saveMemory(memory);
    return true;
  } catch (error) {
    console.error('删除镜头失败：', error);
    return false;
  }
}

export function reorderCuts(sceneId: string, newOrder: number[]): boolean {
  try {
    const memory = loadMemory();
    const scene = findSceneById(memory, sceneId);

    if (!scene) {
      console.error(`未找到场景：${sceneId}`);
      return false;
    }

    if (newOrder.length !== scene.cuts.length) {
      console.error('新顺序的长度与镜头数量不一致');
      return false;
    }

    // 校验所有索引是否齐全
    const sortedOrder = [...newOrder].sort((a, b) => a - b);
    for (let i = 0; i < sortedOrder.length; i++) {
      if (sortedOrder[i] !== i) {
        console.error('无效的顺序数组：必须包含 0 到 n-1 的所有索引');
        return false;
      }
    }

    // 重排镜头顺序
    const reorderedCuts: Cut[] = newOrder.map(oldIdx => scene.cuts[oldIdx]);
    reorderedCuts.forEach((cut, newIdx) => {
      cut.order = newIdx;
    });

    scene.cuts = reorderedCuts;

    saveMemory(memory);
    return true;
  } catch (error) {
    console.error('重排镜头失败：', error);
    return false;
  }
}

// === 情感标签 ===

export function addEmotionTag(sceneId: string, tag: string): boolean {
  try {
    const memory = loadMemory();
    const scene = findSceneById(memory, sceneId);

    if (!scene) {
      console.error(`未找到场景：${sceneId}`);
      return false;
    }

    if (scene.emotionTags.includes(tag)) {
      console.warn(`情感标签已存在：${tag}`);
      return true; // 不算错误
    }

    scene.emotionTags.push(tag);

    saveMemory(memory);
    return true;
  } catch (error) {
    console.error('添加情感标签失败：', error);
    return false;
  }
}

export function removeEmotionTag(sceneId: string, tag: string): boolean {
  try {
    const memory = loadMemory();
    const scene = findSceneById(memory, sceneId);

    if (!scene) {
      console.error(`未找到场景：${sceneId}`);
      return false;
    }

    const index = scene.emotionTags.indexOf(tag);

    if (index === -1) {
      console.warn(`未找到情感标签：${tag}`);
      return true; // 不算错误
    }

    scene.emotionTags.splice(index, 1);

    saveMemory(memory);
    return true;
  } catch (error) {
    console.error('删除情感标签失败：', error);
    return false;
  }
}

export function getScenesByEmotion(emotionTag: string): Scene[] {
  try {
    const memory = loadMemory();
    return memory.scenes
      .filter(scene => scene.emotionTags.includes(emotionTag))
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    console.error('按情感获取场景失败：', error);
    return [];
  }
}

export function getAllEmotionTags(): { tag: string; count: number }[] {
  try {
    const memory = loadMemory();
    const tagCounts = new Map<string, number>();

    memory.scenes.forEach(scene => {
      scene.emotionTags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('获取全部情感标签失败：', error);
    return [];
  }
}

// === 场景组织 ===

export function reorderScenes(sceneIds: string[]): boolean {
  try {
    const memory = loadMemory();

    if (sceneIds.length !== memory.scenes.length) {
      console.error('场景 ID 数量与场景数量不一致');
      return false;
    }

    // 校验所有 ID 是否存在
    const sceneMap = new Map(memory.scenes.map(s => [s.id, s]));
    for (const id of sceneIds) {
      if (!sceneMap.has(id)) {
        console.error(`未找到场景：${id}`);
        return false;
      }
    }

    // 重排场景顺序
    memory.scenes = sceneIds.map(id => sceneMap.get(id)!);
    memory.scenes.forEach((scene, idx) => {
      scene.order = idx;
    });

    saveMemory(memory);
    return true;
  } catch (error) {
    console.error('重排场景失败：', error);
    return false;
  }
}

export function getSceneFlow(): SceneFlowEntry[] {
  try {
    const memory = loadMemory();

    return memory.scenes
      .sort((a, b) => a.order - b.order)
      .map(scene => ({
        order: scene.order + 1, // 显示时从 1 开始计数
        title: scene.title,
        chapter: scene.chapter,
        primaryEmotion: scene.emotionTags[0] || "감정 미설정",
        characters: scene.characters,
        cutCount: scene.cuts.length
      }));
  } catch (error) {
    console.error('获取场景流程失败：', error);
    return [];
  }
}

// === 场景档案生成 ===

export function generateSceneProfile(sceneId: string): string {
  try {
    const scene = getScene(sceneId);

    if (!scene) {
      return `# 오류: 장면을 찾을 수 없습니다 (${sceneId})`;
    }

    let profile = `# 장면: ${scene.title}\n\n`;

    if (scene.chapter) {
      profile += `**챕터**: ${scene.chapter}\n`;
    }

    if (scene.characters.length > 0) {
      profile += `**등장인물**: ${scene.characters.join(', ')}\n`;
    }

    if (scene.emotionTags.length > 0) {
      profile += `**감정 태그**: ${scene.emotionTags.join(', ')}\n`;
    }

    if (scene.narrationTone) {
      profile += `**내레이션 톤**: ${scene.narrationTone}\n`;
    }

    if (scene.notes) {
      profile += `\n**노트**: ${scene.notes}\n`;
    }

    profile += `\n## 컷 구성\n\n`;

    if (scene.cuts.length === 0) {
      profile += `*(컷이 아직 추가되지 않았습니다)*\n`;
    } else {
      scene.cuts.forEach(cut => {
        const typeLabel = CUT_TYPE_LABELS[cut.type] || cut.type;
        const charPart = cut.character ? `/${cut.character}` : '';
        const emotionPart = cut.emotionTag ? ` (감정: ${cut.emotionTag})` : '';

        profile += `${cut.order + 1}. [${typeLabel}${charPart}] ${cut.content}${emotionPart}\n`;
      });
    }

    return profile;
  } catch (error) {
    console.error('生成场景档案失败：', error);
    return `# 오류: 장면 프로필 생성 실패`;
  }
}

export function generateSceneList(): string {
  try {
    const memory = loadMemory();

    let list = `## 전체 장면 목록\n\n`;
    list += `| # | 제목 | 챕터 | 감정 | 등장인물 | 컷 수 |\n`;
    list += `|---|------|------|------|---------|-------|\n`;

    if (memory.scenes.length === 0) {
      list += `| - | *(장면이 아직 추가되지 않았습니다)* | - | - | - | - |\n`;
      return list;
    }

    const sortedScenes = [...memory.scenes].sort((a, b) => a.order - b.order);

    sortedScenes.forEach(scene => {
      const sceneNum = scene.order + 1;
      const title = scene.title;
      const chapter = scene.chapter || '-';
      const emotions = scene.emotionTags.length > 0
        ? scene.emotionTags.join(', ')
        : '-';
      const characters = scene.characters.length > 0
        ? scene.characters.join(', ')
        : '-';
      const cutCount = scene.cuts.length;

      list += `| ${sceneNum} | ${title} | ${chapter} | ${emotions} | ${characters} | ${cutCount} |\n`;
    });

    return list;
  } catch (error) {
    console.error('生成场景列表失败：', error);
    return `## 오류: 장면 목록 생성 실패`;
  }
}

// 导出情感词汇供外部使用
export { EMOTION_VOCABULARY, CUT_TYPE_LABELS };
