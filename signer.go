package main

// signer.go — B站 WBI 签名

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var wbiIdx = []int{
	46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
	27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
	37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
	22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
}

// filterValue 过滤特殊字符
func filterValue(v string) string {
	return strings.NewReplacer("!", "", "'", "", "(", "", ")", "", "*", "").Replace(v)
}

const (
	wbiCacheTTL   = time.Hour      // 成功后缓存 1 小时
	wbiRetryDelay = 5 * time.Minute // 失败后退避 5 分钟，避免风控期自我放大
)

type bilibiliSigner struct {
	key       string
	fetchTime time.Time // 成功与失败都记录（失败用于退避）
	fetching  bool
	mu        sync.Mutex
}

var globalSigner = &bilibiliSigner{}

// fetchKey 取 WBI 密钥：网络请求在锁外进行，成功缓存 1 小时，失败退避 5 分钟
func (s *bilibiliSigner) fetchKey() {
	s.mu.Lock()
	now := time.Now()
	if s.key != "" && now.Sub(s.fetchTime) < wbiCacheTTL {
		s.mu.Unlock()
		return
	}
	if s.key == "" && !s.fetchTime.IsZero() && now.Sub(s.fetchTime) < wbiRetryDelay {
		s.mu.Unlock() // 失败退避期内不重试
		return
	}
	if s.fetching { // 已有 goroutine 在取，直接用现有 key（可能为空）
		s.mu.Unlock()
		return
	}
	s.fetching = true
	s.mu.Unlock()

	key, err := fetchWBIKey()

	s.mu.Lock()
	defer s.mu.Unlock()
	s.fetching = false
	s.fetchTime = time.Now() // 无论成败都记录，失败进入退避期
	if err != nil {
		log.Printf("[WBI] 获取密钥失败: %v", err)
		s.key = ""
		return
	}
	s.key = key
}

// fetchWBIKey 请求 B站 nav 接口并派生 WBI 密钥
func fetchWBIKey() (string, error) {
	req, err := http.NewRequest("GET", "https://api.bilibili.com/x/web-interface/wbi/index/nav", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", chromeUA)
	req.Header.Set("Referer", "https://www.bilibili.com")
	req.Header.Set("Origin", "https://www.bilibili.com")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read body: %w", err)
	}
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("status %d: %.200s", resp.StatusCode, body)
	}

	var data struct {
		Code int `json:"code"`
		Data struct {
			WbiImg struct {
				ImgURL string `json:"img_url"`
				SubURL string `json:"sub_url"`
			} `json:"wbi_img"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return "", fmt.Errorf("parse: %w (body: %.200s)", err, body)
	}
	// 风控时 B站返回 code=-412 等业务错误码，此时 img_url 为空，
	// 不检查就会在下面的切片索引处 panic（曾可导致整个应用闪退）
	if data.Code != 0 {
		return "", fmt.Errorf("api code %d (body: %.200s)", data.Code, body)
	}
	return deriveWBIKey(data.Data.WbiImg.ImgURL, data.Data.WbiImg.SubURL)
}

// deriveWBIKey 从 img_url/sub_url 派生 WBI 签名密钥（纯函数，可测）
func deriveWBIKey(imgURL, subURL string) (string, error) {
	raw := wbiFileStem(imgURL) + wbiFileStem(subURL)
	if len(raw) < len(wbiIdx) {
		return "", fmt.Errorf("wbi key too short: %q", raw)
	}
	b := make([]byte, len(wbiIdx))
	for i, idx := range wbiIdx {
		b[i] = raw[idx]
	}
	return string(b), nil
}

// wbiFileStem 取 URL 路径最后一段的文件名主干（去掉扩展名）
func wbiFileStem(u string) string {
	u = strings.TrimSpace(u)
	if i := strings.LastIndexByte(u, '/'); i >= 0 {
		u = u[i+1:]
	}
	if i := strings.IndexByte(u, '.'); i >= 0 {
		u = u[:i]
	}
	return u
}

func (s *bilibiliSigner) sign(params map[string]string) string {
	s.fetchKey()
	s.mu.Lock()
	key := s.key
	s.mu.Unlock()
	return signParams(key, params)
}

// signParams 对参数做 WBI 签名（纯函数，便于测试；key 为空时不加 w_rid）
func signParams(key string, params map[string]string) string {
	// 拷贝一份 params，避免并发写入原 map
	safeParams := make(map[string]string, len(params)+1)
	for k, v := range params {
		safeParams[k] = v
	}

	// 添加时间戳
	safeParams["wts"] = strconv.FormatInt(time.Now().Unix(), 10)

	// 过滤特殊字符
	for k, v := range safeParams {
		safeParams[k] = filterValue(v)
	}

	// 排序参数
	keys := make([]string, 0, len(safeParams))
	for k := range safeParams {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// 构建URL编码的查询字符串
	var parts []string
	for _, k := range keys {
		parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(safeParams[k]))
	}
	query := strings.Join(parts, "&")

	// 如果没有key，直接返回查询字符串
	if key == "" {
		return query
	}

	// 计算签名（MD5）
	h := md5.Sum([]byte(query + key))
	return query + "&w_rid=" + fmt.Sprintf("%x", h)
}
