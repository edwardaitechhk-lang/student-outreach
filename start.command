#!/bin/bash
# WhatsApp 客戶保暖工具 — 雙擊啟動
cd "$(dirname "$0")"
echo ""
echo "💛 WhatsApp 客戶保暖工具 啟動中..."
echo ""
if ! command -v node &> /dev/null; then
  echo "❌ 未裝 Node.js。請先裝：https://nodejs.org"
  echo ""
  read -p "撳 Enter 離開..."
  exit 1
fi
if [ ! -d "node_modules" ]; then
  echo "📦 首次執行 — 裝緊 dependencies..."
  npm install --no-audit --no-fund
fi
node server.js
