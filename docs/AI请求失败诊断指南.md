# AI 请求失败诊断指南

## 错误现象

当看到以下错误时：
```
AI 请求失败: 网络错误: 请求失败（已重试 3 次）: error sending request for url (https://api.deepseek.com/v1/chat/completions): error trying to connect: tcp connect error: Connection refused (os error 61)
```

这表示无法连接到 DeepSeek API 服务器。

## 可能的原因

### 1. 网络连接问题
- **症状**：无法访问互联网或网络不稳定
- **解决方法**：
  - 检查网络连接是否正常
  - 尝试访问其他网站确认网络可用
  - 重启网络连接

### 2. 防火墙阻止
- **症状**：防火墙阻止了应用程序的网络连接
- **解决方法**：
  - 检查系统防火墙设置
  - 将 Binder 添加到防火墙白名单
  - 临时关闭防火墙测试（仅用于诊断）

### 3. 需要配置代理
- **症状**：网络需要通过代理服务器访问外网
- **解决方法**：

#### macOS/Linux 设置代理：
```bash
# 在终端中设置环境变量（临时）
export HTTPS_PROXY=http://proxy.example.com:8080
export HTTP_PROXY=http://proxy.example.com:8080

# 永久设置（添加到 ~/.zshrc 或 ~/.bashrc）
echo 'export HTTPS_PROXY=http://proxy.example.com:8080' >> ~/.zshrc
echo 'export HTTP_PROXY=http://proxy.example.com:8080' >> ~/.zshrc
source ~/.zshrc
```

#### Windows 设置代理：
```cmd
# 在命令提示符中设置（临时）
set HTTPS_PROXY=http://proxy.example.com:8080
set HTTP_PROXY=http://proxy.example.com:8080

# 永久设置（通过系统设置）
# 1. 打开"系统设置" > "网络和 Internet" > "代理"
# 2. 配置代理服务器地址和端口
# 3. 重启应用程序
```

#### 在应用程序启动前设置：
- 如果使用代理，确保在启动 Binder 之前设置好环境变量
- 或者通过系统代理设置配置全局代理

### 4. DNS 解析问题
- **症状**：无法解析 `api.deepseek.com` 域名
- **解决方法**：
  ```bash
  # 测试 DNS 解析
  ping api.deepseek.com
  nslookup api.deepseek.com
  
  # 如果解析失败，尝试更换 DNS 服务器
  # macOS: 系统设置 > 网络 > 高级 > DNS
  # 添加 DNS 服务器：8.8.8.8, 1.1.1.1
  ```

### 5. API 服务器暂时不可用
- **症状**：DeepSeek API 服务器可能暂时不可用
- **解决方法**：
  - 等待一段时间后重试
  - 检查 DeepSeek 官方状态页面
  - 尝试使用其他 AI 提供商（如果已配置）

## 诊断步骤

### 步骤 1：检查网络连接
```bash
# 测试基本网络连接
ping 8.8.8.8

# 测试 DNS 解析
ping api.deepseek.com
```

### 步骤 2：检查代理配置
```bash
# 检查是否设置了代理
echo $HTTPS_PROXY
echo $HTTP_PROXY

# 如果使用代理，测试代理连接
curl -v --proxy $HTTPS_PROXY https://api.deepseek.com
```

### 步骤 3：检查防火墙
- macOS: 系统设置 > 网络 > 防火墙
- 确保 Binder 应用被允许通过防火墙

### 步骤 4：查看详细日志
- 打开终端查看应用程序的详细错误日志
- 日志会显示更详细的连接失败原因

## 快速解决方案

### 方案 1：使用系统代理（推荐）
如果系统已配置代理，确保：
1. 系统代理设置正确
2. 重启 Binder 应用程序
3. 应用程序会自动使用系统代理

### 方案 2：手动设置环境变量
```bash
# 设置代理（替换为你的代理地址）
export HTTPS_PROXY=http://your-proxy:port
export HTTP_PROXY=http://your-proxy:port

# 启动应用程序
./binder
```

### 方案 3：检查 API Key 配置
确保已正确配置 DeepSeek API Key：
1. 打开 Binder 设置
2. 检查 API Key 是否已配置
3. 确认 API Key 有效

## 常见问题

### Q: 为什么会出现 Connection refused 错误？
A: 这通常表示无法建立 TCP 连接到目标服务器，可能是网络问题、防火墙阻止或需要代理。

### Q: 如何知道是否需要代理？
A: 如果你在公司网络或需要代理才能访问外网的环境中，通常需要配置代理。

### Q: 设置了代理还是连接失败？
A: 检查：
1. 代理地址和端口是否正确
2. 代理是否需要认证（用户名/密码）
3. 代理服务器是否正常运行
4. 防火墙是否允许代理连接

### Q: 可以同时使用多个代理吗？
A: 通常只需要设置一个代理。`HTTPS_PROXY` 用于 HTTPS 连接，`HTTP_PROXY` 用于 HTTP 连接。

## 联系支持

如果以上方法都无法解决问题，请：
1. 收集详细的错误日志
2. 记录网络环境信息（是否使用代理、防火墙设置等）
3. 联系技术支持

## 更新日志

- 2026-01-06: 添加代理支持检测和详细错误诊断

