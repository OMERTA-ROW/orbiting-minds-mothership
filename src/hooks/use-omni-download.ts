import { useState } from "react";

export function useOmniDownload() {
  const [downloadNotice, setDownloadNotice] = useState("");
  const download = (action: () => void) => {
    try {
      action();
      setDownloadNotice("Download prepared. No connection or task was started.");
    } catch {
      setDownloadNotice("Download failed. Your records are unchanged; retry the export.");
    }
  };
  return { download, downloadNotice };
}
