package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIsPrivateHost(t *testing.T) {
	cases := []struct {
		host string
		want bool
	}{
		{"", true},
		{"127.0.0.1", true},
		{"localhost", true},
		{"::1", true},
		{"10.0.0.5", true},
		{"172.16.0.1", true},
		{"172.31.255.254", true},
		{"192.168.1.1", true},
		{"169.254.169.254", true}, // 云元数据地址（SSRF 经典目标）
		{"0.0.0.0", true},
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"203.0.113.10", false},
		{"127.0.0.1:8080", true},
	}
	for _, c := range cases {
		if got := isPrivateHost(c.host); got != c.want {
			t.Errorf("isPrivateHost(%q) = %v, want %v", c.host, got, c.want)
		}
	}
}

func TestSafeProxyTarget(t *testing.T) {
	cases := []struct {
		raw string
		ok  bool
	}{
		{"https://8.8.8.8/audio.mp4", true},
		{"http://1.1.1.1/1.mp3", true},
		{"https://203.0.113.10/x.mp3", true},
		{"ftp://example.com/x", false},
		{"file:///etc/passwd", false},
		{"", false},
		{"javascript:alert(1)", false},
		{"http://127.0.0.1:21345/api/playlist", false},
		{"http://localhost/x", false},
		{"http://192.168.1.1/x", false},
		{"http://169.254.169.254/latest/meta-data", false},
		{"not a url", false},
	}
	for _, c := range cases {
		_, err := safeProxyTarget(c.raw)
		if (err == nil) != c.ok {
			t.Errorf("safeProxyTarget(%q) ok=%v, want ok=%v (err=%v)", c.raw, err == nil, c.ok, err)
		}
	}
}

func newTestServer() *httptest.Server {
	s := NewServer(ServerConfig{Port: 21345})
	return httptest.NewServer(s.securityMiddleware(s.mux))
}

// TestHostCheck 非本地 Host 应被拒绝
func TestHostCheck(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	// 正常本地访问
	resp, err := http.Get(ts.URL + "/")
	if err != nil {
		t.Fatalf("local request failed: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("local request got %d, want 200", resp.StatusCode)
	}

	// 伪造 Host（恶意网页场景）
	req, _ := http.NewRequest("GET", ts.URL+"/", nil)
	req.Host = "evil.example.com"
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("evil request failed: %v", err)
	}
	resp2.Body.Close()
	if resp2.StatusCode != http.StatusForbidden {
		t.Errorf("evil host got %d, want 403", resp2.StatusCode)
	}
}

// TestCORSLocalOnly 只有本地 Origin 才回显 CORS 头
func TestCORSLocalOnly(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	// 本地 Origin
	req, _ := http.NewRequest("OPTIONS", ts.URL+"/api/search", nil)
	req.Header.Set("Origin", "http://127.0.0.1:21345")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("OPTIONS got %d, want 204", resp.StatusCode)
	}
	if resp.Header.Get("Access-Control-Allow-Origin") == "" {
		t.Error("local origin should get Access-Control-Allow-Origin")
	}

	// 恶意 Origin：不返回 CORS 头，浏览器将无法读取响应
	req2, _ := http.NewRequest("OPTIONS", ts.URL+"/api/search", nil)
	req2.Header.Set("Origin", "https://evil.example.com")
	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	resp2.Body.Close()
	if resp2.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Error("evil origin should NOT get Access-Control-Allow-Origin")
	}
}

// TestAudioProxyBlocksPrivate 音频代理应拦截内网目标
func TestAudioProxyBlocksPrivate(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	cases := []struct {
		url  string
		want int
	}{
		{ts.URL + "/audio-proxy/?url=", http.StatusBadRequest},       // 缺 url
		{ts.URL + "/audio-proxy/?url=ftp://x", http.StatusForbidden}, // 非 http
		{ts.URL + "/audio-proxy/?url=" + ts.URL + "/api/playlist", http.StatusForbidden}, // 本机
		{ts.URL + "/audio-proxy/?url=http://169.254.169.254/latest/meta-data", http.StatusForbidden}, // 云元数据
		{ts.URL + "/audio-proxy/?url=http://192.168.1.1/x", http.StatusForbidden}, // 内网
	}
	for _, c := range cases {
		resp, err := http.Get(c.url)
		if err != nil {
			t.Fatalf("GET %s failed: %v", c.url, err)
		}
		resp.Body.Close()
		if resp.StatusCode != c.want {
			t.Errorf("GET %s got %d, want %d", c.url, resp.StatusCode, c.want)
		}
	}
}

