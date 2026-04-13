# 构建中断机制

## 文档头

- 结构编码：`CBT-I-S-02`
- 文档属性：`Active 主线`
- 主责模块：`CBT`
- 文档职责：`定义 Chat Build 中断触发路径、传播机制、步骤残留处理与 interrupted 回写规则`
- 上游约束：`CBT-I-P-01`, `CBT-I-T-01`, `CBT-I-T-02`
- 直接承接：`CBT-X-L-01`
- 接口耦合：`A-CBT-I-S-01`, `A-CBT-I-D-01`, `A-AG-M-T-05`
- 汇聚影响：`A-CORE-C-R-01`, `A-PROD-C-D-04`
- 扩散检查：`A-CBT-I-T-02`, `A-CBT-I-T-01`, `A-CBT-I-S-01`, `A-CBT-I-D-01`, `A-PROD-C-D-04`, `A-AG-M-T-05`
- 变更要求：`修改本文后，必须复核：A-CBT-I-T-02、A-CBT-I-T-01、A-CBT-I-S-01、A-CBT-I-D-01、A-PROD-C-D-04、A-AG-M-T-05`
- 使用边界：`只定义当前版本 cooperative interrupt 机制，不展开任务恢复、断点续跑或多方审批中断`

---

## 一、文档定位

本文是 Chat Build 的中断专项文档。

它直接受以下规则约束：

1. `BR-CBT-STATE-002`
2. `BR-CBT-STATE-001`

本文只回答：

1. 中断从哪里触发。
2. 中断信号如何沿执行链传播。
3. 已完成 / 未完成 step 如何处理。
4. `interrupted` 状态如何回写。

## 二、中断原则

当前版本采用 **cooperative interrupt**：

1. 中断只允许在 `building` 态触发。
2. 中断不是强杀线程，而是通过安全点协作生效。
3. 中断只结束当前运行，不改写当前运行目标。
4. 中断后必须返回 `interrupted`，然后再回到 `discussion`。

## 三、中断触发路径

### 3.1 UI 触发

当前版本的主触发路径是：

```text
用户点击“停止构建”
→ chat 交互层发出 interrupt request
→ Chat Build 控制层登记 interrupt_requested
→ Build Runner 在下一安全点停止
```

### 3.2 command 触发

若后续存在显式 command 层，则必须满足：

1. 只允许对当前运行中的 `run_id` 触发
2. 不允许对非 `building` 态的运行发出中断
3. command 只设置中断信号，不直接改写结束态

## 四、中断传播路径

```text
UI / command
→ ChatBuildController.requestInterrupt(runId)
→ BuildInterruptSignal.requested = true
→ BuildRunner.checkInterrupt()
→ stop scheduling new step
→ finalizeInterrupted(runId)
→ durable record.markInterrupted(runId)
→ UI 刷新 interrupted
```

## 五、中断注入点

当前必须至少在以下位置调用 `checkInterrupt()`：

1. step 开始前
2. 单步 AI 调用返回后
3. workspace 写入前
4. workspace 写入后
5. finalize 前

伪代码：

```ts
for (const step of outline.steps) {
  checkInterrupt();

  const result = await executeStep(step, run);

  checkInterrupt();

  if (result.shouldWrite) {
    await workspaceWriter.write(result.writePlan, run);
  }

  checkInterrupt();
}
```

## 六、已完成步骤与未完成步骤处理

### 6.1 已完成步骤

已满足以下条件的步骤视为已完成：

1. step 结果已生成
2. 若该 step 需要写入，则写入已成功提交

已完成步骤处理原则：

1. 保留其输出
2. 保留其步骤状态
3. 进入结束态后不回滚

### 6.2 未完成步骤

以下步骤视为未完成：

1. 尚未开始的步骤
2. 已开始但尚未得到 step 结果
3. 已得到结果但尚未完成写入提交

未完成步骤处理原则：

1. 不写入结果
2. 标记为 `skipped` 或 `not_started`
3. 不在恢复逻辑中继续自动执行

## 七、状态回写

### 7.1 interrupted 回写时机

只有在 Build Runner 停止调度并进入 finalize 阶段后，才允许写入 `interrupted`。

不允许：

1. UI 一点击就直接把状态改成 `interrupted`
2. 绕过 runner 停止确认直接结束

### 7.2 回写内容

最少必须回写：

1. 主状态：`interrupted`
2. 结束摘要
3. 当前已完成步骤列表
4. 当前未完成步骤列表
5. `partial=true`

伪代码：

```ts
function finalizeInterrupted(run: BuildRunContext) {
  durableRecord.markInterrupted({
    runId: run.id,
    completedSteps: run.completedSteps,
    pendingSteps: run.pendingSteps,
    partial: true,
  });

  buildStore.setState("interrupted");
}
```

## 八、与 workspace 残留的关系

中断与残留处理必须和 `A-CBT-I-S-01` 联动：

1. 已提交写入的资源保留
2. 未提交的写入丢弃
3. `_build_meta.json` 标记 `status=interrupted`
4. `_build_steps.json` 标记 step 完成状态

## 九、验收边界

以下情况视为未通过：

1. `building` 外的状态也能触发中断
2. 中断后当前运行仍继续调度后续步骤
3. UI 点击中断后直接当作“改需求成功”
4. 中断后状态未回写为 `interrupted`
5. 已完成和未完成步骤没有分开处理
