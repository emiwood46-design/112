# Очистка Xiaomi TV от рекламы и мусора через ADB (Windows)
Set-Location $PSScriptRoot
$adb = if (Test-Path ".\platform-tools\adb.exe") { ".\platform-tools\adb.exe" } else { "adb" }
if (-not (Get-Command $adb -ErrorAction SilentlyContinue)) {
  Write-Host "Не найден adb. Скачайте platform-tools: https://developer.android.com/tools/releases/platform-tools"
  Write-Host "и распакуйте папку platform-tools рядом с этим скриптом."; Read-Host; exit 1
}
function Yes($a) { return $a -match '^[yYдД]' }

$ip = Read-Host "IP-адрес телевизора (Настройки -> Сеть)"
if ($ip -notmatch ':') { $ip = "${ip}:5555" }
& $adb connect $ip
Write-Host "Если на ТВ появилось окно «Разрешить отладку?» — нажмите «Разрешить» (с галочкой «Всегда»)."
Read-Host "Нажмите Enter, когда разрешите"
if ((& $adb -s $ip get-state 2>$null) -ne "device") { Write-Host "Нет подключения к $ip"; Read-Host; exit 1 }
function Sh { & $adb -s $ip shell @args }

$model = (Sh getprop ro.product.model).Trim(); $ver = (Sh getprop ro.build.version.release).Trim()
Write-Host "Модель: $model, Android $ver"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$installed = Sh pm list packages | ForEach-Object { $_.Trim() -replace '^package:', '' } | Sort-Object
$installed | Set-Content "backup-packages-$stamp.txt" -Encoding UTF8
Write-Host "Список всех пакетов сохранён: backup-packages-$stamp.txt"

$allAds = Yes (Read-Host "Удалить ВСЕ найденные рекламные/телеметрийные пакеты без вопросов? [y/N]")
foreach ($line in Get-Content packages.txt -Encoding UTF8) {
  if (-not $line -or $line.StartsWith('#')) { continue }
  $cat, $pkg, $desc = $line.Split('|')
  if ($installed -notcontains $pkg) { continue }
  $ok = if ($cat -eq 'ads' -and $allAds) { $true } else { Yes (Read-Host "[$cat] $desc ($pkg) — удалить? [y/N]") }
  if ($ok) {
    $out = "$(Sh pm uninstall -k --user 0 $pkg)".Trim()
    if ($out -like 'Success*') { Write-Host "  удалён"; Add-Content removed.txt $pkg }
    else { Write-Host "  пробую отключить: $out"; Sh pm disable-user --user 0 $pkg; Add-Content removed.txt $pkg }
  }
}

Write-Host "Чищу кэш приложений..."
Sh pm trim-caches 999999999999 | Out-Null
if (Yes (Read-Host "Ускорить анимации интерфейса (0.5x)? [y/N]")) {
  foreach ($k in 'window_animation_scale','transition_animation_scale','animator_duration_scale') { Sh settings put global $k 0.5 }
}
Write-Host "Готово. Удалённые пакеты записаны в removed.txt (вернуть: restore.bat)."
if (Yes (Read-Host "Перезагрузить ТВ? [y/N]")) { & $adb -s $ip reboot }
Read-Host "Enter для выхода"
