# Workspace写入策略与资源边界

## 文档头

- 结构编码：`CBT-I-S-01`
- 文档属性：`Active 主线`
- 主责模块：`CBT`
- 文档职责：`定义 Chat Build 在 workspace 中的新增资源写入策略、命名规则、冲突处理和 partial build 标记`
- 上游约束：`CBT-I-P-01`, `CBT-I-T-01`, `CBT-I-T-02`
- 直接承接：`CBT-X-L-01`
- 接口耦合：`A-CBT-I-D-01`, `A-SYS-C-T-01`, `A-AG-M-T-05`, `A-WS-M-D-01_workspace工作台协同主控文档.md`
- 汇聚影响：`A-CORE-C-R-01`, `A-PROD-C-L-01`
- 扩散检查：`A-CBT-I-T-02`, `A-CBT-I-T-01`, `A-CBT-I-D-01`, `A-AG-M-T-05`, `A-PROD-C-L-01`
- 变更要求：`修改本文后，必须复核：A-CBT-I-T-02、A-CBT-I-T-01、A-CBT-I-D-01、A-AG-M-T-05、A-PROD-C-L-01`
- 使用边界：`只定义当前版本新增资源写入与边界控制，不展开未来编辑式覆盖写入能力`

---

## 一、文档定位

本文是 Chat Build 的 workspace 写入专项文档。

本文直接受以下规则约束：

1. `BR-CBT-ASSET-001`
2. `BR-CBT-DATA-001`

本文只回答：

1. Chat Build 生成的资源如何写入 workspace。
2. 命名和目录规则是什么。
3. 发生命名冲突时如何处理。
4. 中断或失败后如何保留残留与 partial build 标记。

## 二、写入总原则

当前版本写入策略必须同时满足：

1. 只新增资源，不修改既有内容。
2. 每一轮构建必须落在独立的 build root 下。
3. 已完成写入的资源默认保留，不做自动回滚。
4. 运行结束后必须留下可识别的元信息文件。

## 三、文件生成策略

### 3.1 支持的生成形态

当前版本只支持两种生成形态：

1. 单文件生成  
   目标是一个最小资源集合，其中至少包含一个主文件和元信息文件。

2. 多文件生成  
   目标是一个目录级资源集合，包含多个文件和可选子目录。

### 3.2 不支持的生成形态

当前版本不支持：

1. 写回既有目录中的既有文件
2. 将生成结果混入用户已有目录而不建立独立根目录
3. 跨多个已有目录分散写入

## 四、Build Root 命名规则

### 4.1 根目录规则

每轮 Chat Build 都必须创建独立的 build root。

推荐命名规则：

```text
<normalized_target_name>__build_<short_run_id>
```

示例：

```text
landing-page__build_a1b2c3
weekly-report__build_f9e8d7
```

### 4.2 文件命名规则

文件命名必须遵守：

1. 与 Build Outline 中的目标语义一致
2. 不覆盖 build root 之外的已有文件
3. 不允许空文件名
4. 不允许与系统元信息文件重名

系统元信息文件保留名：

1. `_build_meta.json`
2. `_build_steps.json`

## 五、冲突处理策略

### 5.1 根目录冲突

若 build root 名称与现有目录冲突：

1. 不覆盖现有目录
2. 自动追加新的 `short_run_id`
3. 重新生成唯一 build root

### 5.2 构建内文件冲突

若同一轮构建中两个步骤试图写入同一路径：

1. 视为 Build Outline / step plan 冲突
2. 当前运行进入 `failed`
3. 已写入内容保留
4. `_build_meta.json` 标记为 `failed` 且 `partial=true`

### 5.3 与既有文件冲突

若某一步目标文件在 workspace 中已存在：

1. 当前版本禁止覆盖
2. 优先通过独立 build root 避免冲突
3. 若仍冲突，当前步骤失败并终止本轮运行

## 六、写入时机与写入粒度

### 6.1 写入时机

每个 step 在满足以下条件后才允许写入：

1. 当前 step 已生成可写结果
2. 中断信号未命中
3. workspace writer 已通过路径边界校验

### 6.2 写入粒度

当前版本采用“step 完成后写入”的粒度：

1. 一个 step 对应一次显式写入
2. 写入成功后再进入下一个 step
3. 不做内联半写入

## 七、partial build 标记

### 7.1 元信息文件

每轮构建必须在 build root 内写入：

1. `_build_meta.json`
2. `_build_steps.json`

### 7.2 `_build_meta.json` 最小字段

```json
{
  "run_id": "build_123",
  "status": "completed | interrupted | failed",
  "partial": true,
  "outline_id": "outline_123",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

### 7.3 partial 规则

当满足以下任一条件时，`partial=true`：

1. 构建被中断
2. 构建失败但已有部分 step 写入成功

当且仅当全部 step 完成且无异常时：

1. `status=completed`
2. `partial=false`

## 八、中断后残留处理

中断命中后：

1. 已完成写入的文件保留
2. 已开始但未提交的写入必须丢弃
3. 未开始的 step 不写入
4. `_build_meta.json` 必须回写 `status=interrupted`
5. `_build_steps.json` 必须标记各 step 的完成/未开始/中断状态

失败时同理：

1. 已完成写入的文件保留
2. `status=failed`
3. `partial=true`

## 九、与执行链的关系

workspace writer 必须挂在 `A-CBT-I-T-02` 的 step loop 中，调用位置固定为：

1. step 结果生成后
2. 下一步开始前

伪代码：

```ts
if (stepResult.shouldWrite) {
  run.checkInterrupt();
  await workspaceWriter.write(stepResult.writePlan, run);
  run.checkInterrupt();
}
```

## 十、验收边界

以下情况视为未通过：

1. 写入覆盖既有文件
2. 构建结果落在既有目录中而非独立 build root
3. 中断后未回写 `interrupted` 元信息
4. 失败后未留下 partial build 标记
5. workspace writer 自行决定构建目标或跳过控制层校验
