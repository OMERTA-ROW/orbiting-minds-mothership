package companion

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestStorageExcludesAnotherOSUsersFiles(t *testing.T) {
	if runtime.GOOS != "linux" || os.Getuid() != 0 {
		t.Skip("disposable Linux root fixture ownership test")
	}
	p, now := maintenanceFixture(t)
	file := filepath.Join(p.Root, ".evolution/cache/other-user.bin")
	if err := os.WriteFile(file, []byte("another OS user"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chown(file, 65534, 65534); err != nil {
		t.Fatal(err)
	}
	r, err := ReportStorage(context.Background(), p, "local", now)
	if err != nil {
		t.Fatal(err)
	}
	for _, candidate := range append(r.LargeFiles, r.Candidates...) {
		if candidate.Path == ".evolution/cache/other-user.bin" {
			t.Fatal("another OS user's file exposed")
		}
	}
}
