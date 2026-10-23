// Neo4j 图数据库封装
// 存储企业关联关系（股权/任职/投资/控制）
// 禁止业务代码直写 Cypher，所有查询通过本模块封装方法调用

import neo4j, { Driver, Session } from 'neo4j-driver';
import { getNeo4jConfig } from '../api-keys';
import type { GraphData, GraphNode, GraphEdge } from '../types';

export class Neo4jStore {
  private driver: Driver | null = null;

  /**
   * 获取 Neo4j 驱动（单例）
   */
  getDriver(): Driver {
    if (!this.driver) {
      const config = getNeo4jConfig();
      this.driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password));
    }
    return this.driver;
  }

  /**
   * 获取会话
   */
  private getSession(): Session {
    return this.getDriver().session();
  }

  /**
   * 查询企业关联关系图谱
   * @param enterpriseId 企业 ID，不传则返回全量
   */
  async getRelations(enterpriseId?: string): Promise<GraphData> {
    const session = this.getSession();
    try {
      const query = enterpriseId
        ? `
          MATCH (n)-[r]-(m)
          WHERE n.id = $enterpriseId OR m.id = $enterpriseId
          RETURN n, r, m
        `
        : `
          MATCH (n)-[r]-(m)
          RETURN n, r, m LIMIT 500
        `;

      const result = await session.run(query, enterpriseId ? { enterpriseId } : {});

      const nodeMap = new Map<string, GraphNode>();
      const edgeMap = new Map<string, GraphEdge>();

      for (const record of result.records) {
        const n = record.get('n');
        const m = record.get('m');
        const r = record.get('r');

        if (n) nodeMap.set(n.elementId, this.toGraphNode(n));
        if (m) nodeMap.set(m.elementId, this.toGraphNode(m));
        if (r) {
          const edge = this.toGraphEdge(r);
          edgeMap.set(edge.id, edge);
        }
      }

      return {
        nodes: Array.from(nodeMap.values()),
        edges: Array.from(edgeMap.values()),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * 关闭驱动连接
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  private toGraphNode(node: { properties: Record<string, unknown>; elementId: string }): GraphNode {
    const props = node.properties;
    return {
      id: (props.id as string) ?? node.elementId,
      type: (props.type as GraphNode['type']) ?? 'enterprise',
      name: (props.name as string) ?? '',
      refId: props.refId as string | undefined,
      meta: props.meta as string | undefined,
      detail: props.detail as string | undefined,
    };
  }

  private toGraphEdge(rel: {
    properties: Record<string, unknown>;
    elementId: string;
    type: string;
    startNodeElementId: string;
    endNodeElementId: string;
  }): GraphEdge {
    const props = rel.properties;
    return {
      id: (props.id as string) ?? rel.elementId,
      source: rel.startNodeElementId,
      target: rel.endNodeElementId,
      type: (props.type as GraphEdge['type']) ?? (rel.type as GraphEdge['type']),
      label: props.label as string | undefined,
      weight: props.weight as number | undefined,
    };
  }
}

// 单例导出
export const neo4jStore = new Neo4jStore();
