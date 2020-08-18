import { promises as fs } from 'fs';
import path from 'path';

import { Screenshot, Replay, MediaFile, VideoFile, ImageFile } from '@models/media';
import { Timestamp } from '@models/timestamp';
import ObsClient from '@services/obs/obs';
import { sleep } from '@util/async';
import { getLogger } from '@util/logger';
import * as ffmpeg from '@util/ffmpeg';
import { tmpDir } from '@util/fs';
import * as pathUtil from '@util/path';
import { sanitizeTimestamp, toMillis, fromMillis } from '@util/timestamp';

import { ReplayCache } from './replayCache';
import { ScreenshotCache } from './screenshot-cache';

const logger = getLogger('server/media');
const THUMBNAIL_SIZE = 135;
const SCREENSHOT_CACHE_LENIENCY_MS = 1000;
const REPLAY_CACHE_LENIENCY_MS = 500;
const REPLAY_COMPLETION_POLL_ATTEMPTS = 10;
const REPLAY_COMPLETION_POLL_INTERVAL_MS = 250;

export class MediaServer {
  private readonly obs: ObsClient;
  private readonly dirName: string;
  private dir: string | undefined;
  private streamWidth = 0;
  private streamHeight = 0;
  private recordingFile?: string;
  private recordingFolder?: string;
  // TODO: Cache per recording file
  private fullScreenshotCache = new ScreenshotCache(SCREENSHOT_CACHE_LENIENCY_MS);
  private thumbnailCache = new ScreenshotCache(SCREENSHOT_CACHE_LENIENCY_MS);
  private replayCache = new ReplayCache(REPLAY_CACHE_LENIENCY_MS);

  public constructor({ obsClient, dirName }: { obsClient: ObsClient; dirName: string }) {
    this.obs = obsClient;
    this.dirName = dirName;
  }

  public start(): void {
    this.dir = tmpDir(this.dirName);
    fs.mkdir(this.dir, { recursive: true });
    this.initObs();
  }

  private initObs(): void {
    // The recording file doesn't appear immediately
    this.obs.on('RecordingStarted', () => setTimeout(this.getRecordingFile.bind(this), 2000));
    this.obs.on('ConnectionOpened', async () => {
      logger.info('Connected to OBS');
      this.obs.isRecording()
        .map(isRecording => {
          if (isRecording) {
            this.getRecordingFile();
          } else {
            this.getRecordingFolder();
          }
        });
      this.obs.getOutputDimensions()
        .map(dims => {
          this.streamWidth = dims.width;
          this.streamHeight = dims.height;
        });
    });
  }

  public connected(): boolean {
    return this.obs.isConnected();
  }

  public getDir(): string {
    if (!this.dir) {
      throw new Error('Server used before starting');
    }
    return this.dir;
  }

  public getDirName(): string {
    return this.dirName;
  }

  private async getRecordingFile(): Promise<void> {
    const { file, folder } = await this.obs.getRecordingFile()
      .match(
        t => t,
        e => { throw e; },
      );
    // TODO: FFmpeg cannot operate on certain file types while they're still being written (e.g.
    // mp4). We should handle this somehow.
    this.recordingFile = file;
    this.recordingFolder = folder;
    logger.info(`Recording file: ${this.recordingFile}`);
    logger.info(`Recording folder: ${this.recordingFolder}`);
    this.fullScreenshotCache = new ScreenshotCache(SCREENSHOT_CACHE_LENIENCY_MS);
    this.thumbnailCache = new ScreenshotCache(SCREENSHOT_CACHE_LENIENCY_MS);
    this.replayCache = new ReplayCache(REPLAY_CACHE_LENIENCY_MS);
  }

  private async getRecordingFolder(): Promise<void> {
    const folder = await this.obs.getRecordingFolder()
      .match(
        t => t,
        e => { throw e; },
      );
    this.recordingFolder = folder;
    logger.info(`Recording folder: ${this.recordingFolder}`);
  }

