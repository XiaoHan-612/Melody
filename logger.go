package main

// logger.go — 应用日志：写入 %APPDATA%\Melody\logs\，按天轮转，保留 7 份。
// 发布版用 -H windowsgui 编译，没有 stdout，文件日志是唯一的诊断来源。

import (
	"log"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// appDataDir 返回（并确保存在）应用数据目录 %APPDATA%\Melody
func appDataDir() string {
	dir := filepath.Join(os.Getenv("APPDATA"), "Melody")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func logsDir() string {
	dir := filepath.Join(appDataDir(), "logs")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

var (
	logDayMu   sync.Mutex
	logDayFile *os.File
	logDay     string
)

// setupLogging 把标准库 log 与 slog 全部重定向到按天轮转的日志文件。
// net/http 的请求级 panic 恢复日志默认走 log 包，因此也会被捕获落盘。
func setupLogging() {
	w := &dayWriter{}
	log.SetOutput(w)
	log.SetFlags(log.Ltime)
	slog.SetDefault(slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{Level: slog.LevelInfo})))
}

// openLogsDir 在资源管理器中打开日志目录（设置页入口）
func openLogsDir() {
	_ = execExplorer(logsDir())
}

// dayWriter 按天切换日志文件的 io.Writer
type dayWriter struct {
	mu   sync.Mutex
	file *os.File
	day  string
}

func (w *dayWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	day := time.Now().Format("2006-01-02")
	if w.file == nil || w.day != day {
		if w.file != nil {
			_ = w.file.Close()
		}
		f, err := os.OpenFile(filepath.Join(logsDir(), "melody-"+day+".log"),
			os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
		if err != nil {
			return 0, err
		}
		w.file = f
		w.day = day
		w.cleanup()
	}
	return w.file.Write(p)
}

// cleanup 只保留最近 7 份日志
func (w *dayWriter) cleanup() {
	entries, err := os.ReadDir(logsDir())
	if err != nil {
		return
	}
	var logs []string
	for _, e := range entries {
		name := e.Name()
		if !e.IsDir() && strings.HasPrefix(name, "melody-") && strings.HasSuffix(name, ".log") {
			logs = append(logs, name)
		}
	}
	sort.Strings(logs)
	for len(logs) > 7 {
		_ = os.Remove(filepath.Join(logsDir(), logs[0]))
		logs = logs[1:]
	}
}
