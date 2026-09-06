package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ═══════════════════════════════════════════════
// 服务器配置
// ═══════════════════════════════════════════════

type ServerConfig struct {
	Port         int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

var defaultConfig = ServerConfig{
	Port:        21345,
	ReadTimeout: 30 * time.Second,
	// WriteTimeout 必须为 0：音频代理是长时间流式响应，
	// 如果设固定超时，超过时长的歌曲会被强制断流
	WriteTimeout: 0,
}

// 共享 HTTP 客户端
// httpClient 用于普通 API 请求（20s 总超时，防止某个源卡死拖垮搜索）
// streamClient 用于音频流式转发（只限制响应头等待时间，不限制流时长）
var (
	httpTransport = &http.Transport{
		ResponseHeaderTimeout: 20 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		MaxIdleConnsPerHost:   8,
	}
	httpClient   = &http.Client{Timeout: 20 * time.Second, Transport: httpTransport}
	streamClient = &http.Client{Transport: httpTransport}
)

// ═══════════════════════════════════════════════
// HTTP 服务器
// ═══════════════════════════════════════════════

type Server struct {
	config  ServerConfig
	mux     *http.ServeMux
	server  *http.Server
	sources map[string]MusicSource // 依赖注入：便于测试时替换为 fake source
	store   *PlaylistStore
}

func NewServer(config ServerConfig) *Server {
	s := &Server{
		config:  config,
		mux:     http.NewServeMux(),
		sources: map[string]MusicSource{"kg": kgSource, "ne": neSource, "bl": blSource},
		store:   NewPlaylistStore(playlistsFile()),
	}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	// 静态文件
	s.mux.HandleFunc("/", s.handleIndex)

	// API 路由
	s.mux.HandleFunc("/api/search", s.handleSearch)
	s.mux.HandleFunc("/api/song/url", s.handleSongURL)
	s.mux.HandleFunc("/api/song/lyric", s.handleSongLyric)
	s.mux.HandleFunc("/api/song/lyric/search", s.handleLyricSearch)
	s.mux.HandleFunc("/api/playlists", s.handlePlaylists)

	// 音频代理路由
	s.mux.HandleFunc("/audio-proxy/", s.handleAudioProxy)

	// 前端错误上报（WebView 无控制台，报错打到服务端日志）
	s.mux.HandleFunc("/api/log", s.handleLog)

	// 打开日志目录（设置页入口）
	s.mux.HandleFunc("/api/open-logs", s.handleOpenLogs)

	// 版本号（CI 构建注入，前端"关于"与检查更新使用）
	s.mux.HandleFunc("/api/version", s.handleVersion)
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	s.jsonResponse(w, http.StatusOK, map[string]interface{}{"version": version})
}

// handleOpenLogs 在资源管理器中打开日志目录
func (s *Server) handleOpenLogs(w http.ResponseWriter, r *http.Request) {
	openLogsDir()
	s.jsonResponse(w, http.StatusOK, map[string]interface{}{"success": true})
}

// handleLog 接收前端 JS 错误并打印到服务端日志
func (s *Server) handleLog(w http.ResponseWriter, r *http.Request) {
	if msg := r.URL.Query().Get("m"); msg != "" {
		log.Printf("[WEB] %s", msg)
	}
	s.jsonResponse(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) Start() error {
	s.server = &http.Server{
		Addr:         fmt.Sprintf("127.0.0.1:%d", s.config.Port),
		Handler:      s.securityMiddleware(s.loggingMiddleware(s.mux)),
		ReadTimeout:  s.config.ReadTimeout,
		WriteTimeout: s.config.WriteTimeout,
	}

	log.Printf("Melody → http://localhost:%d", s.config.Port)
	return s.server.ListenAndServe()
}

func (s *Server) Stop(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

// ═══════════════════════════════════════════════
// 中间件
// ═══════════════════════════════════════════════

// securityMiddleware 只允许本地页面访问，防止浏览器里的恶意网页
// 把本地服务当代理用（SSRF）
func (s *Server) securityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Host 校验：只接受 127.0.0.1 / localhost
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if host != "127.0.0.1" && host != "localhost" && host != "::1" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		// CORS：仅对本地来源回显，不再使用通配符 *
		if origin := r.Header.Get("Origin"); origin != "" {
			if u, err := url.Parse(origin); err == nil &&
				(u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost") {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("[%s] %s %s %v", r.Method, r.URL.Path, r.RemoteAddr, time.Since(start))
	})
}

// ═══════════════════════════════════════════════
// 请求处理
// ═══════════════════════════════════════════════

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	// 静态文件服务（index.html / bundle.js / bundle.css）
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}

	data, err := staticFiles.ReadFile("static/" + path)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	contentType := "application/octet-stream"
	switch {
	case strings.HasSuffix(path, ".html"):
		contentType = "text/html; charset=utf-8"
	case strings.HasSuffix(path, ".css"):
		contentType = "text/css; charset=utf-8"
	case strings.HasSuffix(path, ".js"):
		contentType = "application/javascript; charset=utf-8"
	case strings.HasSuffix(path, ".svg"):
		contentType = "image/svg+xml"
	case strings.HasSuffix(path, ".png"):
		contentType = "image/png"
	case strings.HasSuffix(path, ".ico"):
		contentType = "image/x-icon"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Write(data)
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	keyword := r.URL.Query().Get("keyword")
	source := r.URL.Query().Get("source")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}

	if keyword == "" {
		s.jsonResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "keyword is required",
		})
		return
	}

	if source == "" || source == "all" {
		// 并发搜索所有源
		results, err := searchAll(s.sources, keyword, page)
		if err != nil {
			s.jsonResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": err.Error()})
			return
		}
		s.jsonResponse(w, http.StatusOK, results)
		return
	}

	src, ok := s.sources[source]
	if !ok {
		s.jsonResponse(w, http.StatusBadRequest, map[string]interface{}{"error": "unknown source: " + source})
		return
	}
	results, err := src.Search(keyword, page)
	if err != nil {
		s.jsonResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": err.Error()})
		return
	}
	s.jsonResponse(w, http.StatusOK, results)
}

