package main

// api.go — 音乐源接口（酷狗/网易云/B站）与歌单存储
// 所有外部 JSON 请求统一走 httpx.go 的 doJSON/doJSONRaw（超时、UA、错误上下文）。
// 搜索结果的解析拆为纯函数（parseKugouSearch 等），可用 JSON fixture 直接测试。

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// generateUUID 生成标准UUID
func generateUUID() string {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		// 如果随机数生成失败，使用时间戳作为后备方案
		return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
			time.Now().Unix(),
			time.Now().UnixNano()%0xffff,
			time.Now().UnixNano()%0xffff,
			time.Now().UnixNano()%0xffff,
			time.Now().UnixNano()%0xffffffffffff)
	}
	b[6] = (b[6] & 0x0f) | 0x40 // Version 4
	b[8] = (b[8] & 0x3f) | 0x80 // Variant is 10
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hex.EncodeToString(b[:4]),
		hex.EncodeToString(b[4:6]),
		hex.EncodeToString(b[6:8]),
		hex.EncodeToString(b[8:10]),
		hex.EncodeToString(b[10:]))
}

// ═══════════════════════════════════════════════
// 数据结构
// ═══════════════════════════════════════════════

type Song struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Artist    string `json:"artist"`
	Album     string `json:"album"`
	Duration  int    `json:"duration"`
	Cover     string `json:"cover"`
	Source    string `json:"source"`
	PlayCount int    `json:"play_count,omitempty"` // 播放量
}

type Lyric struct {
	LRC  string `json:"lrc"`
	TLRC string `json:"tlrc"`
	QRC  string `json:"qrc"`
}

// ═══════════════════════════════════════════════
// 音乐源接口
// ═══════════════════════════════════════════════

type MusicSource interface {
	Search(keyword string, page int) ([]Song, error)
	GetURL(id string) (string, error)
	GetLyric(id string) (*Lyric, error)
}

// htmlTagRe 清理 B站标题中的 HTML 标签（只编译一次）
var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

// parseDurationColon 解析 "mm:ss" 或 "hh:mm:ss" 格式时长（非法输入返回 0）
func parseDurationColon(s string) int {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) < 2 || len(parts) > 3 {
		return 0
	}
	var nums [3]int
	for i, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil || n < 0 {
			return 0
		}
		nums[i] = n
	}
	if len(parts) == 3 {
		return nums[0]*3600 + nums[1]*60 + nums[2]
	}
	return nums[0]*60 + nums[1]
}

// ═══════════════════════════════════════════════
// 酷狗音乐
// ═══════════════════════════════════════════════

type KugouSource struct{}

func (k *KugouSource) Search(keyword string, page int) ([]Song, error) {
	if page < 1 {
		page = 1
	}
	// 注：该域名现网 HTTPS 证书被劫持（返回无关域名的证书，实测 x509 校验失败），
	// 故搜索保留 HTTP；歌词/播放信息域名（m/lyrics.kugou.com）HTTPS 正常已切换
	apiURL := fmt.Sprintf(
		"http://mobilecdn.kugou.com/api/v3/search/song?keyword=%s&page=%d&pagesize=20",
		url.QueryEscape(keyword), page,
	)
	body, err := doJSONRaw(httpClient, "GET", apiURL, "", nil, nil)
	if err != nil {
		return nil, fmt.Errorf("kugou search: %w", err)
	}
	return parseKugouSearch(body)
}

