param([string]$DevEcoHome = 'D:\DevEco Studio', [string]$BuildRoot = '', [string]$AuditDirectory = '', [string]$ArtifactDirectory = '')
$ErrorActionPreference = 'Stop'
# Self-contained helpers: this script must not depend on backend files, and must not rely on
# PowerShell 7-only syntax (-Encoding utf8NoBOM, [IO.Path]::GetRelativePath).
function Write-Utf8NoBom([string]$Path, [string]$Text) {
    $dir = [IO.Path]::GetDirectoryName($Path)
    if ($dir -and !(Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}
function Write-JsonFile([string]$Path, $Value, [int]$Depth = 10) { Write-Utf8NoBom $Path (($Value | ConvertTo-Json -Depth $Depth)) }
function Get-RelativePath([string]$Base, [string]$Full) {
    $baseFull = [IO.Path]::GetFullPath($Base).TrimEnd('\') + '\'
    $fullPath = [IO.Path]::GetFullPath($Full)
    if (!$fullPath.StartsWith($baseFull, [StringComparison]::OrdinalIgnoreCase)) { throw ('Path outside base: ' + $Full) }
    return $fullPath.Substring($baseFull.Length)
}
if ($PSVersionTable.PSVersion.Major -lt 7) { throw ('PowerShell 7 or later is required for the native build (current: ' + $PSVersionTable.PSVersion.ToString() + ').') }
try { [Console]::OutputEncoding = (New-Object Text.UTF8Encoding($false)) } catch { }
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$stamp = Get-Date -Format 'yyyyMMddTHHmmssfff'
if (!$BuildRoot) { $BuildRoot = Join-Path ([IO.Path]::GetTempPath()) "ict_mobile_$stamp" }
if ($BuildRoot -match '[^\x00-\x7F]' -or (Test-Path -LiteralPath $BuildRoot)) { throw 'BuildRoot must be a new ASCII directory' }
if (!$AuditDirectory) { $AuditDirectory = Join-Path $workspace "audit/client/${stamp}_harmony" }
# Products are published into the workspace so evidence does not depend on the system temp folder.
if (!$ArtifactDirectory) { $ArtifactDirectory = Join-Path $workspace "artifacts/client/hap/$stamp" }
$plugin = Join-Path $DevEcoHome 'tools/hvigor/hvigor-ohos-plugin'
$wrapper = Join-Path $DevEcoHome 'tools/hvigor/bin/hvigorw.bat'
if (!(Test-Path -LiteralPath $plugin) -or !(Test-Path -LiteralPath $wrapper)) { throw 'DevEco bundled Hvigor tools missing; supply -DevEcoHome' }
New-Item -ItemType Directory -Path $BuildRoot,$AuditDirectory,$ArtifactDirectory -Force | Out-Null
$manifest = @()
Get-ChildItem -LiteralPath $PSScriptRoot -File -Recurse | Where-Object { $_.FullName -notmatch '\\(build|oh_modules|node_modules|\.hvigor)\\' } | ForEach-Object {
    $relative = Get-RelativePath $PSScriptRoot $_.FullName
    $destination = Join-Path $BuildRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $destination
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    if ($hash -ne (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash) { throw 'Copy hash mismatch' }
    $manifest += @{path=$relative;sha256=$hash}
}
Write-JsonFile (Join-Path $AuditDirectory 'source-copy.json') $manifest 5
$configPath = Join-Path $BuildRoot 'hvigor/hvigor-config.json5'
$config = [IO.File]::ReadAllText($configPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
$config.dependencies.'@ohos/hvigor-ohos-plugin' = 'file:' + $plugin.Replace('\','/')
Write-Utf8NoBom $configPath (($config | ConvertTo-Json -Depth 12))
$env:DEVECO_SDK_HOME = Join-Path $DevEcoHome 'sdk'
$env:JAVA_HOME = Join-Path $DevEcoHome 'jbr'
$env:Path = (Join-Path $DevEcoHome 'tools/node') + ';' + (Join-Path $DevEcoHome 'jbr/bin') + ';' + $env:Path
$steps = @()
Push-Location $BuildRoot
try {
    foreach ($task in @('tasks','assembleHap','assembleApp')) {
        $args = @($task,'-p','product=default','-p','buildMode=debug','--no-daemon')
        $output = @(& $wrapper @args 2>&1 | ForEach-Object { "$_" }); $code = $LASTEXITCODE
        Write-Utf8NoBom (Join-Path $AuditDirectory "$task.log") ($output -join [Environment]::NewLine)
        $steps += @{command="hvigorw $($args -join ' ')";exitCode=$code}
        $output | ForEach-Object { Write-Output $_ }
        if ($code) { break }
    }
} finally { Pop-Location }
$buildOutputs = @(Get-ChildItem -LiteralPath $BuildRoot -File -Recurse | Where-Object {$_.Extension -in '.hap','.app'} | ForEach-Object { @{path=$_.FullName;size=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash} })
$products = @()
foreach ($item in $buildOutputs) {
    $target = Join-Path $ArtifactDirectory ([IO.Path]::GetFileName($item.path))
    Copy-Item -LiteralPath $item.path -Destination $target -Force
    $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($hash -ne $item.sha256) { throw ('Published product hash mismatch: ' + $item.path) }
    $products += @{path=$target;size=(Get-Item -LiteralPath $target).Length;sha256=$hash;sourceBuildPath=$item.path}
}
$reproduce = ((Get-Process -Id $PID).ProcessName + '.exe -NoProfile -File src/mobile/build-local.ps1')
$result = @{status=$(if($code){'failed'}else{'passed'});completedAt=(Get-Date -Format o);buildRoot=$BuildRoot;audit=$AuditDirectory;artifactDirectory=$ArtifactDirectory;devEcoHome=$DevEcoHome;shell=(Get-Process -Id $PID).ProcessName + ' ' + $PSVersionTable.PSVersion.ToString();steps=$steps;products=$products;buildOutputs=$buildOutputs;copyExclusions=@('build','oh_modules','node_modules','.hvigor');generatedConfigOverride=@{path='hvigor/hvigor-config.json5';plugin=$config.dependencies.'@ohos/hvigor-ohos-plugin'};signing='No private signing materials copied; inspect actual build logs and product filenames';evidenceBinding='products[] reference workspace copies under artifacts/client/hap; buildOutputs[] keep the raw temp paths';reproduce=$reproduce}
Write-JsonFile (Join-Path $AuditDirectory 'result.json') $result 12
Write-JsonFile (Join-Path $ArtifactDirectory 'manifest.json') $result 12
Write-JsonFile (Join-Path $workspace 'temp/client/latest-mobile-build.json') $result 12
Write-Output ('Status=' + $result.status + ' Audit=' + $AuditDirectory + ' Artifacts=' + $ArtifactDirectory)
if ($code) { exit $code }
