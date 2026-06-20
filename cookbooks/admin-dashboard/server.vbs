Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "D:\admin-dashboard"
objShell.Run "cmd /c npx http-server -p 8086 --cors", 0, False
WScript.Sleep 3000
objShell.Run "msedge.exe --app=http://127.0.0.1:8086 --no-first-run --no-default-browser-check", 1, False
