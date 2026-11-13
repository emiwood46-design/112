#!/usr/bin/env bash
# Очистка Xiaomi TV от рекламы и мусора через ADB (macOS / Linux)
set -u
cd "$(dirname "$0")"
command -v adb >/dev/null || { echo "Не найден adb. macOS: brew install android-platform-tools; Linux: sudo apt install adb"; exit 1; }

read -rp "IP-адрес телевизора (Настройки → Сеть): " IP
[[ "$IP" == *:* ]] || IP="$IP:5555"
adb connect "$IP"
echo "Если на ТВ появилось окно «Разрешить отладку по USB?» — нажмите «Разрешить» (с галочкой «Всегда»)."
read -rp "Нажмите Enter, когда разрешите..."
adb -s "$IP" get-state >/dev/null 2>&1 || { echo "Нет подключения к $IP"; exit 1; }
A="adb -s $IP shell"

echo "Модель: $($A getprop ro.product.model | tr -d '\r'), Android $($A getprop ro.build.version.release | tr -d '\r')"
STAMP=$(date +%Y%m%d-%H%M%S)
$A pm list packages | tr -d '\r' | sed 's/^package://' | sort > "backup-packages-$STAMP.txt"
echo "Список всех пакетов сохранён: backup-packages-$STAMP.txt"
INSTALLED=$(cat "backup-packages-$STAMP.txt")

ALL_ADS=""
read -rp "Удалить ВСЕ найденные рекламные/телеметрийные пакеты без вопросов? [y/N] " ALL_ADS
while IFS='|' read -r cat pkg desc; do
  [[ -z "$cat" || "$cat" == \#* ]] && continue
  grep -qx "$pkg" <<<"$INSTALLED" || continue
  if [[ "$cat" == ads && "$ALL_ADS" =~ ^[yYдД] ]]; then ans=y
  else read -rp "[$cat] $desc ($pkg) — удалить? [y/N] " ans </dev/tty; fi
  if [[ "$ans" =~ ^[yYдД] ]]; then
    out=$($A pm uninstall -k --user 0 "$pkg" | tr -d '\r')
    if [[ "$out" == Success* ]]; then echo "  ✓ удалён"; echo "$pkg" >> removed.txt
    else echo "  пробую отключить: $out"; $A pm disable-user --user 0 "$pkg" && echo "$pkg" >> removed.txt; fi
  fi
done < packages.txt

echo "Чищу кэш приложений..."
$A pm trim-caches 999999999999 >/dev/null 2>&1
read -rp "Ускорить анимации интерфейса (0.5x)? [y/N] " ans
if [[ "$ans" =~ ^[yYдД] ]]; then
  for k in window_animation_scale transition_animation_scale animator_duration_scale; do $A settings put global $k 0.5; done
fi
echo "Готово. Удалённые пакеты записаны в removed.txt (вернуть: ./restore.sh). Перезагрузить ТВ? [y/N]"
read -r ans; [[ "$ans" =~ ^[yYдД] ]] && adb -s "$IP" reboot
