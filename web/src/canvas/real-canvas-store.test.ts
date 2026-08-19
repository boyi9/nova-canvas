import { describe, it, expect, beforeEach } from 'vitest';
import { RealCanvasStore } from './real-canvas-store';

describe('RealCanvasStore', () => {
  let store: RealCanvasStore;

  beforeEach(() => {
    store = new RealCanvasStore();
  });

  it('应自动创建默认项目', () => {
    const project = store.getActiveProject();
    expect(project).toBeDefined();
    expect(project.nodes).toHaveLength(0);
  });

  it('应支持创建和查询节点', () => {
    const node = store.createNode({
      type: 'reference',
      position: { x: 100, y: 100 },
      data: { prompt: 'test' },
    });
    expect(store.getNode(node.id)).toBeDefined();
    expect(store.getNodes()).toHaveLength(1);
  });

  it('应支持更新节点', () => {
    const node = store.createNode({
      type: 'text',
      position: { x: 0, y: 0 },
      data: { textContent: 'v1' },
    });
    const updated = store.updateNode(node.id, { data: { textContent: 'v2' } });
    expect(updated?.data.textContent).toBe('v2');
  });

  it('应支持删除节点并级联清理连接', () => {
    const a = store.createNode({ type: 'reference', position: { x: 0, y: 0 }, data: {} });
    const b = store.createNode({ type: 'generation', position: { x: 1, y: 1 }, data: {} });
    store.connectNodes({
      sourceNodeId: a.id,
      sourceHandle: 'output',
      targetNodeId: b.id,
      targetHandle: 'input',
    });
    const deleted = store.deleteNodes([a.id]);
    expect(deleted).toBe(1);
    expect(store.getActiveProject().connections).toHaveLength(0);
  });

  it('连接不存在节点时应抛错', () => {
    expect(() =>
      store.connectNodes({
        sourceNodeId: 'ghost',
        sourceHandle: 'out',
        targetNodeId: 'ghost2',
        targetHandle: 'in',
      })
    ).toThrow('Source node not found');
  });

  it('应支持多画布项目切换', () => {
    const p1 = store.getActiveProject();
    const p2 = store.createProject('second');
    store.switchProject(p2.id);
    expect(store.getActiveProject().id).toBe(p2.id);
    expect(store.listProjects()).toHaveLength(2);
    store.switchProject(p1.id);
    expect(store.getActiveProject().id).toBe(p1.id);
  });

  it('应支持上游节点遍历', () => {
    const a = store.createNode({ type: 'reference', position: { x: 0, y: 0 }, data: {} });
    const b = store.createNode({ type: 'generation', position: { x: 1, y: 1 }, data: {} });
    store.connectNodes({
      sourceNodeId: a.id,
      sourceHandle: 'output',
      targetNodeId: b.id,
      targetHandle: 'input',
    });
    const upstream = store.getUpstreamNodes(b.id);
    expect(upstream).toHaveLength(1);
    expect(upstream[0].id).toBe(a.id);
  });

  it('toJSON/fromJSON 应往返无损（历史画布迁移）', () => {
    store.createNode({ type: 'reference', position: { x: 5, y: 5 }, data: { prompt: 'x' } });
    const exported = store.toJSON();
    const newStore = new RealCanvasStore();
    newStore.fromJSON(exported);
    expect(newStore.toJSON()).toEqual(exported);
  });

  it('fromJSON 遇到非法数据应抛错', () => {
    expect(() => store.fromJSON({ nodes: 'not-array' } as never)).toThrow('Invalid canvas project JSON');
  });

  it('视口操作应正确合并', () => {
    store.setViewport({ x: 100 });
    store.setViewport({ zoom: 2 });
    const vp = store.getViewport();
    expect(vp).toEqual({ x: 100, y: 0, zoom: 2, rotation: 0 });
  });
});