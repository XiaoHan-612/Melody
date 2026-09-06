package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestMigratePlaylistData 旧格式（name/singer 字段）应正确迁移
func TestMigratePlaylistData(t *testing.T) {
	old := `[{"id":"abc","name":"旧歌名","singer":"旧歌手","album":"旧专辑","duration":210,"cover":"http://x/c.jpg","source":"kg"}]`
	songs := migratePlaylistData([]byte(old))
	if len(songs) != 1 {
		t.Fatalf("expected 1 song, got %d", len(songs))
	}
	s := songs[0]
	if s.ID != "abc" || s.Title != "旧歌名" || s.Artist != "旧歌手" ||
		s.Album != "旧专辑" || s.Duration != 210 || s.Source != "kg" {
		t.Errorf("migration result mismatch: %+v", s)
	}
}

// TestMigratePlaylistDataInvalid 非法数据应返回空歌单而非崩溃
func TestMigratePlaylistDataInvalid(t *testing.T) {
	if got := migratePlaylistData([]byte("not json")); len(got) != 0 {
		t.Errorf("expected empty, got %+v", got)
	}
	if got := migratePlaylistData(nil); len(got) != 0 {
		t.Errorf("expected empty for nil, got %+v", got)
	}
}

// TestLoadPlaylistFromRoundtrip 旧格式单歌单文件读写（迁移路径使用）
func TestLoadPlaylistFromRoundtrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "playlist.json")
	data := `[{"id":"1","title":"歌一","artist":"歌手A","source":"kg","duration":180},{"id":"2","title":"歌二","artist":"歌手B","source":"ne","duration":220}]`
	if err := os.WriteFile(path, []byte(data), 0644); err != nil {
		t.Fatal(err)
	}
	got := loadPlaylistFrom(path)
	if len(got) != 2 {
		t.Fatalf("expected 2 songs, got %d", len(got))
	}
	if got[1].ID != "2" || got[1].Artist != "歌手B" || got[1].Source != "ne" {
		t.Errorf("roundtrip mismatch: %+v", got[1])
	}
}

// TestLoadPlaylistFromMissing 文件不存在时应返回空歌单
func TestLoadPlaylistFromMissing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing.json")
	if got := loadPlaylistFrom(path); len(got) != 0 {
		t.Errorf("expected empty, got %+v", got)
	}
}

// TestPlaylistStoreRoundtrip 多歌单保存后应能完整读回（原子写 + 版本标记）
func TestPlaylistStoreRoundtrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "playlists.json")
	st := NewPlaylistStore(path)
	pls := []Playlist{
		{ID: "p1", Name: "歌单一", Songs: []Song{{ID: "1", Title: "歌A", Source: "kg"}}},
		{ID: "p2", Name: "歌单二", Songs: []Song{}},
	}
	if err := st.Save(pls); err != nil {
		t.Fatalf("save failed: %v", err)
	}
	got := st.Load()
	if len(got) != 2 || got[0].Name != "歌单一" || got[0].Songs[0].Title != "歌A" {
		t.Errorf("roundtrip mismatch: %+v", got)
	}
}

// TestPlaylistStoreCorruptFile 文件损坏 → 备份原文件并从空开始（绝不静默覆盖）
func TestPlaylistStoreCorruptFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "playlists.json")
	if err := os.WriteFile(path, []byte("{broken json"), 0644); err != nil {
		t.Fatal(err)
	}
	st := NewPlaylistStore(path)
	got := st.Load()
	if len(got) != 0 {
		t.Errorf("expected empty on corrupt file, got %+v", got)
	}
	// 原文件应被改名为 .corrupt-* 备份，而不是被覆盖
	entries, _ := os.ReadDir(dir)
	foundBackup := false
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "playlists.json.corrupt-") {
			foundBackup = true
		}
	}
	if !foundBackup {
		t.Error("corrupt file should be backed up, not deleted")
	}
}

// TestPlaylistStoreVersionMismatch 未来版本文件 → 备份并不覆盖
func TestPlaylistStoreVersionMismatch(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "playlists.json")
	future := `{"version":2,"playlists":[{"id":"x","name":"未来歌单","songs":[]}]}`
	if err := os.WriteFile(path, []byte(future), 0644); err != nil {
		t.Fatal(err)
	}
	st := NewPlaylistStore(path)
	if got := st.Load(); len(got) != 0 {
		t.Errorf("expected empty for future version, got %+v", got)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("future-version file should be renamed away")
	}
}

// TestMigrateLegacyPlaylist 旧单歌单文件应迁移为"我的歌单"（一次性，旧文件保留）
func TestMigrateLegacyPlaylist(t *testing.T) {
	dir := t.TempDir()
	old := filepath.Join(dir, "old.json")
	if err := os.WriteFile(old, []byte(`[{"id":"x","title":"老歌","artist":"某歌手","source":"ne"}]`), 0644); err != nil {
		t.Fatal(err)
	}
	pls := migrateLegacyPlaylist(old, filepath.Join(dir, "new.json"))
	if len(pls) != 1 || pls[0].Name != "我的歌单" || len(pls[0].Songs) != 1 {
		t.Errorf("migration mismatch: %+v", pls)
	}
	// 旧文件应保留
	if _, err := os.Stat(old); err != nil {
		t.Error("old file should be kept after migration")
	}
	// 新文件应已写入，第二次 Load 直接读新文件
	if _, err := os.Stat(filepath.Join(dir, "new.json")); err != nil {
		t.Error("new file should be written")
	}
	st := NewPlaylistStore(filepath.Join(dir, "new.json"))
	if got := st.Load(); len(got) != 1 || len(got[0].Songs) != 1 {
		t.Errorf("second load should read from new file: %+v", got)
	}
}

