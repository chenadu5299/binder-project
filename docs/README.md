# Binder 文档状态总说明

## 当前生效主线

当前与“项目级构建”相关的唯一生效主线是：

- `Chat Build`
- 主线入口：[`A-CBT-C-D-01_Chat Build产品定义与边界.md`](./A-CBT-C-D-01_Chat%20Build%E4%BA%A7%E5%93%81%E5%AE%9A%E4%B9%89%E4%B8%8E%E8%BE%B9%E7%95%8C.md)
- 开发控制：[`A-CBT-I-T-01_Chat Build状态控制与实现映射.md`](./A-CBT-I-T-01_Chat%20Build%E7%8A%B6%E6%80%81%E6%8E%A7%E5%88%B6%E4%B8%8E%E5%AE%9E%E7%8E%B0%E6%98%A0%E5%B0%84.md)
- 执行链设计：[`A-CBT-I-T-02_Chat Build执行链与运行控制.md`](./A-CBT-I-T-02_Chat%20Build%E6%89%A7%E8%A1%8C%E9%93%BE%E4%B8%8E%E8%BF%90%E8%A1%8C%E6%8E%A7%E5%88%B6.md)
- 关键专项：[`A-CBT-I-S-01_Workspace写入策略与资源边界.md`](./A-CBT-I-S-01_Workspace%E5%86%99%E5%85%A5%E7%AD%96%E7%95%A5%E4%B8%8E%E8%B5%84%E6%BA%90%E8%BE%B9%E7%95%8C.md)、[`A-CBT-I-S-02_构建中断机制.md`](./A-CBT-I-S-02_%E6%9E%84%E5%BB%BA%E4%B8%AD%E6%96%AD%E6%9C%BA%E5%88%B6.md)、[`A-CBT-I-S-03_Chat与Build接管机制.md`](./A-CBT-I-S-03_Chat%E4%B8%8EBuild%E6%8E%A5%E7%AE%A1%E6%9C%BA%E5%88%B6.md)
- 开发计划：[`A-CBT-X-L-01_Chat Build推进计划.md`](./A-CBT-X-L-01_Chat%20Build%E6%8E%A8%E8%BF%9B%E8%AE%A1%E5%88%92.md)
- 过渡索引：[`docs/active/README.md`](./active/README.md)

当前主线的产品口径是：

1. 以自然对话完成需求收敛。
2. 在大纲确认后启动正式构建。
3. 构建开始后进入冻结式执行，不接受自然语义改向。
4. 构建只生成新的项目资源，不修改既有内容。
5. 当前不纳入 Discussion Build、Multi-Actor Build、真人参与、分享链接、邀请协作。

## Active 与 Reference 的关系

### Active

当前生效主线文档已经进入 `docs/` 根目录的正式 Active 序列，以 `A-CBT-*` 文件名存在。

这些文档用于：

1. 定义当前版本的 Chat Build 产品边界。
2. 约束当前版本的交互流程和执行模型。
3. 说明 Chat Build 与当前代码基础设施的真实承接关系。
4. 定义 Chat Build 的最小状态流、控制协议与责任边界。
5. 为后续 V1 Direct Build 开发提供唯一主线认知。

### Reference

旧的 `R-BLD-*` 文档已完成清理，不再保留在仓库内。

这些文档：

1. 相关历史逻辑已退出当前仓库主阅读链。
2. 不代表当前版本实现路径。
3. 不得作为当前代码设计、实现评审、命名判断的直接依据。

参考索引见：[`docs/reference/README.md`](./reference/README.md)

## 当前仍可复用的基础文档

以下文档仍可作为 Chat Build 的通用基础设施参考，但它们本身不等于 Chat Build 已实现：

1. [`A-CORE-C-D-02_产品术语边界.md`](./A-CORE-C-D-02_%E4%BA%A7%E5%93%81%E6%9C%AF%E8%AF%AD%E8%BE%B9%E7%95%8C.md)
2. [`A-SYS-C-T-01_系统总体架构.md`](./A-SYS-C-T-01_%E7%B3%BB%E7%BB%9F%E6%80%BB%E4%BD%93%E6%9E%B6%E6%9E%84.md)
3. [`A-WS-M-D-01_workspace工作台协同主控文档.md`](./A-WS-M-D-01_workspace%E5%B7%A5%E4%BD%9C%E5%8F%B0%E5%8D%8F%E5%90%8C%E4%B8%BB%E6%8E%A7%E6%96%87%E6%A1%A3.md)
4. [`A-TMP-M-D-02_Binder模板库模块描述文档.md`](./A-TMP-M-D-02_Binder%E6%A8%A1%E6%9D%BF%E5%BA%93%E6%A8%A1%E5%9D%97%E6%8F%8F%E8%BF%B0%E6%96%87%E6%A1%A3.md)
5. [`A-AG-M-T-03_任务规划执行.md`](./A-AG-M-T-03_%E4%BB%BB%E5%8A%A1%E8%A7%84%E5%88%92%E6%89%A7%E8%A1%8C.md)

使用这些文档时必须遵守：

1. 通用基础设施不等于 Chat Build 已实现。
2. 如果基础文档中的旧 BLD 术语与 `A-CBT-*` 主线冲突，以 `A-CBT-*` 主线为准。

## 维护规则

1. 新增当前版本的构建相关文档，优先进入 `docs/` 根目录中的 `A-CBT-*` 正式主线序列。
2. `docs/active/README.md` 仅保留为过渡索引，不再承担主线定义职责。
3. 旧版讨论构建、多角色构建、真人协作设计，不再以 `R-BLD-*` 形式保留在仓库中，也不得回写为当前主线。
4. 若未来 Discussion Build 获批重启，应从当前 `A-CBT-*` 主线重新立项，不得直接复活旧文档作为现行规范。
