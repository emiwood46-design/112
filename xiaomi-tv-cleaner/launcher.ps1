# Ставит свой лаунчер главным + оставляет только выбранные приложения (Windows)
Set-Location $PSScriptRoot
$adb = if (Test-Path ".\platform-tools\adb.exe") { ".\platform-tools\adb.exe" } else { "adb" }
function Yes($a) { return $a -match '^[yYдД]' }
$ip = Read-Host "IP-адрес телевизора"; if ($ip -notmatch ':') { $ip = "${ip}:5555" }
& $adb connect $ip; Read-Host "Разрешите отладку на ТВ (если спросит) и нажмите Enter"
if ((& $adb -s $ip get-state 2>$null) -ne "device") { Write-Host "Нет подключения к $ip"; Read-Host; exit 1 }
function Sh { & $adb -s $ip shell @args }
$pkgs = Sh pm list packages | ForEach-Object { $_.Trim() -replace '^package:', '' }

# --- 1. Лаунчер ---
$new = @('com.spocky.projengmenu','me.efesser.flauncher') | Where-Object { $pkgs -contains $_ } | Select-Object -First 1
if (-not $new) { Write-Host "Новый лаунчер не найден. Установите на ТВ из Google Play «Projectivy Launcher» и запустите снова."; Read-Host; exit 1 }
Write-Host "Найден лаунчер: $new"
if (Yes (Read-Host "Отключить стандартный главный экран (PatchWall / Google TV), чтобы кнопка Домой открывала его? [y/N]")) {
  foreach ($p in 'com.mitv.tvhome','com.google.android.apps.tv.launcherx','com.google.android.tvlauncher','com.google.android.leanbacklauncher') {
    if ($pkgs -contains $p) { Sh pm disable-user --user 0 $p; Add-Content removed.txt $p; Write-Host "  отключён $p" }
  }
}

# --- 2. Выбор приложений ---
$raw = (Sh cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER) +
       (Sh cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.LAUNCHER)
$list = @($raw | Select-String 'packageName=([\w.]+)' -AllMatches | ForEach-Object { $_.Matches } |
  ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique |
  Where-Object { $_ -notmatch '(?i)settings|launcher|tvhome|projengmenu|^com\.android\.vending$|^com\.google\.android\.gms$|tvplayer|inputs|^com\.android\.tv$' })
$desc = @{}; foreach ($l in Get-Content packages.txt -Encoding UTF8) { $f = $l.Split('|'); if ($f.Count -eq 3) { $desc[$f[1]] = $f[2] } }
Write-Host "`nПриложения на ТВ:"
for ($i = 0; $i -lt $list.Count; $i++) { Write-Host ("{0,3}) {1} {2}" -f ($i+1), $list[$i], $(if ($desc[$list[$i]]) { "— " + $desc[$list[$i]] })) }
$keep = (Read-Host "`nНомера приложений, которые ОСТАВИТЬ (через пробел)") -split '\s+' | Where-Object { $_ }
$del = @(for ($i = 0; $i -lt $list.Count; $i++) { if ($keep -notcontains "$($i+1)") { $list[$i] } })
Write-Host "`nБудут удалены:"; $del | ForEach-Object { Write-Host "  $_" }
if (-not (Yes (Read-Host "Удалить? [y/N]"))) { exit 0 }
foreach ($p in $del) {
  $out = "$(Sh pm uninstall -k --user 0 $p)".Trim()
  if ($out -notlike 'Success*') { Sh pm disable-user --user 0 $p | Out-Null }
  Add-Content removed.txt $p; Write-Host "  убран $p"
}
Write-Host "Готово. Перезагружаю ТВ..."; & $adb -s $ip reboot
Read-Host "Enter для выхода"
