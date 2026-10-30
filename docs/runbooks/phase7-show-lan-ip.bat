@echo off
echo ============================================================
echo  Phase 7 security check: is the Brainy server reachable
echo  from OUTSIDE this computer?
echo ============================================================
echo.
echo Step 1: Make sure the app is running (a separate window
echo running "npm run dev") before you do the phone step below.
echo.
echo Step 2: Your computer's network address(es) on this WiFi:
echo.
ipconfig | findstr /i "IPv4"
echo.
echo Step 3: On your PHONE (connected to the SAME WiFi as this
echo computer), open any browser and go to:
echo.
echo     http://THE-NUMBER-ABOVE:4000/health
echo.
echo     (swap in whichever IPv4 address was printed above,
echo      e.g. http://192.168.1.42:4000/health)
echo.
echo ============================================================
echo  PASS = the page on your phone fails to load, times out,
echo         or says something like "can't reach this page" /
echo         "site can't be reached".
echo  FAIL = the page actually loads and shows text starting
echo         with {"status":"ok" ...}
echo ============================================================
echo.
echo Tell Claude which one happened (PASS or FAIL) and this item
echo is done either way - a FAIL just means there's more to fix.
echo.
pause
