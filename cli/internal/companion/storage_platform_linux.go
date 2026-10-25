//go:build linux

package companion

import (
	"fmt"
	"os"
	"syscall"
)

func storageFree(root string) (*uint64, string) {
	var stat syscall.Statfs_t
	if syscall.Statfs(root, &stat) != nil || stat.Bsize <= 0 {
		return nil, "UNAVAILABLE"
	}
	bytes := stat.Bavail * uint64(stat.Bsize)
	return &bytes, "Linux filesystem available bytes; not cleanup savings"
}

func safeStorageOwner(info os.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && stat.Uid == uint32(os.Getuid()) && (!info.Mode().IsRegular() || stat.Nlink == 1) && info.Mode().Perm()&0022 == 0
}

func storageIdentity(info os.FileInfo) string {
	stat,ok:=info.Sys().(*syscall.Stat_t);if !ok{return ""}
	return fmt.Sprintf("%d:%d:%d:%d",stat.Dev,stat.Ino,stat.Ctim.Sec,stat.Ctim.Nsec)
}

const storageNativeBoundary = "Linux UID, nonshared write permissions and hardlink metadata checked; not enrolled owner identity"