// TestLegacyRoutesRemoved 已移除的旧代理路由应返回 404
func TestLegacyRoutesRemoved(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	for _, path := range []string{"/proxy/http://x", "/bl/xxx", "/bl-audio/upos-sz-x"} {
		resp, err := http.Get(ts.URL + path)
		if err != nil {
			t.Fatalf("GET %s failed: %v", path, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("GET %s got %d, want 404", path, resp.StatusCode)
		}
	}
}

// TestStaticServing 静态文件服务：index.html / bundle.js / bundle.css
func TestStaticServing(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	cases := []struct {
		path string
		ct   string
	}{
		{"/", "text/html"},
		{"/index.html", "text/html"},
		{"/bundle.js", "application/javascript"},
		{"/bundle.css", "text/css"},
		{"/nonexistent.js", ""}, // 不存在 → 404
	}
	for _, c := range cases {
		resp, err := http.Get(ts.URL + c.path)
		if err != nil {
			t.Fatalf("GET %s failed: %v", c.path, err)
		}
		resp.Body.Close()
		if c.ct == "" {
			if resp.StatusCode != http.StatusNotFound {
				t.Errorf("GET %s got %d, want 404", c.path, resp.StatusCode)
			}
			continue
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("GET %s got %d, want 200", c.path, resp.StatusCode)
		}
		if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, c.ct) {
			t.Errorf("GET %s Content-Type = %q, want prefix %q", c.path, ct, c.ct)
		}
	}
}

// TestStaticNoCache 静态资源不应被缓存（开发时避免旧版本残留）
func TestStaticNoCache(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()
	resp, err := http.Get(ts.URL + "/bundle.js")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if cc := resp.Header.Get("Cache-Control"); cc == "" {
		t.Error("expected Cache-Control header")
	}
}

// fakeSource 可注入的假音乐源（handler 层测试）
type fakeSource struct {
	songs    []Song
	url      string
	lyric    *Lyric
	searchErr error
}

func (f *fakeSource) Search(keyword string, page int) ([]Song, error) {
	if f.searchErr != nil {
		return nil, f.searchErr
	}
	return f.songs, nil
}
func (f *fakeSource) GetURL(id string) (string, error) { return f.url, nil }
func (f *fakeSource) GetLyric(id string) (*Lyric, error) {
	if f.lyric != nil {
		return f.lyric, nil
	}
	return &Lyric{}, nil
}

// TestHandlerWithFakeSource 依赖注入：handler 用假源测试完整请求链
func TestHandlerWithFakeSource(t *testing.T) {
	s := NewServer(ServerConfig{Port: 21345})
	s.sources["fake"] = &fakeSource{
		songs: []Song{{ID: "f1", Title: "假歌", Artist: "假歌手", Source: "fake", Duration: 100}},
		url:   "http://fake-audio/x.mp3",
		lyric: &Lyric{LRC: "[00:01.00]假歌词"},
	}
	ts := httptest.NewServer(s.securityMiddleware(s.mux))
	defer ts.Close()

	// 搜索
	resp, err := http.Get(ts.URL + "/api/search?keyword=x&source=fake")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !strings.Contains(string(body), "假歌") {
		t.Errorf("search failed: %d %s", resp.StatusCode, body)
	}

	// 播放链接
	resp2, _ := http.Get(ts.URL + "/api/song/url?id=f1&source=fake")
	body2, _ := io.ReadAll(resp2.Body)
	resp2.Body.Close()
	if !strings.Contains(string(body2), "fake-audio") {
		t.Errorf("song url failed: %s", body2)
	}

	// 歌词
	resp3, _ := http.Get(ts.URL + "/api/song/lyric?id=f1&source=fake")
	body3, _ := io.ReadAll(resp3.Body)
	resp3.Body.Close()
	if !strings.Contains(string(body3), "假歌词") {
		t.Errorf("lyric failed: %s", body3)
	}

	// 未知来源 → 400
	resp4, _ := http.Get(ts.URL + "/api/song/url?id=x&source=nope")
	resp4.Body.Close()
	if resp4.StatusCode != http.StatusBadRequest {
		t.Errorf("unknown source got %d, want 400", resp4.StatusCode)
	}
}

// TestSearchUnknownSource 单一来源搜索：未知 source → 400
func TestSearchUnknownSource(t *testing.T) {
	s := NewServer(ServerConfig{Port: 21345})
	s.sources["fake"] = &fakeSource{}
	ts := httptest.NewServer(s.securityMiddleware(s.mux))
	defer ts.Close()
	resp, err := http.Get(ts.URL + "/api/search?keyword=x&source=nope")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("got %d, want 400", resp.StatusCode)
	}
}