  private async getCurrentScreenshot(height: number): Promise<Screenshot> {
    const timestampPromise = this.obs.getTimestamps()
      .match(
        t => t,
        e => { throw e; },
      );
    const imgPromise = this.obs.getCurrentThumbnail({ height })
      .match(
        t => t,
        e => { throw e; },
      );
    const [ timestamps, base64Img ] = await Promise.all([timestampPromise, imgPromise]);
    if (!base64Img) {
      throw new Error('Couldn\'t get screenshot');
    }

    const filename = await this.saveImageFile(
      timestamps.recordingTimestamp,
      height,
      Buffer.from(base64Img.substring(22), 'base64'),
    );
    return {
      image: { filename, url: this.getUrl(filename), type: 'image', height },
      recordingTimestampMs: timestamps.recordingTimestamp ?
        toMillis(timestamps.recordingTimestamp) :
        undefined,
      streamTimestampMs: timestamps.streamTimestamp ?
        toMillis(timestamps.streamTimestamp) :
        undefined,
    };
  }

  private async getVideoFrameFromMainRecording(
    timestamp: Timestamp,
    height: number,
  ): Promise<Buffer> {
    if (!this.recordingFile) {
      throw new Error('Recording not started');
    }
    return this.getVideoFrame(this.recordingFile, timestamp, height);
  }

  private async getVideoFrameFromReplay(
    replay: Replay & { recordingTimestampMs: number },
    millis: number,
    height: number,
  ): Promise<Buffer> {
    return this.getVideoFrame(
      this.getFullPath(replay.video),
      fromMillis(millis - replay.recordingTimestampMs),
      height,
    );
  }

  private async getVideoFrame(
    videoFile: string,
    timestamp: Timestamp,
    height: number,
  ): Promise<Buffer> {
    const img = await ffmpeg.getVideoFrame(videoFile, timestamp, { height })
      .catch(logger.error);
    if (!img) {
      throw new Error('Unable to get video thumbnail');
    }
    return img;
  }

  public async getCurrentFullScreenshot(): Promise<Screenshot> {
    return this.getCurrentScreenshot(this.streamHeight)
      .then(s => {
        this.fullScreenshotCache.add(s);
        this.thumbnailCache.add(s);
        return s;
      });
  }

  public async getCurrentThumbnail(): Promise<Screenshot> {
    this.getReplay();
    return this.getCurrentScreenshot(THUMBNAIL_SIZE)
      .then(s => {
        this.thumbnailCache.add(s);
        return s;
      });
  }

  public async getFullScreenshot(timestamp: Timestamp): Promise<Screenshot> {
    return this.getScreenshot(
      timestamp,
      [ this.fullScreenshotCache ],
      [ this.fullScreenshotCache, this.thumbnailCache ],
      this.streamHeight,
    );
  }

  public async getThumbnail(timestamp: Timestamp): Promise<Screenshot> {
    return this.getScreenshot(
      timestamp,
      [ this.thumbnailCache, this.fullScreenshotCache ],
      [ this.thumbnailCache ],
      THUMBNAIL_SIZE,
    );
  }

  private async getScreenshot(
    timestamp: Timestamp,
    readCaches: ScreenshotCache[],
    writeCaches: ScreenshotCache[],
    height: number,
  ): Promise<Screenshot> {
    const millis = toMillis(timestamp);
    for (const cache of readCaches) {
      const cachedScreenshot = cache.get(millis);
      if (cachedScreenshot) {
        return cachedScreenshot;
      }
    }
    let asyncImage: Promise<Buffer> | undefined;
    const cachedReplay = this.replayCache.get(millis);
    if (cachedReplay) {
      asyncImage = this.getVideoFrameFromReplay(cachedReplay, millis, height);
    } else {
      asyncImage = this.getVideoFrameFromMainRecording(timestamp, height);
    }
    const img = await asyncImage;
    const filename = await this.saveImageFile(timestamp, height, img);
    const screenshot: Screenshot = {
      image: { filename, url: this.getUrl(filename), type: 'image', height },
      recordingTimestampMs: millis,
      // TODO: streamTimestampMs?
    };
    writeCaches.forEach(cache => cache.add(screenshot));
    return screenshot;
  }

  private async saveImageFile(
    timestamp: string | null,
    size: number,
    img: Buffer,
  ): Promise<string> {
    const timestampStr = timestamp ? sanitizeTimestamp(timestamp) : Date.now();
    const filename = `${timestampStr}_${size}.png`;
    await this.saveFile(filename, img);
    return filename;
  }

