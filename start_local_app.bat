@echo off
setlocal
set "APP_DIR=%~dp0"
echo ============================================================
echo   Omron Safety Layout Studio — Local Web App
echo   Opening http://localhost:8080/ in your browser...
echo   (Keep this window open while using the app. Ctrl+C to stop)
echo ============================================================
start "" "http://localhost:8080/"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = '%APP_DIR%'.TrimEnd('\'); " ^
  "$listener = New-Object System.Net.HttpListener; " ^
  "$listener.Prefixes.Add('http://localhost:8080/'); " ^
  "$listener.Start(); " ^
  "$mime = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.vsdx'='application/vnd.ms-visio.drawing.main+xml'; '.json'='application/json'; '.png'='image/png'; '.svg'='image/svg+xml' }; " ^
  "while ($listener.IsListening) { " ^
  "  $ctx = $listener.GetContext(); " ^
  "  $rel = $ctx.Request.Url.AbsolutePath.TrimStart('/'); if (-not $rel) { $rel = 'index.html' }; " ^
  "  $path = Join-Path $root ($rel -replace '/', '\'); " ^
  "  if (Test-Path $path -PathType Leaf) { " ^
  "    $ext = [System.IO.Path]::GetExtension($path).ToLower(); " ^
  "    $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }; " ^
  "    $bytes = [System.IO.File]::ReadAllBytes($path); " ^
  "    $ctx.Response.ContentLength64 = $bytes.Length; " ^
  "    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length); " ^
  "  } else { $ctx.Response.StatusCode = 404 }; " ^
  "  $ctx.Response.OutputStream.Close(); " ^
  "}"
