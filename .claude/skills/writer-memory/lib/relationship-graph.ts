/**
 * 写作记忆系统的关系图模块
 *
 * 跟踪角色关系随时间的演变、
 * 韩语关系类型，以及基于图的分析。
 */

import { loadMemory, saveMemory, generateId, now } from './memory-manager';
import type {
  Relationship,
  RelationshipType,
  RelationshipEvent,
  SpeechLevel,
  WriterMemory
} from './memory-manager';

// ============================================================================
// 关系增删改查操作
// ============================================================================

/**
 * 在两个角色之间创建一条新关系
 *
 * @param char1Name - 第一个角色名
 * @param char2Name - 第二个角色名
 * @param type - 关系类型
 * @param options - 可选的关系属性
 * @returns 创建出的关系
 */
export function addRelationship(
  char1Name: string,
  char2Name: string,
  type: RelationshipType,
  options?: {
    dynamic?: Relationship['dynamic'];
    speechLevel?: SpeechLevel;
    notes?: string;
  }
): Relationship | null {
  const memory = loadMemory();
  if (!memory) return null;

  // 检查该关系是否已存在
  const existing = memory.relationships.find(r =>
    (r.from === char1Name && r.to === char2Name) ||
    (r.from === char2Name && r.to === char1Name)
  );

  if (existing) {
    return null;
  }

  const relationship: Relationship = {
    id: generateId('rel'),
    from: char1Name,
    to: char2Name,
    type,
    dynamic: options?.dynamic || 'stable',
    speechLevel: options?.speechLevel,
    notes: options?.notes,
    evolution: [],
    created: now()
  };

  memory.relationships.push(relationship);
  saveMemory(memory);

  return relationship;
}

/**
 * 用部分数据更新一条已存在的关系
 *
 * @param char1Name - 第一个角色名
 * @param char2Name - 第二个角色名
 * @param updates - 关系的部分更新内容
 * @returns 更新后的关系
 */
export function updateRelationship(
  char1Name: string,
  char2Name: string,
  updates: Partial<Omit<Relationship, 'id' | 'from' | 'to' | 'created'>>
): Relationship | null {
  const memory = loadMemory();
  if (!memory) return null;

  const relationship = getRelationship(char1Name, char2Name);

  if (!relationship) {
    return null;
  }

  Object.assign(relationship, updates);
  saveMemory(memory);

  return relationship;
}

/**
 * 删除两个角色之间的一条关系
 *
 * @param char1Name - 第一个角色名
 * @param char2Name - 第二个角色名
 */
export function removeRelationship(char1Name: string, char2Name: string): boolean {
  const memory = loadMemory();
  if (!memory) return false;

  const index = memory.relationships.findIndex(r =>
    (r.from === char1Name && r.to === char2Name) ||
    (r.from === char2Name && r.to === char1Name)
  );

  if (index === -1) {
    return false;
  }

  memory.relationships.splice(index, 1);
  saveMemory(memory);
  return true;
}

/**
 * 获取两个角色之间的关系（不区分方向）
 *
 * @param char1Name - 第一个角色名
 * @param char2Name - 第二个角色名
 * @returns 关系对象，若不存在则为 undefined
 */
export function getRelationship(char1Name: string, char2Name: string): Relationship | undefined {
  const memory = loadMemory();
  if (!memory) return undefined;

  return memory.relationships.find(r =>
    (r.from === char1Name && r.to === char2Name) ||
    (r.from === char2Name && r.to === char1Name)
  );
}

/**
 * 列出所有关系，可选按角色过滤
 *
 * @param characterName - 可选的过滤角色
 * @returns 关系数组
 */
export function listRelationships(characterName?: string): Relationship[] {
  const memory = loadMemory();
  if (!memory) return [];

  if (!characterName) {
    return memory.relationships;
  }

  return memory.relationships.filter(r =>
    r.from === characterName || r.to === characterName
  );
}

// ============================================================================
// 关系演变
// ============================================================================

/**
 * 为一条关系添加一个时间线事件
 *
 * @param char1Name - 第一个角色名
 * @param char2Name - 第二个角色名
 * @param change - 关系变化的描述
 * @param catalyst - 引起该变化的原因
 * @param sceneId - 可选的场景引用
 * @returns 创建出的事件
 */
export function addRelationshipEvent(
  char1Name: string,
  char2Name: string,
  change: string,
  catalyst: string,
  sceneId?: string
): RelationshipEvent | null {
  const relationship = getRelationship(char1Name, char2Name);

  if (!relationship) {
    return null;
  }

  const event: RelationshipEvent = {
    timestamp: now(),
    change,
    catalyst,
    sceneId
  };

  relationship.evolution.push(event);

  const memory = loadMemory();
  if (!memory) return null;

  saveMemory(memory);

  return event;
}

/**
 * 获取一条关系的全部时间线事件
 *
 * @param char1Name - 第一个角色名
 * @param char2Name - 第二个角色名
 * @returns 按时间戳排序的事件数组
 */
