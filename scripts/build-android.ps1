$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$androidRoot = "D:\Android"
$preferredJdk = Join-Path $androidRoot "Jdk\21"
$preferredSdk = Join-Path $androidRoot "Sdk"
$preferredGradle = Join-Path $androidRoot "Gradle"

$jdkHome = if (Test-Path -LiteralPath (Join-Path $preferredJdk "bin\javac.exe")) {
    $preferredJdk
} else {
    $env:JAVA_HOME
}
$sdkHome = if (Test-Path -LiteralPath (Join-Path $preferredSdk "platforms")) {
    $preferredSdk
} elseif ($env:ANDROID_HOME) {
    $env:ANDROID_HOME
} else {
    $env:ANDROID_SDK_ROOT
}
$gradleHome = if (Test-Path -LiteralPath $preferredGradle) {
    $preferredGradle
} else {
    $env:GRADLE_USER_HOME
}

if (-not $jdkHome -or -not (Test-Path -LiteralPath (Join-Path $jdkHome "bin\javac.exe"))) {
    throw "没有找到完整 JDK。请设置 JAVA_HOME，或安装到 D:\Android\Jdk\21。"
}
if (-not $sdkHome -or -not (Test-Path -LiteralPath (Join-Path $sdkHome "platforms\android-36\android.jar"))) {
    throw "没有找到 Android SDK Platform 36。请设置 ANDROID_HOME，或安装到 D:\Android\Sdk。"
}

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $sdkHome
$env:ANDROID_SDK_ROOT = $sdkHome
if ($gradleHome) {
    $env:GRADLE_USER_HOME = $gradleHome
}
$env:Path = "$(Join-Path $jdkHome 'bin');$(Join-Path $sdkHome 'platform-tools');$env:Path"

$gradleOptions = @(
    "-Dorg.gradle.internal.http.connectionTimeout=60000",
    "-Dorg.gradle.internal.http.socketTimeout=60000"
)
$localProxy = Get-NetTCPConnection `
    -LocalAddress "127.0.0.1" `
    -LocalPort 7890 `
    -State Listen `
    -ErrorAction SilentlyContinue
if ($localProxy) {
    $gradleOptions += @(
        "-Dhttps.proxyHost=127.0.0.1",
        "-Dhttps.proxyPort=7890",
        "-Dhttp.proxyHost=127.0.0.1",
        "-Dhttp.proxyPort=7890"
    )
}
$env:GRADLE_OPTS = (($env:GRADLE_OPTS, ($gradleOptions -join " ")) -join " ").Trim()

Push-Location $projectRoot
try {
    & npm run mobile:sync
    if ($LASTEXITCODE -ne 0) {
        throw "移动端资源同步失败，退出码：$LASTEXITCODE"
    }

    Push-Location (Join-Path $projectRoot "android")
    try {
        & .\gradlew.bat assembleDebug --no-daemon --console=plain --max-workers=2
        if ($LASTEXITCODE -ne 0) {
            throw "Android APK 构建失败，退出码：$LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
} finally {
    Pop-Location
}

$apkPath = Join-Path $projectRoot "android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host "APK 已生成：$apkPath"
