# Stop local MongoDB
$p = Get-Process mongod -ErrorAction SilentlyContinue
if ($p) {
    $p | Stop-Process -Force
    Write-Host "MongoDB stopped"
} else {
    Write-Host "MongoDB is not running"
}