func (s *Server) handleSongURL(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	source := r.URL.Query().Get("source")

	if id == "" || source == "" {
		s.jsonResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "id and source are required",
		})
		return
	}

	src, ok := s.sources[source]
	if !ok {
		s.jsonResponse(w, http.StatusBadRequest, map[string]interface{}{"error": "unknown source: " + source})
		return
	}
	url, err := src.GetURL(id)
	if err != nil {
		s.jsonResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	s.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"url": url,
	})
}

func (s *Server) handleSongLyric(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	source := r.URL.Query().Get("source")

	if id == "" || source == "" {
		s.jsonResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "id and source are required",
		})
		return
	}

	src, ok := s.sources[source]
	if !ok {
		s.jsonResponse(w, http.StatusBadRequest, map[string]interface{}{"error": "unknown source: " + source})
		return
	}
	lyric, err := src.GetLyric(id)
	if err != nil {
		s.jsonResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	s.jsonResponse(w, http.StatusOK, lyric)
}

func (s *Server) handleLyricSearch(w http.ResponseWriter, r *http.Request) {
	title := r.URL.Query().Get("title")
	artist := r.URL.Query().Get("artist")

	if title == "" {
		s.jsonResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "title is required",
		})
		return
	}

	keyword := title
	if artist != "" {
		keyword = title + " " + artist
	}

	lyric, err := searchLyric(s.sources["kg"], s.sources["ne"], keyword)
	if err != nil {
		s.jsonResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	s.jsonResponse(w, http.StatusOK, lyric)
}

// handlePlaylists 多歌单：GET 全量 / POST 全量保存
func (s *Server) handlePlaylists(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		s.jsonResponse(w, http.StatusOK, map[string]interface{}{
			"playlists": s.store.Load(),
		})

	case "POST":
		r.Body = http.MaxBytesReader(w, r.Body, 4<<20) // 4MB limit
		body, err := io.ReadAll(r.Body)
		if err != nil {
			s.jsonResponse(w, http.StatusBadRequest, map[string]interface{}{
				"error": "invalid request body",
			})
			return
		}

		var req struct {
			Playlists []Playlist `json:"playlists"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			s.jsonResponse(w, http.StatusBadRequest, map[string]interface{}{
				"error": "invalid JSON",
			})
			return
		}

		if err := s.store.Save(req.Playlists); err != nil {
			s.jsonResponse(w, http.StatusInternalServerError, map[string]interface{}{
				"error": "failed to save playlists: " + err.Error(),
			})
			return
		}

		s.jsonResponse(w, http.StatusOK, map[string]interface{}{
			"success": true,
		})

	default:
		s.jsonResponse(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"error": "method not allowed",
		})
	}
}

// handleAudioProxy 音频流式代理（支持 Range 请求，用于拖动进度）
func (s *Server) handleAudioProxy(w http.ResponseWriter, r *http.Request) {
	targetURL := r.URL.Query().Get("url")
	if targetURL == "" {
		http.Error(w, "Missing url parameter", http.StatusBadRequest)
		return
	}
	targetURL, err := safeProxyTarget(targetURL)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	req.Header.Set("User-Agent", ua)
	req.Header.Set("Referer", "https://www.bilibili.com")

	// 转发 Range 请求头，支持音频 seek
	if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	resp, err := streamClient.Do(req)
	if err != nil {
		http.Error(w, "Gateway Error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	streamResponse(w, resp)
}

// streamResponse 流式转发上游响应
func streamResponse(w http.ResponseWriter, resp *http.Response) {
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}
	if cr := resp.Header.Get("Content-Range"); cr != "" {
		w.Header().Set("Content-Range", cr)
	}
	w.Header().Set("Accept-Ranges", "bytes")
	w.WriteHeader(resp.StatusCode)

	// 逐块读取并主动 flush，保证音频实时到达 WebView
	flusher, _ := w.(http.Flusher)
	buf := make([]byte, 32*1024)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := w.Write(buf[:n]); werr != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
		}
		if err != nil {
			return
		}
	}
}

// safeProxyTarget 校验代理目标：仅允许 http/https 且非内网地址（防 SSRF）
func safeProxyTarget(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", fmt.Errorf("invalid proxy url")
	}
	if isPrivateHost(u.Host) {
		return "", fmt.Errorf("blocked host")
	}
	return raw, nil
}

// isPrivateHost 判断主机是否指向本机/内网地址
func isPrivateHost(host string) bool {
	if host == "" {
		return true
	}
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return true // 解析失败不放行
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
			ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return true
		}
	}
	return false
}

// ═══════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════

func (s *Server) jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func httpGet(targetURL, referer string) ([]byte, string, int) {
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return []byte("{}"), "application/json", 400
	}

	req.Header.Set("User-Agent", ua)
	if referer != "" {
		req.Header.Set("Referer", referer)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return []byte("{}"), "application/json", 502
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return []byte("{}"), "application/json", 500
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}

	return body, contentType, resp.StatusCode
}
