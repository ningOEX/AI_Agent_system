# Start local MongoDB as a hidden background process.
# Data persists in %LOCALAPPDATA%\MongoDB\data
$bin = "$env:LOCALAPPDATA\Programs\MongoDB\mongodb-win32-x86_64-windows-9.0.2\bin"

$running = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "MongoDB is already running (port 27017)"
    exit 0
}

Start-Process -FilePath "$bin\mongod.exe" `
    -ArgumentList '--dbpath', "$env:LOCALAPPDATA\MongoDB\data", '--port', '27017', '--bind_ip', '127.0.0.1', '--logpath', "$env:LOCALAPPDATA\MongoDB\log\mongod.log" `
    -WindowStyle Hidden

Start-Sleep -Seconds 3
$ok = Test-NetConnection -ComputerName 127.0.0.1 -Port 27017 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($ok) { Write-Host "MongoDB started: mongodb://127.0.0.1:27017" } else { Write-Host "Failed to start. See log: $env:LOCALAPPDATA\MongoDB\log\mongod.log" }
