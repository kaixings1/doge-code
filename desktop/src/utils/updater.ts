interface UpdateInfo {
  version: string;
  downloadUrl: string;
  checksum: string;
  releaseDate: string;
  releaseNotes: string;
}

export class Updater {
  private currentVersion: string;
  private updateUrl: string;

  constructor(currentVersion: string, updateUrl: string = 'https://api.github.com/repos/doge-code/cli/releases/latest') {
    this.currentVersion = currentVersion;
    this.updateUrl = updateUrl;
  }

  /**
   * 检查更新
   */
  async checkUpdate(): Promise<UpdateInfo | null> {
    try {
      const response = await fetch(this.updateUrl);
      const data = await response.json();

      const latestVersion = data.tag_name.replace('v', '');

      if (this.isNewer(latestVersion, this.currentVersion)) {
        return {
          version: latestVersion,
          downloadUrl: this.findDownloadUrl(data),
          checksum: data.checksum,
          releaseDate: data.published_at,
          releaseNotes: data.body,
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return null;
    }
  }

  /**
   * 比较版本
   */
  private isNewer(version1: string, version2: string): boolean {
    const v1 = version1.split('.').map(Number);
    const v2 = version2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (v1[i] > v2[i]) return true;
      if (v1[i] < v2[i]) return false;
    }

    return false;
  }

  /**
   * 查找下载 URL
   */
  private findDownloadUrl(releaseData: any): string {
    const { platform, arch } = getPlatformInfo();
    const fileName = arch === 'arm64' ? `doge-${platform}-${arch}` : `doge-${platform}-x64`;

    const asset = releaseData.assets.find((a: any) =>
      a.name.includes(fileName)
    );

    return asset?.browser_download_url || '';
  }
}