export function getRelationshipTimeline(char1Name: string, char2Name: string): RelationshipEvent[] {
  const relationship = getRelationship(char1Name, char2Name);

  if (!relationship) {
    return [];
  }

  return relationship.evolution.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * 获取关系弧线摘要（例如 "첫만남 → 오해 → 화해"）
 *
 * @param char1Name - 第一个角色名
 * @param char2Name - 第二个角色名
 * @returns 弧线摘要字符串
 */
export function getRelationshipArc(char1Name: string, char2Name: string): string {
  const timeline = getRelationshipTimeline(char1Name, char2Name);

  if (timeline.length === 0) {
    return '변화 없음';
  }

  return timeline.map(e => e.change).join(' → ');
}

// ============================================================================
// 图操作
// ============================================================================

/**
 * 获取某个角色的全部连接，并附带方向信息
 *
 * @param characterName - 角色名
 * @returns 带方向的连接（outgoing/incoming/mutual）
 */
export function getCharacterConnections(characterName: string): Array<{
  relationship: Relationship;
  direction: 'outgoing' | 'incoming' | 'mutual';
  otherCharacter: string;
}> {
  const relationships = listRelationships(characterName);

  return relationships.map(r => {
    const isFrom = r.from === characterName;
    return {
      relationship: r,
      direction: 'mutual' as const, // 大多数关系都是双向的
      otherCharacter: isFrom ? r.to : r.from
    };
  });
}

/**
 * 获取完整的关系图
 *
 * @returns 包含节点（角色）和边（关系）的图
 */
export function getRelationshipWeb(): {
  nodes: string[];
  edges: Array<{ from: string; to: string; type: RelationshipType }>
} {
  const memory = loadMemory();
  if (!memory) return { nodes: [], edges: [] };

  const nodes = new Set<string>();
  const edges: Array<{ from: string; to: string; type: RelationshipType }> = [];

  memory.relationships.forEach(r => {
    nodes.add(r.from);
    nodes.add(r.to);
    edges.push({ from: r.from, to: r.to, type: r.type });
  });

  return {
    nodes: Array.from(nodes),
    edges
  };
}

// ============================================================================
// 韩语标签
// ============================================================================

/**
 * 获取关系类型对应的韩语标签
 *
 * @param type - 关系类型
 * @returns 韩语标签
 */
export function getKoreanRelationType(type: RelationshipType): string {
  const labels: Record<RelationshipType, string> = {
    romantic: '연인',
    familial: '가족',
    friendship: '우정',
    antagonistic: '적대',
    professional: '직업적',
    mentor: '사제',
    complex: '복합적'
  };

  return labels[type];
}

// ============================================================================
// 档案生成
// ============================================================================

/**
 * 为一条关系生成 Markdown 档案
 *
 * @param char1Name - 第一个角色名
 * @param char2Name - 第二个角色名
 * @returns Markdown 档案
 */
export function generateRelationshipProfile(char1Name: string, char2Name: string): string {
  const relationship = getRelationship(char1Name, char2Name);

  if (!relationship) {
    return `# ${char1Name} ↔ ${char2Name}\n\n관계 정보 없음`;
  }

  const timeline = getRelationshipTimeline(char1Name, char2Name);
  const arc = getRelationshipArc(char1Name, char2Name);

  let profile = `# ${char1Name} ↔ ${char2Name}\n\n`;
  profile += `**관계 유형**: ${getKoreanRelationType(relationship.type)}\n`;
  profile += `**상태**: ${relationship.dynamic}\n`;

  if (relationship.speechLevel) {
    profile += `**말투**: ${relationship.speechLevel}\n`;
  }

  if (relationship.notes) {
    profile += `\n## 설명\n${relationship.notes}\n`;
  }

  if (timeline.length > 0) {
    profile += `\n## 관계 흐름\n${arc}\n\n`;
    profile += `## 주요 사건\n`;
    timeline.forEach(e => {
      profile += `- **${e.change}**: ${e.catalyst}`;
      if (e.sceneId) {
        profile += ` (${e.sceneId})`;
      }
      profile += '\n';
    });
  }

  return profile;
}

/**
 * 用符号生成所有关系的 ASCII 地图
 *
 * @returns ASCII 关系地图
 */
export function generateRelationshipMap(): string {
  const web = getRelationshipWeb();

  if (web.nodes.length === 0) {
    return '관계 없음';
  }

  const symbols: Record<RelationshipType, string> = {
    romantic: '♥',
    familial: '家',
    friendship: '友',
    antagonistic: '敵',
    professional: '職',
    mentor: '師',
    complex: '複'
  };

  let map = '# 관계 지도\n\n';

  web.nodes.forEach(node => {
    const connections = getCharacterConnections(node);
    if (connections.length > 0) {
      map += `${node}:\n`;
      connections.forEach(conn => {
        const symbol = symbols[conn.relationship.type];
        map += `  ${symbol} ${conn.otherCharacter} (${getKoreanRelationType(conn.relationship.type)})\n`;
      });
      map += '\n';
    }
  });

  return map;
}
