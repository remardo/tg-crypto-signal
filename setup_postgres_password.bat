@echo off
echo Setting up PostgreSQL password...
echo.
echo This script will help you reset the PostgreSQL password.
echo Make sure PostgreSQL service is running.
echo.

REM Try to connect using Windows authentication
echo Attempting to connect with Windows authentication...
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d postgres -c "ALTER USER postgres PASSWORD 'admin';"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Password has been set to 'admin' successfully!
    echo Please update your .env file with: DB_PASSWORD=admin
    echo.
) else (
    echo.
    echo ❌ Windows authentication failed.
    echo.
    echo Please try one of these options:
    echo 1. Open SQL Shell ^(psql^) from Start Menu
    echo 2. When prompted, press Enter for default values except password
    echo 3. Run: ALTER USER postgres PASSWORD 'admin';
    echo 4. Update .env file with: DB_PASSWORD=admin
    echo.
)

pause