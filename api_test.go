package main

import (
	"os"
	"path/filepath"
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

// TestSaveLoadPlaylistRoundtrip 新格式歌单保存后应能完整读回
func TestSaveLoadPlaylistRoundtrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "playlist.json")
	songs := []Song{
		{ID: "1", Title: "歌一", Artist: "歌手A", Source: "kg", Duration: 180},
		{ID: "2", Title: "歌二", Artist: "歌手B", Source: "ne", Duration: 220},
	}
	if err := savePlaylistTo(path, songs); err != nil {
		t.Fatalf("save failed: %v", err)
	}
	got := loadPlaylistFrom(path)
	if len(got) != 2 {
		t.Fatalf("expected 2 songs, got %d", len(got))
	}
	if got[1].ID != "2" || got[1].Artist != "歌手B" || got[1].Source != "ne" {
		t.Errorf("roundtrip mismatch: %+v", got[1])
	}
}

// TestSavePlaylistToMissingDir 目录不存在时应报错而非 panic
func TestSavePlaylistToMissingDir(t *testing.T) {
	path := filepath.Join(t.TempDir(), "no", "such", "dir", "p.json")
	if err := savePlaylistTo(path, []Song{}); err == nil {
		t.Error("expected error for missing dir")
	}
}

// TestLoadPlaylistFromMissing 文件不存在时应返回空歌单
func TestLoadPlaylistFromMissing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing.json")
	if got := loadPlaylistFrom(path); len(got) != 0 {
		t.Errorf("expected empty, got %+v", got)
	}
}

// TestSaveLoadPlaylistsRoundtrip 多歌单保存后应能完整读回
func TestSaveLoadPlaylistsRoundtrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "playlists.json")
	pls := []Playlist{
		{ID: "p1", Name: "歌单一", Songs: []Song{{ID: "1", Title: "歌A", Source: "kg"}}},
		{ID: "p2", Name: "歌单二", Songs: []Song{}},
	}
	if err := savePlaylistsTo(path, pls); err != nil {
		t.Fatalf("save failed: %v", err)
	}
	got := loadPlaylistsFrom(path)
	if len(got) != 2 || got[0].Name != "歌单一" || got[0].Songs[0].Title != "歌A" {
		t.Errorf("roundtrip mismatch: %+v", got)
	}
}

// TestMigrateOldPlaylistTo 旧单歌单文件应迁移为"我的歌单"
func TestMigrateOldPlaylistTo(t *testing.T) {
	dir := t.TempDir()
	old := filepath.Join(dir, "old.json")
	if err := savePlaylistTo(old, []Song{{ID: "x", Title: "老歌", Source: "ne"}}); err != nil {
		t.Fatal(err)
	}
	pls := migrateOldPlaylistTo(old, filepath.Join(dir, "new.json"))
	if len(pls) != 1 || pls[0].Name != "我的歌单" || len(pls[0].Songs) != 1 {
		t.Errorf("migration mismatch: %+v", pls)
	}
	// 旧文件应保留
	if _, err := os.Stat(old); err != nil {
		t.Error("old file should be kept after migration")
	}
}

// TestMigrateOldPlaylistToMissing 无旧文件时返回空歌单
func TestMigrateOldPlaylistToMissing(t *testing.T) {
	dir := t.TempDir()
	pls := migrateOldPlaylistTo(filepath.Join(dir, "missing.json"), filepath.Join(dir, "new.json"))
	if len(pls) != 0 {
		t.Errorf("expected empty, got %+v", pls)
	}
}
