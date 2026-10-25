param([string]$DevEcoHome = 'D:\DevEco Studio')
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw ('PowerShell 7 or later is required (current: ' + $PSVersionTable.PSVersion.ToString() + ').') }
try { [Console]::OutputEncoding = (New-Object Text.UTF8Encoding($false)) } catch { }
function Write-Utf8NoBom([string]$Path, [string]$Text) {
    $dir = [IO.Path]::GetDirectoryName($Path)
    if ($dir -and !(Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$stamp = Get-Date -Format 'yyyyMMddTHHmmssfff'
$audit = Join-Path $workspace "audit/client/${stamp}_week7b_environment"
New-Item -ItemType Directory -Path $audit -Force | Out-Null
$steps = [Collections.Generic.List[object]]::new()
function Probe([string]$Name,[string]$Exe,[string[]]$Arguments) {
    $started = Get-Date -Format o
    if (!(Test-Path -LiteralPath $Exe)) {
        $step = [ordered]@{name=$Name;command=$Exe;startedAt=$started;completedAt=(Get-Date -Format o);exitCode=$null;state='tool_missing';output=''}
    } else {
        $info = [Diagnostics.ProcessStartInfo]::new($Exe)
        $info.UseShellExecute=$false; $info.CreateNoWindow=$true
        $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
        # Arguments instead of ArgumentList: ArgumentList does not exist on .NET Framework.
        $info.Arguments = ($Arguments -join ' ')
        $process = [Diagnostics.Process]::new(); $process.StartInfo=$info
        $null=$process.Start()
        $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
        $finished=$process.WaitForExit(30000)
        if (!$finished) { $process.Kill(); $process.WaitForExit() }
        $text=$stdout.GetAwaiter().GetResult()+$stderr.GetAwaiter().GetResult()
        $step=[ordered]@{name=$Name;command=('"'+$Exe+'" '+($Arguments -join ' '));startedAt=$started;completedAt=(Get-Date -Format o);exitCode=$process.ExitCode;state=$(if(!$finished){'timed_out'}elseif($process.ExitCode){'command_failed'}else{'executed'});output=$text.Trim()}
        $process.Dispose()
    }
    Write-Utf8NoBom (Join-Path $audit "$Name.json") (($step | ConvertTo-Json -Depth 5))
    $steps.Add($step)
    return $step
}
$productPath=Join-Path $DevEcoHome 'product-info.json'
$sdkPath=Join-Path $DevEcoHome 'sdk/default/sdk-pkg.json'
$product=if(Test-Path -LiteralPath $productPath){Get-Content -LiteralPath $productPath -Raw | ConvertFrom-Json}else{$null}
$sdk=if(Test-Path -LiteralPath $sdkPath){(Get-Content -LiteralPath $sdkPath -Raw | ConvertFrom-Json).data}else{$null}
$hvigorPath=Join-Path $DevEcoHome 'tools/hvigor/hvigor-ohos-plugin/package.json'
$hvigor=if(Test-Path -LiteralPath $hvigorPath){Get-Content -LiteralPath $hvigorPath -Raw | ConvertFrom-Json}else{$null}
$hdc=Join-Path $DevEcoHome 'sdk/default/openharmony/toolchains/hdc.exe'
$manager=Join-Path $DevEcoHome 'tools/emulator/Emulator.exe'
$settings=Join-Path $env:APPDATA 'Huawei/DevEcoStudio26.0/options/deviceManager.xml'
$agreements=Join-Path $env:LOCALAPPDATA 'Huawei/Emulator26.0/.emu_config'
$configuration=[ordered]@{settingsPath=$settings;settingsPresent=(Test-Path -LiteralPath $settings);agreementsPath=$agreements;agreementsPresent=(Test-Path -LiteralPath $agreements);paths=@{};agreements=@{};hashesBefore=@{};hashesAfter=@{}}
foreach($file in @($settings,$agreements)){
    if(Test-Path -LiteralPath $file){$configuration.hashesBefore[$file]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}
}
if($configuration.settingsPresent){
    [xml]$xml=Get-Content -LiteralPath $settings -Raw
    foreach($option in $xml.application.component.option){
        if($option.name -in @('imageDeployPath','openharmonyDeployPath','instancePath','imageRoot')){
            $configuration.paths[$option.name]=@{path=[string]$option.value;exists=(Test-Path -LiteralPath $option.value)}
        }
    }
}
if($configuration.agreementsPresent){
    foreach($line in Get-Content -LiteralPath $agreements){
        if($line -match '^(HarmonyOS_Software_Service_Agreement|HarmonyOS_SDK_Agreement):(agree|disagree)$'){
            $configuration.agreements[$Matches[1]]=$Matches[2]
        }
    }
}
$hdcVersion=Probe 'hdc-version' $hdc @('-v')
$targets=Probe 'hdc-targets' $hdc @('list','targets')
$managerVersion=Probe 'manager-version' $manager @('-version')
$instances=Probe 'manager-instances' $manager @('-list','-details')
$images=Probe 'manager-downloaded-images' $manager @('-imageList','-downloaded','true')
foreach($file in @($settings,$agreements)){
    if(Test-Path -LiteralPath $file){$configuration.hashesAfter[$file]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}
}
$configurationUnchanged=(@($configuration.hashesBefore.Keys | Where-Object {$configuration.hashesBefore[$_] -ne $configuration.hashesAfter[$_]}).Count -eq 0)
$targetState=if($targets.state -ne 'executed'){'unknown_check_failed'}elseif($targets.output -eq '[Empty]'){'no_target_reported'}elseif([string]::IsNullOrWhiteSpace($targets.output)){'unknown_empty_output'}else{'target_reported_not_yet_verified'}
$instanceState=if($instances.state -ne 'executed'){'unknown_check_failed'}elseif($instances.output -eq '[Empty]'){'no_instances_in_manager_default_scope'}elseif([string]::IsNullOrWhiteSpace($instances.output)){'unknown_empty_output'}else{'instances_reported_not_yet_started_or_verified'}
$blockers=@()
if($targetState -ne 'target_reported_not_yet_verified'){$blockers+='No hdc target available for device validation.'}
if($configuration.agreements['HarmonyOS_Software_Service_Agreement'] -eq 'disagree'){$blockers+='HarmonyOS Software Service Agreement is not accepted; owner must review it before emulator startup.'}
if($instanceState -eq 'no_instances_in_manager_default_scope'){$blockers+='Manager default scope has no instance. No instance was created.'}
$executionStatus=if(@($steps | Where-Object {$_.state -ne 'executed'}).Count -or !$configurationUnchanged){'failed'}else{'completed'}
$reproduce=((Get-Process -Id $PID).ProcessName + '.exe -NoProfile -File src/mobile/inspect-environment.ps1')
$result=[ordered]@{generatedAt=(Get-Date -Format o);executionStatus=$executionStatus;readinessStatus=$(if($blockers.Count){'blocked'}else{'not_device_verified'});auditDirectory=$audit;scriptSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash;shell=((Get-Process -Id $PID).ProcessName + ' ' + $PSVersionTable.PSVersion.ToString());devEco=@{path=$DevEcoHome;version=$product.version;buildNumber=$product.buildNumber};sdk=@{path=$sdkPath;version=$sdk.version;apiVersion=$sdk.apiVersion};hvigor=@{path=$hvigorPath;version=$hvigor.version};hdc=@{path=$hdc;versionOutput=$hdcVersion.output;inPath=[bool](Get-Command hdc -ErrorAction SilentlyContinue);targetState=$targetState};manager=@{path=$manager;versionOutput=$managerVersion.output;instanceState=$instanceState;downloadedImageState=$(if($images.state -ne 'executed'){'unknown_check_failed'}elseif([string]::IsNullOrWhiteSpace($images.output)){'unknown_blank_output_not_installation_success'}elseif($images.output -eq '[Empty]'){'none_reported'}else{'see_raw_output'});guiInspected=$false};configuration=$configuration;configurationUnchanged=$configurationUnchanged;blockers=$blockers;steps=@($steps);limits=@('Manager CLI default scope checked; arbitrary custom locations are not exhaustively searched.','No agreement acceptance, emulator creation/start/download, device installation, network forwarding, or system change.','CLI exit 0 and blank output do not establish installed images or device readiness.');reproduce=$reproduce}
Write-Utf8NoBom (Join-Path $audit 'result.json') (($result | ConvertTo-Json -Depth 12))
$lines=@('# 第7周B环境复核','',('时间：'+$result.generatedAt),'',('执行：'+$executionStatus+'；设备就绪：'+$result.readinessStatus),'',('DevEco '+$product.version+'；SDK '+$sdk.version+'；Hvigor '+$hvigor.version+'；'+$hdcVersion.output+'；'+$managerVersion.output),'',('hdc状态：'+$targetState),'',('管理器实例：'+$instanceState),'',('已下载镜像：'+$result.manager.downloadedImageState),'',('管理器配置/协议文件未变更：'+$configurationUnchanged),'','## 阻塞','')
foreach($item in $blockers){$lines+='- '+$item}
$lines+=@('','## 命令与结果','','| 检查 | 命令 | 退出码 | 结果 |','|---|---|---:|---|')
foreach($step in $steps){$lines+='| '+$step.name+' | `'+$step.command+'` | '+$step.exitCode+' | '+$step.output.Replace("`r",'').Replace("`n",'<br>')+' |'}
$lines+=@('','## 限制','')+$result.limits+@('',('复现：`'+$result.reproduce+'`'))
Write-Utf8NoBom (Join-Path $audit 'result.md') ($lines -join [Environment]::NewLine)
foreach($extension in @('md','json')){Copy-Item -LiteralPath (Join-Path $audit "result.$extension") -Destination (Join-Path $workspace "audit/client/latest_week7b_environment.$extension")}
Write-Output ($result | ConvertTo-Json -Depth 4)
if($executionStatus -eq 'failed'){exit 1}
