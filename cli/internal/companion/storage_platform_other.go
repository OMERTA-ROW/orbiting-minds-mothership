//go:build !linux

package companion

import "os"

func storageFree(root string) (*uint64, string) {
	return nil, "UNSUPPORTED: native free-space adapter not verified on this host"
}
func safeStorageOwner(info os.FileInfo) bool  { return false }
func storageIdentity(info os.FileInfo) string { return "" }

const storageNativeBoundary = "UNSUPPORTED: native ownership, hardlink and ACL adapter not verified on this host"
