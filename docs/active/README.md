# Chat Build 过渡索引

本目录不再承担当前 Active 主线的正式定义职责。

当前正式生效的 Chat Build 主线文档已经进入 `docs/` 根目录，文件名统一为 `A-CBT-*`。

本页只承担：

1. 快速导航
2. 迁移过渡说明
3. 指向新的正式主线文档

适用前提：

1. 当前版本只讨论 `Chat Build`。
2. 当前版本不引入 `Discussion Build`、`Multi-Actor Build`、真人参与、邀请链接、分享协作。
3. 当前文档必须与现有代码基础设施可承接，但不得把通用基础设施误写成“Chat Build 已实现”。

## 阅读顺序

1. [`A-CBT-C-D-01_Chat Build产品定义与边界.md`](../A-CBT-C-D-01_Chat%20Build%E4%BA%A7%E5%93%81%E5%AE%9A%E4%B9%89%E4%B8%8E%E8%BE%B9%E7%95%8C.md)  
   用于冻结当前版本的产品定义、边界和排除项。

2. [`A-CBT-M-D-01_Chat Build交互流程.md`](../A-CBT-M-D-01_Chat%20Build%E4%BA%A4%E4%BA%92%E6%B5%81%E7%A8%8B.md)  
   用于定义从自由讨论到大纲确认再到正式构建的用户流程。

3. [`A-CBT-M-T-01_Chat Build执行模型.md`](../A-CBT-M-T-01_Chat%20Build%E6%89%A7%E8%A1%8C%E6%A8%A1%E5%9E%8B.md)  
   用于冻结“单主控、冻结式、只生成新资源”的执行模型。

4. [`A-CBT-I-D-01_Chat Build与当前实现承接.md`](../A-CBT-I-D-01_Chat%20Build%E4%B8%8E%E5%BD%93%E5%89%8D%E5%AE%9E%E7%8E%B0%E6%89%BF%E6%8E%A5.md)  
   用于说明当前代码能承接什么、不能承接什么，以及仍缺哪些主链。

5. [`A-CBT-I-P-01_Chat Build最小协议与状态.md`](../A-CBT-I-P-01_Chat%20Build%E6%9C%80%E5%B0%8F%E5%8D%8F%E8%AE%AE%E4%B8%8E%E7%8A%B6%E6%80%81.md)  
   用于冻结最小状态流、控制协议、最小对象与责任边界，避免后续实现漂移。

6. [`A-CBT-I-T-01_Chat Build状态控制与实现映射.md`](../A-CBT-I-T-01_Chat%20Build%E7%8A%B6%E6%80%81%E6%8E%A7%E5%88%B6%E4%B8%8E%E5%AE%9E%E7%8E%B0%E6%98%A0%E5%B0%84.md)  
   用于把状态、控制规则、实现责任与验收边界压成开发控制面。

7. [`A-CBT-I-T-02_Chat Build执行链与运行控制.md`](../A-CBT-I-T-02_Chat%20Build%E6%89%A7%E8%A1%8C%E9%93%BE%E4%B8%8E%E8%BF%90%E8%A1%8C%E6%8E%A7%E5%88%B6.md)  
   用于定义从 chat 输入到 step 循环、workspace 写入、结束态回写的最小可编码执行链。

8. [`A-CBT-I-S-01_Workspace写入策略与资源边界.md`](../A-CBT-I-S-01_Workspace%E5%86%99%E5%85%A5%E7%AD%96%E7%95%A5%E4%B8%8E%E8%B5%84%E6%BA%90%E8%BE%B9%E7%95%8C.md)  
   用于定义新增资源写入、命名规则、冲突处理和 partial build 标记。

9. [`A-CBT-I-S-02_构建中断机制.md`](../A-CBT-I-S-02_%E6%9E%84%E5%BB%BA%E4%B8%AD%E6%96%AD%E6%9C%BA%E5%88%B6.md)  
   用于定义中断触发、传播、安全点停止与 interrupted 回写。

10. [`A-CBT-I-S-03_Chat与Build接管机制.md`](../A-CBT-I-S-03_Chat%E4%B8%8EBuild%E6%8E%A5%E7%AE%A1%E6%9C%BA%E5%88%B6.md)  
   用于定义构建前、中、后 chat 与 build 的接管关系和输入限制。

11. [`A-CBT-X-L-01_Chat Build推进计划.md`](../A-CBT-X-L-01_Chat%20Build%E6%8E%A8%E8%BF%9B%E8%AE%A1%E5%88%92.md)  
   用于给后续实现提供对象、依赖、阶段和规则级验收的开发计划。

## 与其他文档的关系

### 仍可复用的通用文档

1. [`../A-CORE-C-D-02_产品术语边界.md`](../A-CORE-C-D-02_%E4%BA%A7%E5%93%81%E6%9C%AF%E8%AF%AD%E8%BE%B9%E7%95%8C.md)
2. [`../A-SYS-C-T-01_系统总体架构.md`](../A-SYS-C-T-01_%E7%B3%BB%E7%BB%9F%E6%80%BB%E4%BD%93%E6%9E%B6%E6%9E%84.md)
3. [`../A-WS-M-D-01_workspace工作台协同主控文档.md`](../A-WS-M-D-01_workspace%E5%B7%A5%E4%BD%9C%E5%8F%B0%E5%8D%8F%E5%90%8C%E4%B8%BB%E6%8E%A7%E6%96%87%E6%A1%A3.md)
4. [`../A-TMP-M-D-02_Binder模板库模块描述文档.md`](../A-TMP-M-D-02_Binder%E6%A8%A1%E6%9D%BF%E5%BA%93%E6%A8%A1%E5%9D%97%E6%8F%8F%E8%BF%B0%E6%96%87%E6%A1%A3.md)
5. [`../A-AG-M-T-03_任务规划执行.md`](../A-AG-M-T-03_%E4%BB%BB%E5%8A%A1%E8%A7%84%E5%88%92%E6%89%A7%E8%A1%8C.md)

### 已清理的旧构建文档

旧 `R-BLD-*` 文档已清理出仓库，不再作为当前主线或参考层保留。

索引见：[`../reference/README.md`](../reference/README.md)
