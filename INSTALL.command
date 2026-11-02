#!/bin/bash
# Double-click to install the anime-reel skill for Claude Code on this Mac.
cd "$(dirname "$0")"
mkdir -p "$HOME/.claude/skills"
if [ -d "$HOME/.claude/skills/anime-reel" ]; then
  read -p "anime-reel skill pehle se installed hai. Replace karein? (y/n) " a
  [ "$a" = "y" ] || { echo "Kuch nahi badla."; read -p "Enter dabao..."; exit 0; }
  rm -rf "$HOME/.claude/skills/anime-reel"
fi
cp -R skills/anime-reel "$HOME/.claude/skills/"
echo ""
echo "Ho gaya! Skill install: $HOME/.claude/skills/anime-reel"
echo "Ab Claude Code (local) mein kisi bhi folder mein /anime-reel likho."
echo ""
read -p "Pehli baar ke tools (ffmpeg, Node, PyTorch, alignment model ~2-3 GB) abhi install karein? (y/n) " b
[ "$b" = "y" ] && bash "$HOME/.claude/skills/anime-reel/scripts/setup.sh"
read -p "Enter dabao band karne ke liye..."
