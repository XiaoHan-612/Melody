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
