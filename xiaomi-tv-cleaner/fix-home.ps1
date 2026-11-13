# Делает Projectivy главным экраном: отключает ВСЕ другие "домашние" приложения и пишет диагностику в diag.txt
Set-Location $PSScriptRoot
$adb = if (Test-Path ".\platform-tools\adb.exe") { ".\platform-tools\adb.exe" } else { "adb" }
$ip = Read-Host "IP-адрес телевизора"; if ($ip -notmatch ':') { $ip = "${ip}:5555" }
& $adb connect $ip; Read-Host "Разрешите отладку на ТВ (если спросит) и нажмите Enter"
if ((& $adb -s $ip get-state 2>$null) -ne "device") { Write-Host "Нет подключения к $ip"; Read-Host; exit 1 }
function Sh { & $adb -s $ip shell @args }
$log = "diag.txt"
"== Модель: $(Sh getprop ro.product.model) / Android $(Sh getprop ro.build.version.release)" | Set-Content $log -Encoding UTF8
"== Сейчас на экране:" | Add-Content $log; Sh "dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity'" | Add-Content $log
"== Отключённые пакеты:" | Add-Content $log; Sh pm list packages -d | Add-Content $log

$homes = Sh cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME |
  Select-String 'packageName=([\w.]+)' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
"== Домашние приложения: $($homes -join ', ')" | Add-Content $log
if ($homes -notcontains 'com.spocky.projengmenu') { Write-Host "Projectivy не найден среди домашних приложений. Пришлите мне diag.txt"; Read-Host; exit 1 }

foreach ($p in $homes) {
  if ($p -eq 'com.spocky.projengmenu' -or $p -match '(?i)settings') { continue }
  $r = "$(Sh pm disable-user --user 0 $p)".Trim()
  Write-Host "$p -> $r"; "== disable $p -> $r" | Add-Content $log
  if ($r -match 'new state') { Add-Content removed.txt $p }
}
$comp = (Sh cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME com.spocky.projengmenu | Select-Object -Last 1).Trim()
$r = "$(Sh cmd package set-home-activity $comp)".Trim()
"== set-home-activity $comp -> $r" | Add-Content $log; Write-Host "Главный экран: $comp -> $r"
Write-Host "`nПерезагружаю ТВ. Если снова появится PatchWall — пришлите мне содержимое файла diag.txt"
& $adb -s $ip reboot
Read-Host "Enter для выхода"
