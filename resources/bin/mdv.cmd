@echo off
rem mdv opens Markdown files in Markpad from a terminal.
rem The "Install 'mdv' command" menu item fills in DEFAULT_APP.
setlocal
set "DEFAULT_APP="
set "APP=%MARKPAD_APP%"
if "%APP%"=="" set "APP=%DEFAULT_APP%"
if "%APP%"=="" set "APP=%~dp0..\..\Markpad.exe"
if not exist "%APP%" (
  echo mdv: can't find the Markpad app. Set MARKPAD_APP to its executable. 1>&2
  exit /b 1
)

if /i "%~1"=="-h" goto help
if /i "%~1"=="--help" goto help
if /i "%~1"=="/?" goto help
if /i "%~1"=="-v" goto version
if /i "%~1"=="--version" goto version

start "" "%APP%" -- %*
exit /b 0

:help
echo Usage: mdv [OPTION]... [FILE]...
echo Open each FILE in Markpad, in a tab of the running window.
echo.
echo A FILE that doesn't exist opens as an empty document, and Markpad creates it
echo when you type. With no FILE, mdv starts Markpad or brings it to the front.
echo.
echo Options:
echo   -h, --help       Show this help and exit.
echo   -v, --version    Show the Markpad version and exit.
exit /b 0

:version
powershell -NoProfile -Command "(Get-Item -LiteralPath $env:APP).VersionInfo.ProductVersion"
exit /b 0
