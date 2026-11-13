#!/usr/bin/env bash
# Возвращает всё, что удалил clean.sh
cd "$(dirname "$0")"
read -rp "IP-адрес телевизора: " IP; [[ "$IP" == *:* ]] || IP="$IP:5555"
adb connect "$IP"
[ -f removed.txt ] || { echo "removed.txt не найден"; exit 1; }
while read -r pkg; do
  [ -z "$pkg" ] && continue
  echo "Восстанавливаю $pkg"
  adb -s "$IP" shell cmd package install-existing --user 0 "$pkg"
  adb -s "$IP" shell pm enable --user 0 "$pkg" >/dev/null 2>&1
done < removed.txt
