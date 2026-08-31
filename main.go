package main

import (
	"embed"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

//go:embed static
var staticFiles embed.FS

// ═══════════════════════════════════════════════
// 配置常量
// ═══════════════════════════════════════════════

const (
	ua       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
	chromeUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	debug    = false
)

func plFile() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".melody3_playlist.json")
}

// ═══════════════════════════════════════════════
// DPI 感知
// ═══════════════════════════════════════════════

func setDPIAware() {
	user32 := syscall.NewLazyDLL("user32.dll")
	user32.NewProc("SetProcessDPIAware").Call()
}

// ═══════════════════════════════════════════════
// 旧实例清理（只杀本程序的残留进程，避免误杀其他程序）
// ═══════════════════════════════════════════════

func killOldInstances() {
	selfName := strings.ToLower(filepath.Base(os.Args[0]))
	cmd := exec.Command("cmd", "/c",
		fmt.Sprintf("netstat -ano | findstr :%d", defaultConfig.Port))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	if err != nil {
		return
	}

	for _, line := range strings.Split(string(out), "\n") {
		if !strings.Contains(line, "LISTENING") {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) == 0 {
			continue
		}
		pid := parts[len(parts)-1]
		if !isOurProcess(pid, selfName) {
			continue
		}
		killCmd := exec.Command("taskkill", "/f", "/pid", pid)
		killCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		killCmd.Run()
	}
}

// isOurProcess 判断 PID 对应的进程是否与本程序同名
func isOurProcess(pid, selfName string) bool {
	out, err := exec.Command("tasklist", "/fi", fmt.Sprintf("pid eq %s", pid),
		"/fo", "csv", "/nh").Output()
	if err != nil {
		return false
	}
	csv := string(out)
	if len(csv) < 2 || csv[0] != '"' {
		return false
	}
	if end := strings.IndexByte(csv[1:], '"'); end >= 0 {
		return strings.ToLower(csv[1:1+end]) == selfName
	}
	return false
}

// waitPortFree 等待端口释放（最多 3 秒）
func waitPortFree() {
	addr := fmt.Sprintf("127.0.0.1:%d", defaultConfig.Port)
	for i := 0; i < 30; i++ {
		conn, err := net.DialTimeout("tcp", addr, 100*time.Millisecond)
		if err != nil {
			return // 端口已空闲
		}
		conn.Close()
		time.Sleep(100 * time.Millisecond)
	}
}

// ═══════════════════════════════════════════════
// 窗口最小尺寸（WM_GETMINMAXINFO 子类化）
// ═══════════════════════════════════════════════

const (
	minWindowW      = 960
	minWindowH      = 600
	wmGetMinMaxInfo = 0x0024
	gwlWndProc      = ^uintptr(3) // GWL_WNDPROC = -4
)

type winPoint struct{ X, Y int32 }

type minMaxInfo struct {
	ptReserved, ptMaxSize, ptMaxPosition, ptMinTrackSize, ptMaxTrackSize winPoint
}

var (
	oldWndProc uintptr
	user32     = syscall.NewLazyDLL("user32.dll")
	callWindow = user32.NewProc("CallWindowProcW")
)

func wndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	if msg == wmGetMinMaxInfo {
		mmi := (*minMaxInfo)(unsafe.Pointer(lParam))
		mmi.ptMinTrackSize = winPoint{X: minWindowW, Y: minWindowH}
		return 0
	}
	ret, _, _ := callWindow.Call(oldWndProc, hwnd, msg, wParam, lParam)
	return ret
}

func setMinWindowSize(hwnd uintptr) {
	setWndProc := user32.NewProc("SetWindowLongPtrW")
	cb := syscall.NewCallback(wndProc)
	if ret, _, _ := setWndProc.Call(hwnd, gwlWndProc, cb); ret != 0 {
		oldWndProc = ret
	}
}

// ═══════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════

func main() {
	setDPIAware()
	killOldInstances()
	waitPortFree()

	// 启动 HTTP 服务器
	server := NewServer(defaultConfig)
	go func() {
		if err := server.Start(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("Server error: %v\n", err)
		}
	}()

	// 等待服务器就绪
	addr := fmt.Sprintf("http://127.0.0.1:%d", defaultConfig.Port)
	for i := 0; i < 50; i++ {
		resp, err := http.Get(addr + "/")
		if err == nil {
			resp.Body.Close()
			break
		}
		time.Sleep(200 * time.Millisecond)
	}

	// 打开 webview 窗口
	w := webview2.New(debug)
	defer w.Destroy()

	w.SetTitle("MelodyV3")
	w.Navigate(addr + "?v=" + fmt.Sprintf("%d_%d", time.Now().UnixNano(), time.Now().Unix()%1000))

	hwnd := w.Window()
	if hwnd != nil {
		setMinWindowSize(uintptr(hwnd))
		user32.NewProc("ShowWindow").Call(uintptr(hwnd), 3) // SW_MAXIMIZE
	}

	w.Run()
}
