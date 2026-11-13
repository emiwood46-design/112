# Возвращает всё, что удалил clean.ps1
Set-Location $PSScriptRoot
$adb = if (Test-Path ".\platform-tools\adb.exe") { ".\platform-tools\adb.exe" } else { "adb" }
$ip = Read-Host "IP-адрес телевизора"; if ($ip -notmatch ':') { $ip = "${ip}:5555" }
& $adb connect $ip
foreach ($pkg in Get-Content removed.txt) {
  if (-not $pkg) { continue }
  Write-Host "Восстанавливаю $pkg"
  & $adb -s $ip shell cmd package install-existing --user 0 $pkg
  & $adb -s $ip shell pm enable --user 0 $pkg | Out-Null
}
Read-Host "Готово. Enter для выхода"
