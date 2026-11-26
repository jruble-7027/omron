$ErrorActionPreference = "Stop"
$root = $PSScriptRoot.TrimEnd('\')

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".vsdx" = "application/vnd.ms-visio.drawing.main+xml"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

$listener = $null
$url = ""
foreach ($port in @(8080, 8081, 8085, 8090)) {
    try {
        $l = New-Object System.Net.HttpListener
        $l.Prefixes.Add("http://localhost:$port/")
        $l.Start()
        $listener = $l
        $url = "http://localhost:$port/"
        break
    } catch {
        if ($l) { $l.Close() }
    }
}

if (-not $listener) {
    throw "Could not bind to localhost ports 8080, 8081, 8085, or 8090."
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Omron Safety Layout Studio — Local Server Running!" -ForegroundColor Green
Write-Host "  URL: $url" -ForegroundColor Yellow
Write-Host "  Keep this window open while using the app. Press Ctrl+C to stop."
Write-Host "============================================================" -ForegroundColor Cyan

Start-Process $url

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        try {
            $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
            if (-not $rel) { $rel = "index.html" }
            $fullPath = Join-Path $root ($rel -replace '/', '\')

            if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
                $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                $ctx.Response.ContentLength64 = $bytes.Length
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $ctx.Response.StatusCode = 404
            }
        } catch {
            $ctx.Response.StatusCode = 500
        } finally {
            $ctx.Response.OutputStream.Close()
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
