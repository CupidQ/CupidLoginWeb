Set-Location $PSScriptRoot
$env:GOCACHE = Join-Path $PSScriptRoot '.cache\go-build'
$env:GOMODCACHE = Join-Path $PSScriptRoot '.cache\go-mod'
$env:GOPATH = Join-Path $PSScriptRoot '.cache\go'
go run .
