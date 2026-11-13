#!/usr/bin/env bash
# Ставит свой лаунчер главным + оставляет только выбранные приложения (macOS / Linux)
set -u
cd "$(dirname "$0")"
command -v adb >/dev/null || { echo "Не найден adb"; exit 1; }
yes_() { [[ "$1" =~ ^[yYдД] ]]; }
read -rp "IP-адрес телевизора: " IP; [[ "$IP" == *:* ]] || IP="$IP:5555"
adb connect "$IP"; read -rp "Разрешите отладку на ТВ (если спросит) и нажмите Enter..."
adb -s "$IP" get-state >/dev/null 2>&1 || { echo "Нет подключения к $IP"; exit 1; }
A="adb -s $IP shell"
PKGS=$($A pm list packages | tr -d '\r' | sed 's/^package://')
has() { grep -qx "$1" <<<"$PKGS"; }

# --- 1. Лаунчер ---
NEW=""
for p in com.spocky.projengmenu me.efesser.flauncher; do has "$p" && NEW=$p && break; done
if [[ -z "$NEW" ]]; then
  echo "Новый лаунчер не найден. Установите на ТВ из Google Play «Projectivy Launcher» и запустите скрипт снова."; exit 1
fi
echo "Найден лаунчер: $NEW"
read -rp "Отключить стандартный главный экран (PatchWall / Google TV), чтобы кнопка Домой открывала $NEW? [y/N] " a
if yes_ "$a"; then
  for p in com.mitv.tvhome com.google.android.apps.tv.launcherx com.google.android.tvlauncher com.google.android.leanbacklauncher; do
    has "$p" || continue
    $A pm disable-user --user 0 "$p" && echo "$p" >> removed.txt && echo "  отключён $p"
  done
fi

# --- 2. Выбор приложений ---
APPS=$( { $A cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER
          $A cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.LAUNCHER; } \
        | tr -d '\r' | grep -o 'packageName=[A-Za-z0-9_.]*' | cut -d= -f2 | sort -u \
        | grep -Eiv 'settings|launcher|tvhome|projengmenu|com\.android\.vending|com\.google\.android\.gms|tvplayer|inputs|^com\.android\.tv$')
mapfile -t LIST <<<"$APPS"
echo; echo "Приложения на ТВ:"
for i in "${!LIST[@]}"; do
  d=$(grep "|${LIST[$i]}|" packages.txt 2>/dev/null | cut -d'|' -f3)
  printf "%3d) %s %s\n" $((i+1)) "${LIST[$i]}" "${d:+— $d}"
done
echo; read -rp "Номера приложений, которые ОСТАВИТЬ (через пробел): " KEEP
DEL=()
for i in "${!LIST[@]}"; do [[ " $KEEP " == *" $((i+1)) "* ]] || DEL+=("${LIST[$i]}"); done
echo; echo "Будут удалены:"; printf '  %s\n' "${DEL[@]}"
read -rp "Удалить? [y/N] " a; yes_ "$a" || exit 0
for p in "${DEL[@]}"; do
  out=$($A pm uninstall -k --user 0 "$p" | tr -d '\r')
  [[ "$out" == Success* ]] || $A pm disable-user --user 0 "$p" >/dev/null
  echo "$p" >> removed.txt; echo "  убран $p"
done
echo "Готово. Перезагружаю ТВ..."; adb -s "$IP" reboot
