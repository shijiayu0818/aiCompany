# RULES.md

> 项目细粒度开发规则，与 AGENTS.md 配合使用。
> 优先级：AGENTS.md > 本文件 > 全局 user_rules.md。

## 一、编码风格

1. 缩进：2 空格。
2. 引号：单引号 `'`，JSX 属性用双引号 `"`。
3. 分号：语句末尾不加分号，与 Vite/React 生态一致。
4. 行宽：单行不超过 120 字符。
5. 尾逗号：多行结构（对象/数组/函数参数）末尾加尾逗号。

## 二、命名约定

| 类型 | 规范 | 示例 |
|---|---|---|
| 文件/目录 | kebab-case | `company-adapter.ts`、`graph-view.tsx` |
| 组件/类/接口/类型 | 大驼峰 | `GraphView`、`SupervisorState` |
| 变量/函数/方法 | 小驼峰 | `companyQuery`、`buildGraph()` |
| 常量 | 全大写下划线 | `MAX_RETRY_COUNT` |
| 布尔变量 | is/has/can 前缀 | `isLoading`、`hasError` |

## 三、类型约束

1. 禁止使用 `any`；必须使用时优先 `unknown` 并做类型收窄。
2. 避免 `// @ts-ignore`，若必须使用须加注释说明原因。
3. 函数参数和返回值必须显式标注类型。
4. 接口优先于 `type`（需要联合类型时用 `type`）。
5. 导入类型用 `import type`。

## 四、Agent 开发规则

1. **State 字段必须定义 Reducer**，三选一：覆盖 `(curr, next) => next`、保留优先 `(curr, next) => next ?? curr`、追加。
2. **Supervisor 必须用 `withStructuredOutput` + Zod Schema**，约束决策输出格式。
3. **每个 Adapter 必须独立 try/catch**，错误信息写入对应 Output 字段，不抛出异常。
4. Worker 之间通过 State 通信，禁止直接调用其他 Worker。
5. 条件路由函数必须覆盖所有分支（含"都不需要"时的兜底走向）。
6. Reporter/图谱组装器只读取 Worker Output 字段，不重新调用数据源。

## 五、向量库规则

1. Worker 只依赖 `VectorStore` 抽象接口，禁止 import 具体后端实现。
2. 向量检索必须传 `collectionName` 和 `topK`，禁止全局共享一个 collection。
3. 向量库不可用时，Worker 降级为直接读 Mock JSON，不抛出异常。

## 六、安全规则

1. API Key 只存在 Node.js 后端 `.env.local`，前端代码禁止出现任何密钥。
2. Mock 数据不包含真实企业敏感信息。
3. `.env.local`、`.chroma/`、`node_modules/`、`dist/` 必须 gitignore。

## 七、禁止项

1. 禁止跳过 `pnpm typecheck` / `pnpm lint` 直接交付。
2. 禁止遗留 `console.log`、`debugger` 在提交代码中。
3. 禁止擅自重构无关代码，只修改当前需求涉及的范围。
4. 禁止一次性重写整个文件，优先增量 Edit。
5. 禁止编造项目不存在的文件或 API。
