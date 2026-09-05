package main

// httpx.go — 对外 JSON 请求的统一收敛层。
// 此前同一文件里并存两套 HTTP 访问风格（httpGet 三元组 + 6 处手写
// Do/Close/ReadAll 三连），错误被折叠成合成状态码、原始错误被丢弃，
// 且多处 io.ReadAll 错误被忽略。所有外部 JSON 请求统一走 doJSON/doJSONRaw。

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// doJSONRaw 发起请求并返回响应体（限 4MB）。
// 错误始终带请求上下文与截断的响应体（200 字节），可诊断。
func doJSONRaw(client *http.Client, method, reqURL, referer string, header map[string]string, body io.Reader) ([]byte, error) {
	req, err := http.NewRequest(method, reqURL, body)
	if err != nil {
		return nil, fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("User-Agent", ua)
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	for k, v := range header {
		req.Header.Set(k, v)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("status %d: %.200s", resp.StatusCode, data)
	}
	return data, nil
}

// doJSON 发起 JSON API 请求并解析响应到 out
func doJSON(client *http.Client, method, reqURL, referer string, header map[string]string, out interface{}) error {
	body, err := doJSONRaw(client, method, reqURL, referer, header, nil)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("parse: %w (body: %.200s)", err, body)
	}
	return nil
}
