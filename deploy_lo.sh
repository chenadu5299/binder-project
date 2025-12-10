#!/bin/bash
# 从根目录的 DMG 部署 LibreOffice

set -e

cd "$(dirname "$0")"
DMG_FILE="LibreOffice_25.8.3_MacOS_aarch64.dmg"
TARGET_DIR="src-tauri/resources/libreoffice"

echo "📂 挂载 DMG: $DMG_FILE"
MOUNT_POINT=$(mktemp -d)
hdiutil attach "$DMG_FILE" -mountpoint "$MOUNT_POINT" -quiet -nobrowse

echo "📦 复制 LibreOffice.app..."
if [ -d "$TARGET_DIR/LibreOffice.app" ]; then
    echo "⚠️  删除现有版本..."
    rm -rf "$TARGET_DIR/LibreOffice.app"
fi

cp -R "$MOUNT_POINT/LibreOffice.app" "$TARGET_DIR/"

echo "🔧 设置执行权限..."
chmod +x "$TARGET_DIR/LibreOffice.app/Contents/MacOS/soffice"

echo "📂 卸载 DMG..."
hdiutil detach "$MOUNT_POINT" -quiet
rm -rf "$MOUNT_POINT"

echo ""
echo "✅ 部署完成！"
echo "📊 验证..."

if [ -f "$TARGET_DIR/LibreOffice.app/Contents/MacOS/soffice" ]; then
    echo "✅ 可执行文件验证成功"
    echo "📊 大小: $(du -sh "$TARGET_DIR/LibreOffice.app" | cut -f1)"
    echo "📍 位置: $TARGET_DIR/LibreOffice.app"
else
    echo "❌ 部署验证失败"
    exit 1
fi