  private async saveFile(filename: string, data: unknown): Promise<void> {
    return await fs.writeFile(this.getFullPath(filename), data, { encoding: 'hex' });
  }

  private getUrl(filename: string): string {
    return `/${this.dirName}/${filename}`;
  }

  public getFullPath(fileOrName: MediaFile | string): string {
    const filename = typeof fileOrName === 'string' ?
      fileOrName :
      fileOrName.filename;
    return path.normalize(path.join(this.getDir(), filename));
  }

  // TODO: Get rid of this
  public getPathFromUrl(url: string): string {
    return url.replace(`/${this.dirName}`, this.getDir());
  }

  public async getReplay(): Promise<Replay> {
    return this.obs.saveReplayBuffer()
      .match(
        file => this.fetchReplayFile(file),
        e => { throw e; },
      );
  }

  private async fetchReplayFile(filePath: string): Promise<Replay> {
    logger.info('Fetching replay file:', filePath);
    const videoStats = await this.waitForVideoFileCompletion(filePath);
    if (!videoStats) {
      throw new Error(`File ${filePath} never completed`);
    }

    const dir = this.getDir();
    const nowMs = Date.now();
    const [ timestamps, fileStats, copiedFilePath ] = await Promise.all([
      this.obs.getTimestamps()
        .match(
          t => t,
          e => { throw e; },
        ),
      fs.stat(filePath),
      ffmpeg.copyToWebCompatibleFormat(filePath, dir),
    ]);
    if (!copiedFilePath) {
      throw new Error(`Unable to copy replay file to ${dir}`);
    }

    fs.unlink(filePath);
    const filename = path.basename(copiedFilePath);
    const video: VideoFile = {
      type: 'video',
      filename,
      url: this.getUrl(filename),
      durationMs: videoStats.durationMs,
    };

    const waveform = await this.getVideoWaveform(video);

    const replay: Replay = { video, waveform };
    if (timestamps && fileStats) {
      const msSinceFileCreation = nowMs - Math.trunc(fileStats.birthtimeMs);
      if (timestamps.streamTimestamp) {
        const endMillis = toMillis(timestamps.streamTimestamp) - msSinceFileCreation;
        replay.streamTimestampMs = endMillis - videoStats.durationMs;
      }
      if (timestamps.recordingTimestamp) {
        const endMillis = toMillis(timestamps.recordingTimestamp) - msSinceFileCreation;
        replay.recordingTimestampMs = endMillis - videoStats.durationMs;
        this.replayCache.add(replay);
      }
    }
    return replay;
  }

  private async waitForVideoFileCompletion(
    filePath: string,
  ): Promise<Required<ffmpeg.VideoStats> | null> {
    for (let i = 0; i < REPLAY_COMPLETION_POLL_ATTEMPTS; i++) {
      const stats = await ffmpeg.getVideoStats(filePath);
      if (stats.durationMs == null) {
        logger.debug('Video file not finished writing:', filePath);
        await sleep(REPLAY_COMPLETION_POLL_INTERVAL_MS);
        continue;
      }
      return stats as Required<ffmpeg.VideoStats>;
    }
    return null;
  }

  public async getVideoWaveform(video: VideoFile): Promise<ImageFile> {
    const filePath = this.getFullPath(video);
    const waveformFilename = `${pathUtil.withoutExtension(video.filename)}_waveform.png`;
    const waveformPath = this.getFullPath(waveformFilename);
    await ffmpeg.getWaveform(filePath, waveformPath, video.durationMs);
    return {
      type: 'image',
      filename: waveformFilename,
      url: this.getUrl(waveformFilename),
      height: ffmpeg.WAVEFORM_HEIGHT,
    };
  }

  public async cutVideo(
    video: VideoFile,
    startMs: number,
    endMs: number,
    filename: string,
  ): Promise<VideoFile> {
    await ffmpeg.lossyCut(
      this.getFullPath(video),
      fromMillis(startMs),
      fromMillis(endMs),
      this.getFullPath(filename),
    );
    // TODO: We might need to actually read the file metadata and get the real
    // duration
    return {
      type: 'video',
      filename,
      url: this.getUrl(filename),
      durationMs: endMs - startMs,
    };
  }
}
