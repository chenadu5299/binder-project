# Build Mode Reference 索引

本目录索引的对象不是当前生效主线，而是：

- `REFERENCE ONLY`
- `FUTURE DESIGN REFERENCE`
- `NOT ACTIVE IMPLEMENTATION`

## 参考层定位

以下文档保留是为了：

1. 保存旧版 Build Mode / Discussion Build / Multi-Actor Build 的设计上下文。
2. 为未来若重新审批通过的多人讨论构建能力提供历史输入。
3. 作为当前 Chat Build 主线的反例边界，避免误回旧路线。

以下文档不得用于：

1. 作为当前实现的功能事实来源。
2. 作为当前代码命名、架构、状态机、协议的直接依据。
3. 作为当前版本评审时“已经决定的主线”。

## 参考层文档清单

### 旧版 BLD 主线设计

1. [`../R-BLD-C-D-01_构建模式产品定义与边界.md`](../R-BLD-C-D-01_%E6%9E%84%E5%BB%BA%E6%A8%A1%E5%BC%8F%E4%BA%A7%E5%93%81%E5%AE%9A%E4%B9%89%E4%B8%8E%E8%BE%B9%E7%95%8C.md)
2. [`../R-BLD-M-D-01_构建模式主控设计文档.md`](../R-BLD-M-D-01_%E6%9E%84%E5%BB%BA%E6%A8%A1%E5%BC%8F%E4%B8%BB%E6%8E%A7%E8%AE%BE%E8%AE%A1%E6%96%87%E6%A1%A3.md)
3. [`../R-BLD-M-D-02_直接构建功能设计.md`](../R-BLD-M-D-02_%E7%9B%B4%E6%8E%A5%E6%9E%84%E5%BB%BA%E5%8A%9F%E8%83%BD%E8%AE%BE%E8%AE%A1.md)
4. [`../R-BLD-M-D-03_讨论构建功能设计.md`](../R-BLD-M-D-03_%E8%AE%A8%E8%AE%BA%E6%9E%84%E5%BB%BA%E5%8A%9F%E8%83%BD%E8%AE%BE%E8%AE%A1.md)

### 旧版 BLD 技术与协议

1. [`../R-BLD-M-T-01_构建模式AI架构.md`](../R-BLD-M-T-01_%E6%9E%84%E5%BB%BA%E6%A8%A1%E5%BC%8FAI%E6%9E%B6%E6%9E%84.md)
2. [`../R-BLD-M-T-02_讨论组状态机与协作机制.md`](../R-BLD-M-T-02_%E8%AE%A8%E8%AE%BA%E7%BB%84%E7%8A%B6%E6%80%81%E6%9C%BA%E4%B8%8E%E5%8D%8F%E4%BD%9C%E6%9C%BA%E5%88%B6.md)
3. [`../R-BLD-M-T-03_项目实体模型.md`](../R-BLD-M-T-03_%E9%A1%B9%E7%9B%AE%E5%AE%9E%E4%BD%93%E6%A8%A1%E5%9E%8B.md)
4. [`../R-BLD-M-T-04_构建执行引擎.md`](../R-BLD-M-T-04_%E6%9E%84%E5%BB%BA%E6%89%A7%E8%A1%8C%E5%BC%95%E6%93%8E.md)
5. [`../R-BLD-M-P-01_主控AI与角色AI协议.md`](../R-BLD-M-P-01_%E4%B8%BB%E6%8E%A7AI%E4%B8%8E%E8%A7%92%E8%89%B2AI%E5%8D%8F%E8%AE%AE.md)
6. [`../R-BLD-M-P-02_构建模式提示词架构.md`](../R-BLD-M-P-02_%E6%9E%84%E5%BB%BA%E6%A8%A1%E5%BC%8F%E6%8F%90%E7%A4%BA%E8%AF%8D%E6%9E%B6%E6%9E%84.md)

### 旧版 BLD 接口与计划

1. [`../R-BLD-I-P-01_构建模式与Workspace接口.md`](../R-BLD-I-P-01_%E6%9E%84%E5%BB%BA%E6%A8%A1%E5%BC%8F%E4%B8%8EWorkspace%E6%8E%A5%E5%8F%A3.md)
2. [`../R-BLD-I-P-02_构建模式与模板库接口.md`](../R-BLD-I-P-02_%E6%9E%84%E5%BB%BA%E6%A8%A1%E5%BC%8F%E4%B8%8E%E6%A8%A1%E6%9D%BF%E5%BA%93%E6%8E%A5%E5%8F%A3.md)
3. [`../R-BLD-X-L-01_构建模式落地开发计划.md`](../R-BLD-X-L-01_%E6%9E%84%E5%BB%BA%E6%A8%A1%E5%BC%8F%E8%90%BD%E5%9C%B0%E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92.md)

### 历史稿

1. [`../R-BLD-M-R-01_构建模式主控设计文档（原始设计稿）.md`](../R-BLD-M-R-01_%E6%9E%84%E5%BB%BA%E6%A8%A1%E5%BC%8F%E4%B8%BB%E6%8E%A7%E8%AE%BE%E8%AE%A1%E6%96%87%E6%A1%A3%EF%BC%88%E5%8E%9F%E5%A7%8B%E8%AE%BE%E8%AE%A1%E7%A8%BF%EF%BC%89.md)

## 使用规则

1. 如果 Active 文档与 Reference 文档冲突，以 Active 为准。
2. 如果 Reference 文档与当前代码现状冲突，以当前代码现状为准。
3. 若未来多人讨论构建重新立项，应从当前 Active 主线分叉重建，不得直接“复活”旧 BLD 文档为现行规范。
