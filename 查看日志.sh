#!/bin/bash
# 查看 Binder 应用日志的脚本

echo "=== Binder 日志查看工具 ==="
echo ""

# 检查日志文件
LOG_FILE="$HOME/.binder/logs/binder.log"

if [ -f "$LOG_FILE" ]; then
    echo "📝 日志文件位置: $LOG_FILE"
    echo ""
    echo "选择操作:"
    echo "1. 查看最新日志（最后50行）"
    echo "2. 实时跟踪日志（tail -f）"
    echo "3. 查看包含 'edit_current_editor_document' 的日志"
    echo "4. 查看包含 'ERROR' 的日志"
    echo "5. 查看所有日志"
    echo ""
    read -p "请选择 (1-5): " choice
    
    case $choice in
        1)
            echo "=== 最新日志 ==="
            tail -50 "$LOG_FILE"
            ;;
        2)
            echo "=== 实时跟踪日志（按 Ctrl+C 退出）==="
            tail -f "$LOG_FILE"
            ;;
        3)
            echo "=== 文档编辑相关日志 ==="
            grep -i "edit_current_editor_document" "$LOG_FILE" | tail -50
            ;;
        4)
            echo "=== 错误日志 ==="
            grep -i "ERROR" "$LOG_FILE" | tail -50
            ;;
        5)
            echo "=== 所有日志 ==="
            cat "$LOG_FILE"
            ;;
        *)
            echo "无效选择"
            ;;
    esac
else
    echo "⚠️ 日志文件不存在: $LOG_FILE"
    echo ""
    echo "提示：日志会输出到终端（stderr），请在前台运行开发服务器查看："
    echo "  cd $(pwd)"
    echo "  npm run tauri:dev"
    echo ""
    echo "或者查看系统日志："
    echo "  log show --predicate 'process == \"binder\"' --last 5m --style compact"
fi

