@echo off
cd /d "%~dp0"
echo === MelodyV3 Go Build ===
set PATH=%PATH%;C:\Program Files\Go\bin
set GOPROXY=https://goproxy.cn,direct

echo === Build Frontend (esbuild) ===
where node >nul 2>nul
if %errorlevel%==0 (
  if not exist node_modules (
    call npm install
    if %errorlevel% neq 0 (
      echo [ERROR] npm install failed
      goto :buildfail
    )
  )
  call npm run build
  if %errorlevel% neq 0 (
    echo [ERROR] frontend build failed
    goto :buildfail
  )
) else (
  echo [WARN] node not found, use committed static\bundle.js
)

echo === Generate Icon + Version Resource ===
where winres >nul 2>nul
if %errorlevel%==0 (
  winres -i winres\winres.json -o rsrc_windows_amd64.syso
) else (
  echo [WARN] winres not found, keep committed rsrc_windows_amd64.syso
  echo        Install: go install github.com/tc-hib/go-winres@latest
)

echo === Build ===
go build -ldflags="-H windowsgui -s -w" -o dist\MelodyV3.exe .
if %errorlevel% equ 0 (
  copy /Y dist\MelodyV3.exe MelodyV3.exe
  echo === Build OK ===
  exit /b 0
)

:buildfail
echo === Build FAILED ===
exit /b 1
