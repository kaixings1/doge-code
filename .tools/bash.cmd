@echo off
setlocal
set PATH=%PATH%;C:\Program Files\Nodejs;C:\Program Files\Bun\bin;C:\Users\Administrator\.bun\bin;C:\Users\Administrator\AppData\Roaming\npm;C:\Users\Administrator\.cargo\bin;C:\ProgramData\chocolatey\bin;C:\Windows\system32
bash -c "source ~/.bashrc 2>/dev/null; exec %*"
endlocal
