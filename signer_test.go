package main

import (
	"crypto/md5"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"testing"
)

func TestFilterValue(t *testing.T) {
	cases := map[string]string{
		"hello":        "hello",
		"a!b'c(d)e*f":  "abcdef",
		"!!()*":        "",
	}
	for in, want := range cases {
		if got := filterValue(in); got != want {
			t.Errorf("filterValue(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestSignWithoutKey 无 key 时只返回排序后的参数，不带 w_rid
func TestSignWithoutKey(t *testing.T) {
	qs := signParams("", map[string]string{
		"bvid": "BV1xx411c7mD",
		"cid":  "123456",
	})
	if strings.Contains(qs, "w_rid") {
		t.Errorf("sign without key should not contain w_rid: %s", qs)
	}
	for _, k := range []string{"bvid", "cid", "wts"} {
		if !strings.Contains(qs, k+"=") {
			t.Errorf("sign result missing param %s: %s", k, qs)
		}
	}
	// 参数应按 key 排序（bvid < cid < wts）
	if !strings.HasPrefix(qs, "bvid=") {
		t.Errorf("params should be sorted, got prefix %q", qs[:min(12, len(qs))])
	}
}

// TestSignWithKey 有 key 时 w_rid = md5(排序后的查询串 + key)
func TestSignWithKey(t *testing.T) {
	key := "abcdefghijklmnopqrstuvwxyz012345"
	params := map[string]string{"bvid": "BV1xx", "cid": "999", "fnval": "16"}
	qs := signParams(key, params)

	if !strings.Contains(qs, "w_rid=") {
		t.Fatalf("sign with key should contain w_rid: %s", qs)
	}

	// 独立重算期望值：过滤 -> 排序 -> QueryEscape -> md5(query+key)
	expected := make(map[string]string)
	for k, v := range params {
		expected[k] = filterValue(v)
	}
	// 从结果中提取 wts，避免时间竞态
	foundWts := false
	for _, part := range strings.Split(qs, "&") {
		if strings.HasPrefix(part, "wts=") {
			expected["wts"] = strings.TrimPrefix(part, "wts=")
			foundWts = true
		}
	}
	if !foundWts {
		t.Fatalf("wts not found in sign result: %s", qs)
	}
	keys := make([]string, 0, len(expected))
	for k := range expected {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(expected[k]))
	}
	query := strings.Join(parts, "&")
	expectWrid := fmt.Sprintf("%x", md5.Sum([]byte(query+key)))

	if !strings.HasSuffix(qs, "&w_rid="+expectWrid) {
		t.Errorf("w_rid mismatch.\n got: %s\nwant suffix: &w_rid=%s", qs, expectWrid)
	}
}

// TestSignFiltersParams 特殊字符应被过滤后再签名
func TestSignFiltersParams(t *testing.T) {
	key := "test-key-1234567890"
	qs := signParams(key, map[string]string{"keyword": "周杰伦!(经典)"})
	if strings.Contains(qs, "!") || strings.Contains(qs, "(") || strings.Contains(qs, ")") {
		t.Errorf("special chars should be filtered: %s", qs)
	}
}

// TestDeriveWBIKey 真实形态的 img/sub URL 应派生出 32 字节密钥
func TestDeriveWBIKey(t *testing.T) {
	img := "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png"
	sub := "https://i0.hdslb.com/bfs/wbi/493e9c8cf81449f6965f7e0b0a44a3f4.png"
	key, err := deriveWBIKey(img, sub)
	if err != nil {
		t.Fatalf("derive failed: %v", err)
	}
	if len(key) != len(wbiIdx) {
		t.Errorf("key len = %d, want %d", len(key), len(wbiIdx))
	}
}

// TestDeriveWBIKeyPanicPath 风控空 URL 必须返回错误而不是越界 panic（曾致闪退）
func TestDeriveWBIKeyPanicPath(t *testing.T) {
	cases := [][2]string{
		{"", ""},
		{"https://x.com/", "https://x.com/"},
		{"short.png", "sub.png"},
	}
	for _, c := range cases {
		_, err := deriveWBIKey(c[0], c[1])
		if err == nil {
			t.Errorf("deriveWBIKey(%q,%q) should error", c[0], c[1])
		}
	}
}

// TestWbiFileStem 文件名主干提取
func TestWbiFileStem(t *testing.T) {
	cases := map[string]string{
		"https://i0.hdslb.com/bfs/wbi/abc123.png": "abc123",
		"abc.png":      "abc",
		"":             "",
		"a/b/c.gif":    "c",
		"  pad.png   ": "pad",
	}
	for in, want := range cases {
		if got := wbiFileStem(in); got != want {
			t.Errorf("wbiFileStem(%q)=%q want %q", in, got, want)
		}
	}
}
