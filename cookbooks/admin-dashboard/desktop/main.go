package main

import (
	_ "embed"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

//go:embed web/index.html
var indexHTML string

//go:embed web/css/style.css
var styleCSS string

//go:embed web/js/app.js
var appJS string

func main() {
	// 解压嵌入的前端资源到临时目录
	tmpDir, _ := os.MkdirTemp("", "admin-panel")
	defer os.RemoveAll(tmpDir)

	os.MkdirAll(filepath.Join(tmpDir, "css"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "js"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "index.html"), []byte(indexHTML), 0644)
	os.WriteFile(filepath.Join(tmpDir, "css", "style.css"), []byte(styleCSS), 0644)
	os.WriteFile(filepath.Join(tmpDir, "js", "app.js"), []byte(appJS), 0644)

	// 找空闲端口启动本地服务器
	listener, _ := net.Listen("tcp", "127.0.0.1:0")
	port := listener.Addr().(*net.TCPAddr).Port

	http.Handle("/", http.FileServer(http.Dir(tmpDir)))
	go http.Serve(listener, nil)

	url := fmt.Sprintf("http://127.0.0.1:%d", port)

	// 用 Edge 应用模式打开（看起来像桌面应用，无浏览器工具栏）
	edgePath := findEdge()
	if edgePath != "" {
		cmd := exec.Command(edgePath, "--app="+url, "--no-first-run", "--no-default-browser-check")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		cmd.Start()
	}

	fmt.Println("后台管理系统已启动")
	fmt.Scanln()
}

func findEdge() string {
	paths := []string{
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}