// TestMigrateLegacyPlaylistMissing 无旧文件时返回空歌单
func TestMigrateLegacyPlaylistMissing(t *testing.T) {
	dir := t.TempDir()
	pls := migrateLegacyPlaylist(filepath.Join(dir, "missing.json"), filepath.Join(dir, "new.json"))
	if len(pls) != 0 {
		t.Errorf("expected empty, got %+v", pls)
	}
}

// TestParseDurationColon B站时长解析（"hh:mm:ss" 此前解析为 0）
func TestParseDurationColon(t *testing.T) {
	cases := map[string]int{
		"04:29":    269,
		"1:02:03":  3723, // 超 1 小时
		"12:34:56": 45296,
		"00:00":    0,
		"abc":      0,
		"1:2:3:4":  0,
		"":         0,
		"-1:20":    0,
		" 05:00  ": 300,
	}
	for in, want := range cases {
		if got := parseDurationColon(in); got != want {
			t.Errorf("parseDurationColon(%q)=%d want %d", in, got, want)
		}
	}
}

// ═══════════════════════════════════════════════
// 搜索解析纯函数（JSON fixture，覆盖此前零测试的三源解析）
// ═══════════════════════════════════════════════

func TestParseKugouSearch(t *testing.T) {
	body := []byte(`{"data":{"info":[
		{"hash":"h1","songname":"晴天","singername":"周杰伦","duration":269,"album_name":"叶惠美"},
		{"hash":"h2","songname":"七里香","singername":"周杰伦","duration":300}
	]}}`)
	songs, err := parseKugouSearch(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(songs) != 2 || songs[0].ID != "h1" || songs[0].Title != "晴天" ||
		songs[0].Artist != "周杰伦" || songs[0].Duration != 269 ||
		songs[0].Album != "叶惠美" || songs[0].Source != "kg" {
		t.Errorf("parse mismatch: %+v", songs)
	}
	if _, err := parseKugouSearch([]byte("not json")); err == nil {
		t.Error("invalid json should error")
	}
}

func TestParseNeteaseSearch(t *testing.T) {
	body := []byte(`{"result":{"songs":[
		{"id":186016,"name":"晴天","artists":[{"name":"周杰伦"},{"name":"杨瑞代"}],"album":{"name":"叶惠美"},"duration":269000}
	]}}`)
	songs, err := parseNeteaseSearch(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(songs) != 1 || songs[0].ID != "186016" || songs[0].Artist != "周杰伦/杨瑞代" ||
		songs[0].Duration != 269 || songs[0].Source != "ne" {
		t.Errorf("parse mismatch: %+v", songs)
	}
}

func TestParseBilibiliSearch(t *testing.T) {
	body := []byte(`{"data":{"result":[
		{"bvid":"BV1a","title":"<em class=\"keyword\">晴天</em>","author":"UP主","duration":"04:29","pic":"//i0.hdslb.com/x.jpg","play":1000},
		{"bvid":"BV1b","title":"长视频","author":"UP2","duration":"1:02:03","pic":"//i0.hdslb.com/y.jpg","play":5000}
	]}}`)
	songs, err := parseBilibiliSearch(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(songs) != 2 {
		t.Fatalf("expected 2, got %d", len(songs))
	}
	// 按播放量降序：BV1b(5000) 在前
	if songs[0].ID != "BV1b" {
		t.Errorf("sort by play count failed: %+v", songs)
	}
	if songs[0].Duration != 3723 {
		t.Errorf("hh:mm:ss parse failed: %d", songs[0].Duration)
	}
	if songs[1].Title != "晴天" {
		t.Errorf("HTML tag not cleaned: %q", songs[1].Title)
	}
	if songs[1].Cover != "https://i0.hdslb.com/x.jpg" {
		t.Errorf("cover prefix: %q", songs[1].Cover)
	}
}

// TestPickReachableAudio 首个候选不通时应自动切换到可达节点
func TestPickReachableAudio(t *testing.T) {
	reachable := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") == "" {
			t.Error("probe should send Range header")
		}
		w.WriteHeader(http.StatusPartialContent)
		w.Write([]byte("ab"))
	}))
	defer reachable.Close()

	// 第一个候选指向必然超时/拒绝的地址，第二个指向可达的测试服务
	got := pickReachableAudio([]string{
		"http://127.0.0.1:1/unreachable.mp4",
		reachable.URL + "/audio.mp4",
	})
	if got != reachable.URL+"/audio.mp4" {
		t.Errorf("pickReachableAudio = %q, want reachable candidate", got)
	}
}

// TestPickReachableAudioFallback 全部不通时返回第一个候选（如实暴露错误）
func TestPickReachableAudioFallback(t *testing.T) {
	first := "http://127.0.0.1:1/first.mp4"
	if got := pickReachableAudio([]string{first, "http://127.0.0.1:1/second.mp4"}); got != first {
		t.Errorf("fallback = %q, want first candidate %q", got, first)
	}
}