// parseKugouSearch 解析酷狗搜索响应（纯函数，可 fixture 测试）
func parseKugouSearch(body []byte) ([]Song, error) {
	var result struct {
		Data struct {
			Songs []struct {
				Hash       string `json:"hash"`
				SongName   string `json:"songname"`
				SingerName string `json:"singername"`
				Duration   int    `json:"duration"`
				AlbumName  string `json:"album_name"`
			} `json:"info"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	songs := make([]Song, 0, len(result.Data.Songs))
	for _, s := range result.Data.Songs {
		songs = append(songs, Song{
			ID:       s.Hash,
			Title:    s.SongName,
			Artist:   s.SingerName,
			Album:    s.AlbumName,
			Duration: s.Duration,
			Source:   "kg",
		})
	}
	return songs, nil
}

func (k *KugouSource) GetURL(hash string) (string, error) {
	apiURL := fmt.Sprintf(
		"https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=%s",
		strings.ToUpper(hash),
	)
	var result struct {
		URL string `json:"url"`
	}
	if err := doJSON(httpClient, "GET", apiURL, "https://m.kugou.com", nil, &result); err != nil {
		return "", fmt.Errorf("kugou get url: %w", err)
	}
	if result.URL == "" {
		return "", fmt.Errorf("no url found")
	}
	return result.URL, nil
}

func (k *KugouSource) GetLyric(hash string) (*Lyric, error) {
	// 第一步：搜索歌词候选
	searchURL := fmt.Sprintf(
		"https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&hash=%s",
		strings.ToUpper(hash),
	)
	var searchResult struct {
		Candidates []struct {
			ID        string `json:"id"`
			AccessKey string `json:"accesskey"`
		} `json:"candidates"`
	}
	if err := doJSON(httpClient, "GET", searchURL, "https://m.kugou.com", nil, &searchResult); err != nil {
		return nil, fmt.Errorf("kugou lyric search: %w", err)
	}
	if len(searchResult.Candidates) == 0 {
		return &Lyric{}, nil
	}
	c := searchResult.Candidates[0]

	// 第二步+第三步：并行下载逐行歌词（LRC）与逐字歌词（QRC，3 秒短超时）
	// QRC 失败/超时绝不影响主歌词返回
	type lrcOut struct {
		content string
		err     error
	}
	lrcCh := make(chan lrcOut, 1)
	qrcCh := make(chan string, 1)

	// LRC（正常路径）
	go func() {
		dlURL := fmt.Sprintf(
			"https://lyrics.kugou.com/download?ver=1&client=pc&fmt=lrc&id=%s&accesskey=%s",
			c.ID, c.AccessKey,
		)
		var dlResult struct {
			Content string `json:"content"`
		}
		if err := doJSON(httpClient, "GET", dlURL, "https://m.kugou.com", nil, &dlResult); err != nil {
			lrcCh <- lrcOut{"", err}
			return
		}
		lrcCh <- lrcOut{decodeKugouContent(dlResult.Content), nil}
	}()

	// QRC（可选，独立 3 秒超时）
	go func() {
		qURL := fmt.Sprintf(
			"https://lyrics.kugou.com/download?ver=1&client=pc&fmt=qs&id=%s&accesskey=%s",
			c.ID, c.AccessKey,
		)
		client := &http.Client{Timeout: 3 * time.Second, Transport: httpTransport}
		var qr struct {
			Content string `json:"content"`
		}
		if err := doJSON(client, "GET", qURL, "https://m.kugou.com", nil, &qr); err != nil || qr.Content == "" {
			qrcCh <- ""
			return
		}
		qrcCh <- decodeKugouContent(qr.Content)
	}()

	lr := <-lrcCh
	if lr.err != nil {
		return nil, lr.err
	}
	if lr.content == "" {
		return &Lyric{}, nil
	}
	qrc := <-qrcCh

	return &Lyric{
		LRC: lr.content,
		QRC: qrc,
	}, nil
}

// decodeKugouContent 酷狗歌词 content 不以 [ 开头说明是 base64 编码的
func decodeKugouContent(content string) string {
	if content == "" {
		return ""
	}
	if !strings.HasPrefix(content, "[") {
		if decoded, err := base64.StdEncoding.DecodeString(content); err == nil {
			return string(decoded)
		}
	}
	return content
}

// ═══════════════════════════════════════════════
// 网易云音乐
// ═══════════════════════════════════════════════

type NeteaseSource struct{}

func (n *NeteaseSource) Search(keyword string, page int) ([]Song, error) {
	if page < 1 {
		page = 1
	}
	data := fmt.Sprintf("s=%s&type=1&offset=%d&total=true&limit=20",
		url.QueryEscape(keyword), (page-1)*20)
	body, err := doJSONRaw(httpClient, "POST", "https://music.163.com/api/search/get/web",
		"https://music.163.com",
		map[string]string{"Content-Type": "application/x-www-form-urlencoded"},
		strings.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("netease search: %w", err)
	}
	return parseNeteaseSearch(body)
}

// parseNeteaseSearch 解析网易云搜索响应（纯函数，可 fixture 测试）
func parseNeteaseSearch(body []byte) ([]Song, error) {
	var result struct {
		Result struct {
			Songs []struct {
				ID      int    `json:"id"`
				Name    string `json:"name"`
				Artists []struct {
					Name string `json:"name"`
				} `json:"artists"`
				Album struct {
					Name string `json:"name"`
				} `json:"album"`
				Duration int `json:"duration"`
			} `json:"songs"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	songs := make([]Song, 0, len(result.Result.Songs))
	for _, s := range result.Result.Songs {
		artists := make([]string, 0, len(s.Artists))
		for _, a := range s.Artists {
			artists = append(artists, a.Name)
		}
		songs = append(songs, Song{
			ID:       fmt.Sprintf("%d", s.ID),
			Title:    s.Name,
			Artist:   strings.Join(artists, "/"),
			Album:    s.Album.Name,
			Duration: s.Duration / 1000,
			Source:   "ne",
		})
	}
	return songs, nil
}

func (n *NeteaseSource) GetURL(id string) (string, error) {
	apiURL := fmt.Sprintf(
		"https://music.163.com/api/song/enhance/player/url?id=%s&ids=[%s]&br=320000",
		id, id,
	)
	var result struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := doJSON(httpClient, "GET", apiURL, "https://music.163.com", nil, &result); err != nil {
		return "", fmt.Errorf("netease get url: %w", err)
	}
	if len(result.Data) == 0 || result.Data[0].URL == "" {
		return "", fmt.Errorf("no url found")
	}
	return result.Data[0].URL, nil
}

func (n *NeteaseSource) GetLyric(id string) (*Lyric, error) {
	apiURL := fmt.Sprintf(
		"https://music.163.com/api/song/lyric?id=%s&lv=1&tv=1",
		id,
	)
	var result struct {
		LRC struct {
			Lyric string `json:"lyric"`
		} `json:"lrc"`
		TLRC struct {
			Lyric string `json:"lyric"`
		} `json:"tlyric"`
	}
	if err := doJSON(httpClient, "GET", apiURL, "https://music.163.com", nil, &result); err != nil {
		return nil, fmt.Errorf("netease lyric: %w", err)
	}
	return &Lyric{
		LRC:  result.LRC.Lyric,
		TLRC: result.TLRC.Lyric,
	}, nil
}

// ═══════════════════════════════════════════════
// B站音乐
// ═══════════════════════════════════════════════

type BilibiliSource struct{}

// biliHeaders 构造 B站 API 请求头（含随机 buvid3，调用方在多个请求间复用同一值）
func biliHeaders(buvid3 string) map[string]string {
	return map[string]string{
		"User-Agent":      chromeUA,
		"Referer":         "https://www.bilibili.com",
		"Origin":          "https://www.bilibili.com",
		"Accept":          "application/json, text/plain, */*",
		"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
		"Cookie":          "buvid3=" + buvid3 + "; b_nut=" + strconv.FormatInt(time.Now().Unix(), 10),
	}
}

func (b *BilibiliSource) Search(keyword string, page int) ([]Song, error) {
	if page < 1 {
		page = 1
	}
	params := map[string]string{
		"keyword":     keyword,
		"page":        strconv.Itoa(page),
		"pagesize":    "20",
		"search_type": "video",
	}
	qs := globalSigner.sign(params)
	apiURL := "https://api.bilibili.com/x/web-interface/wbi/search/type?" + qs

	body, err := doJSONRaw(httpClient, "GET", apiURL, "https://www.bilibili.com", biliHeaders(generateUUID()), nil)
	if err != nil {
		return nil, fmt.Errorf("bilibili search: %w", err)
	}
	return parseBilibiliSearch(body)
}

// parseBilibiliSearch 解析 B站搜索响应（纯函数，可 fixture 测试）
func parseBilibiliSearch(body []byte) ([]Song, error) {
	var result struct {
		Data struct {
			Result []struct {
				Bvid     string `json:"bvid"`
				Title    string `json:"title"`
				Author   string `json:"author"`
				Duration string `json:"duration"`
				Pic      string `json:"pic"`
				Play     int    `json:"play"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	songs := make([]Song, 0, len(result.Data.Result))
	for _, s := range result.Data.Result {
		// 解析时长 "mm:ss" 或 "hh:mm:ss"
		duration := parseDurationColon(s.Duration)
		// 清理标题中的 HTML 标签
		title := htmlTagRe.ReplaceAllString(s.Title, "")
		songs = append(songs, Song{
			ID:        s.Bvid,
			Title:     title,
			Artist:    s.Author,
			Duration:  duration,
			Cover:     "https:" + s.Pic,
			Source:    "bl",
			PlayCount: s.Play,
		})
	}
	// 按播放量从高到低排序
	sort.Slice(songs, func(i, j int) bool {
		return songs[i].PlayCount > songs[j].PlayCount
	})
	return songs, nil
}

func (b *BilibiliSource) GetURL(bvid string) (string, error) {
	buvid3 := generateUUID()

	// 第一步：获取视频信息（cid）
	viewURL := "https://api.bilibili.com/x/web-interface/view?bvid=" + url.QueryEscape(bvid)
	var info struct {
		Code int `json:"code"`
		Data struct {
			CID int64 `json:"cid"`
		} `json:"data"`
	}
	if err := doJSON(httpClient, "GET", viewURL, "https://www.bilibili.com", biliHeaders(buvid3), &info); err != nil {
		return "", fmt.Errorf("bilibili get video info: %w", err)
	}
	if info.Code != 0 {
		return "", fmt.Errorf("bilibili get video info error: code=%d", info.Code)
	}

	// 第二步：获取音频流
	params := map[string]string{
		"bvid":   bvid,
		"cid":    fmt.Sprintf("%d", info.Data.CID),
		"fnval":  "16",
		"fourk":  "1",
	}
	qs := globalSigner.sign(params)
	playURL := "https://api.bilibili.com/x/player/playurl?" + qs
	var playResult struct {
		Code int `json:"code"`
		Data struct {
			Dash struct {
				Audio []struct {
					BaseURL   string   `json:"base_url"`
					BackupURL []string `json:"backup_url"`
				} `json:"audio"`
			} `json:"dash"`
		} `json:"data"`
	}
	if err := doJSON(httpClient, "GET", playURL, "https://www.bilibili.com", biliHeaders(buvid3), &playResult); err != nil {
		return "", fmt.Errorf("bilibili get play url: %w", err)
	}
	if playResult.Code != 0 {
		return "", fmt.Errorf("bilibili get play url error: code=%d", playResult.Code)
	}
	if len(playResult.Data.Dash.Audio) == 0 {
		return "", fmt.Errorf("no audio stream found")
	}

	// 收集全部候选 CDN（主地址 + 备用地址 + 其他音质轨）：B站 playurl 按
	// 请求 IP 分配节点，部分地区的节点会直连超时——探测后返回第一个连通的
	var candidates []string
	for _, a := range playResult.Data.Dash.Audio {
		if a.BaseURL != "" {
			candidates = append(candidates, a.BaseURL)
		}
		candidates = append(candidates, a.BackupURL...)
	}
	if len(candidates) == 0 {
		return "", fmt.Errorf("no audio stream found")
	}
	return pickReachableAudio(candidates), nil
}

// pickReachableAudio 依次对候选 CDN 做小范围探测（Range 0-1，2.5s 超时），
// 返回第一个连通的地址；全部不通时返回第一个候选（让代理/前端如实报错）
func pickReachableAudio(candidates []string) string {
	probe := &http.Client{
		Timeout:   2500 * time.Millisecond,
		Transport: httpTransport,
	}
	for _, u := range candidates {
		req, err := http.NewRequest("GET", u, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", chromeUA)
		req.Header.Set("Referer", "https://www.bilibili.com")
		req.Header.Set("Range", "bytes=0-1")
		resp, err := probe.Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == 200 || resp.StatusCode == 206 {
			return u
		}
	}
	return candidates[0]
}

func (b *BilibiliSource) GetLyric(bvid string) (*Lyric, error) {
	// B站没有歌词API，返回空
	return &Lyric{}, nil
}

// ═══════════════════════════════════════════════
// 全局实例
// ═══════════════════════════════════════════════

var (
	kgSource = &KugouSource{}
	neSource = &NeteaseSource{}
	blSource = &BilibiliSource{}
)

// ═══════════════════════════════════════════════
// 搜索聚合
// ═══════════════════════════════════════════════

func searchAll(sources map[string]MusicSource, keyword string, page int) ([]Song, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	var allSongs []Song
	errs := make(map[string]error)

	for name, src := range sources {
		wg.Add(1)
		go func(name string, src MusicSource) {
			defer wg.Done()
			songs, err := src.Search(keyword, page)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				errs[name] = err
				return
			}
			allSongs = append(allSongs, songs...)
		}(name, src)
	}

	wg.Wait()

	// 单个源失败记入日志（文件日志可诊断），全部失败才返回错误
	for name, err := range errs {
		log.Printf("[search] 源 %s 失败: %v", name, err)
	}
	if len(allSongs) == 0 {
		if len(errs) > 0 {
			return nil, fmt.Errorf("all sources failed: %v", errs)
		}
		return []Song{}, nil
	}

	// 按来源分组排序
	sort.Slice(allSongs, func(i, j int) bool {
		if allSongs[i].Source != allSongs[j].Source {
			sourceOrder := map[string]int{"kg": 0, "ne": 1, "bl": 2}
			return sourceOrder[allSongs[i].Source] < sourceOrder[allSongs[j].Source]
		}
		return allSongs[i].Title < allSongs[j].Title
	})

	return allSongs, nil
}

// searchLyric 从酷狗和网易云并发搜索歌词（优先返回有翻译的结果）
func searchLyric(kg, ne MusicSource, keyword string) (*Lyric, error) {
	type result struct {
		lyric *Lyric
		err   error
	}
	ch := make(chan result, 2)
	for _, src := range []MusicSource{kg, ne} {
		go func(src MusicSource) {
			songs, err := src.Search(keyword, 1)
			if err != nil || len(songs) == 0 {
				ch <- result{nil, err}
				return
			}
			lyric, err := src.GetLyric(songs[0].ID)
			ch <- result{lyric, err}
		}(src)
	}

	var bestLyric *Lyric
	for i := 0; i < 2; i++ {
		r := <-ch
		if r.err != nil || r.lyric == nil {
			continue
		}
		if r.lyric.LRC != "" || r.lyric.QRC != "" {
			// 优先返回有翻译歌词的
			if bestLyric == nil || (r.lyric.TLRC != "" && bestLyric.TLRC == "") {
				bestLyric = r.lyric
			}
		}
	}

	if bestLyric != nil {
		return bestLyric, nil
	}
	return &Lyric{}, nil
}

// ═══════════════════════════════════════════════
// 歌单存储（PlaylistStore：路径 + 锁 + 原子写）
// ═══════════════════════════════════════════════

type Playlist struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Songs     []Song `json:"songs"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

type PlaylistDB struct {
	Version   int        `json:"version"`
	Playlists []Playlist `json:"playlists"`
}

// playlistsFile 歌单库统一存放在 %APPDATA%\Melody\（日志同域）。
// 旧位置（主目录点文件）由 Load 在文件缺失时一次性迁移。
func playlistsFile() string {
	return filepath.Join(appDataDir(), "playlists.json")
}

type PlaylistStore struct {
	mu   sync.Mutex
	path string
}

func NewPlaylistStore(path string) *PlaylistStore {
	return &PlaylistStore{path: path}
}

// Load 读取全部歌单。
// 新文件不存在 → 尝试一次性迁移旧单歌单文件；
// 解析失败或版本不兼容 → 备份原文件（绝不覆盖用户数据）后从空开始。
func (st *PlaylistStore) Load() []Playlist {
	st.mu.Lock()
	defer st.mu.Unlock()
	data, err := os.ReadFile(st.path)
	if err != nil {
		return st.migrateFromHome()
	}
	var db PlaylistDB
	if err := json.Unmarshal(data, &db); err != nil || db.Version != 1 {
		backup := fmt.Sprintf("%s.corrupt-%s", st.path, time.Now().Format("20060102-150405"))
		if rerr := os.Rename(st.path, backup); rerr == nil {
			log.Printf("[playlist] 歌单文件损坏或版本不兼容，原文件已备份为 %s", backup)
		} else {
			log.Printf("[playlist] 歌单文件损坏且备份失败: %v", rerr)
		}
		return []Playlist{}
	}
	return db.Playlists
}

// Save 原子写入全部歌单（先写临时文件再重命名）
func (st *PlaylistStore) Save(playlists []Playlist) error {
	st.mu.Lock()
	defer st.mu.Unlock()
	return st.saveLocked(playlists)
}

func (st *PlaylistStore) saveLocked(playlists []Playlist) error {
	db := PlaylistDB{Version: 1, Playlists: playlists}
	data, err := json.MarshalIndent(db, "", "  ")
	if err != nil {
		return err
	}
	tmp := st.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, st.path)
}

// migrateFromHome 一次性迁移旧位置数据（原文件全部保留）：
// ① v4.1 开发期数据目录（%APPDATA%\MelodyV3\）→ ② v4.0 主目录 .melody3_playlists.json → ③ v3 单歌单 .melody3_playlist.json
func (st *PlaylistStore) migrateFromHome() []Playlist {
	// ① MelodyV3 数据目录（v4.1 开发期的位置）
	if data, err := os.ReadFile(filepath.Join(os.Getenv("APPDATA"), "MelodyV3", "playlists.json")); err == nil {
		var db PlaylistDB
		if err := json.Unmarshal(data, &db); err == nil && db.Version == 1 && len(db.Playlists) > 0 {
			if serr := st.saveLocked(db.Playlists); serr == nil {
				log.Printf("[playlist] 已将歌单库从 MelodyV3 数据目录迁移到 %s（原文件保留）", st.path)
				return db.Playlists
			}
		}
	}
	// ② 主目录多歌单格式
	home, _ := os.UserHomeDir()
	if data, err := os.ReadFile(filepath.Join(home, ".melody3_playlists.json")); err == nil {
		var db PlaylistDB
		if err := json.Unmarshal(data, &db); err == nil && db.Version == 1 && len(db.Playlists) > 0 {
			if serr := st.saveLocked(db.Playlists); serr == nil {
				log.Printf("[playlist] 已将歌单库从主目录迁移到 %s（原文件保留）", st.path)
				return db.Playlists
			}
		}
	}
	return migrateLegacyPlaylist(plFile(), st.path)
}

// migrateLegacyPlaylist 把 v3 时代旧单歌单文件迁移为多歌单格式（一次性）
func migrateLegacyPlaylist(oldPath, newPath string) []Playlist {
	if _, err := os.Stat(oldPath); err != nil {
		return []Playlist{}
	}
	songs := loadPlaylistFrom(oldPath)
	if len(songs) == 0 {
		return []Playlist{}
	}
	now := time.Now().Unix()
	pls := []Playlist{{
		ID:        "pl-main",
		Name:      "我的歌单",
		Songs:     songs,
		CreatedAt: now,
		UpdatedAt: now,
	}}
	st := &PlaylistStore{path: newPath}
	if err := st.Save(pls); err != nil {
		log.Printf("[playlist] 迁移写入失败: %v", err)
	}
	return pls
}

// loadPlaylistFrom 读取旧格式单歌单文件（仅迁移路径使用）
func loadPlaylistFrom(path string) []Song {
	data, err := os.ReadFile(path)
	if err != nil {
		return []Song{}
	}
	var playlist []Song
	if err := json.Unmarshal(data, &playlist); err == nil {
		// 检查是否需要迁移（如果第一个元素的Title为空，可能是旧格式）
		if len(playlist) > 0 && playlist[0].Title == "" && playlist[0].Artist == "" {
			return migratePlaylistData(data)
		}
		return playlist
	}
	// 如果直接解析失败，尝试迁移旧格式
	return migratePlaylistData(data)
}

// migratePlaylistData 迁移旧格式的歌单数据（name/singer 字段）
func migratePlaylistData(data []byte) []Song {
	var rawPlaylist []map[string]interface{}
	if err := json.Unmarshal(data, &rawPlaylist); err != nil {
		return []Song{}
	}

	var playlist []Song
	for _, raw := range rawPlaylist {
		song := Song{}
		if id, ok := raw["id"].(string); ok {
			song.ID = id
		}
		if title, ok := raw["title"].(string); ok {
			song.Title = title
		} else if name, ok := raw["name"].(string); ok {
			song.Title = name
		}
		if artist, ok := raw["artist"].(string); ok {
			song.Artist = artist
		} else if singer, ok := raw["singer"].(string); ok {
			song.Artist = singer
		}
		if album, ok := raw["album"].(string); ok {
			song.Album = album
		}
		if duration, ok := raw["duration"].(float64); ok {
			song.Duration = int(duration)
		}
		if cover, ok := raw["cover"].(string); ok {
			song.Cover = cover
		}
		if source, ok := raw["source"].(string); ok {
			song.Source = source
		}
		playlist = append(playlist, song)
	}
	return playlist
}
