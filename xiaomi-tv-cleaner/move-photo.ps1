# Готовит фото под экран ТВ (16:9) со сдвигом вниз/вверх и закидывает на телевизор
Set-Location $PSScriptRoot
Add-Type -AssemblyName System.Drawing
$adb = if (Test-Path ".\platform-tools\adb.exe") { ".\platform-tools\adb.exe" } else { "adb" }
$src = (Resolve-Path "photo.jpg" -ErrorAction SilentlyContinue)
if (-not $src) { Write-Host "Положите фото в эту папку под именем photo.jpg"; Read-Host; exit 1 }
$W = 3840; $H = 2160

while ($true) {
  $pct = Read-Host "На сколько % высоты экрана сдвинуть фото ВНИЗ (например 10; минус = вверх)"
  $pct = [double]($pct -replace ',', '.')
  $img = [System.Drawing.Image]::FromFile($src)
  # поворот по EXIF (фото с телефона)
  if ($img.PropertyIdList -contains 0x0112) {
    switch ($img.GetPropertyItem(0x0112).Value[0]) { 3 { $img.RotateFlip('Rotate180FlipNone') } 6 { $img.RotateFlip('Rotate90FlipNone') } 8 { $img.RotateFlip('Rotate270FlipNone') } }
  }
  $mode = if ($img.Width / $img.Height -ge 1) { 'fill' } else { 'fit' }   # горизонтальное — на весь экран, вертикальное — целиком
  $s = if ($mode -eq 'fill') { [Math]::Max($W / $img.Width, $H / $img.Height) } else { $H / $img.Height }
  $w = [int]($img.Width * $s); $h = [int]($img.Height * $s)
  $x = [int](($W - $w) / 2); $y = [int](($H - $h) / 2 + $H * $pct / 100)
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Black)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($img, $x, $y, $w, $h)
  $g.Dispose(); $img.Dispose()
  $out = Join-Path $PSScriptRoot "screensaver.jpg"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Jpeg); $bmp.Dispose()
  Start-Process $out
  if ((Read-Host "Открыл screensaver.jpg — так нормально? [y = отправить на ТВ / n = подобрать заново]") -match '^[yYдД]') { break }
}

$ip = Read-Host "IP-адрес телевизора"; if ($ip -notmatch ':') { $ip = "${ip}:5555" }
& $adb connect $ip | Out-Null
& $adb -s $ip push screensaver.jpg /sdcard/Screensaver/photo.jpg
& $adb -s $ip shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Screensaver/photo.jpg | Out-Null
Write-Host "Готово. Запускаю заставку для проверки..."
& $adb -s $ip shell am start -n com.android.systemui/.Somnambulator | Out-Null
Read-Host "Enter для выхода"
