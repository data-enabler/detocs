import memoize from 'micro-memoize';
import { h, VNode, FunctionalComponent as FC } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
import { JSXInternal } from 'preact/src/jsx';

import { MediaFile, VideoFile, ImageFile } from '@models/media';
import { fromMillis } from '@util/timestamp';
import e from 'express';

interface ThumbnailProps extends Omit<JSXInternal.HTMLAttributes, 'media'> {
  media?: MediaFile | null;
}

interface VideoThumbnailProps extends ThumbnailProps {
  media: VideoFile;
}

interface ImageThumbnailProps extends ThumbnailProps {
  media: ImageFile;
}

interface MediaIntersectionObserverEntry extends IntersectionObserverEntry {
  target: HTMLVideoElement;
}

interface ImageIntersectionObserverEntry extends IntersectionObserverEntry {
  target: HTMLImageElement;
}

export const Thumbnail: FC<ThumbnailProps> = (props): VNode => {
  switch (props.media?.type) {
    case 'video':
      return <VideoThumbnail {...props as VideoThumbnailProps} />;
    case 'image':
      return <ImageThumbnail {...props as ImageThumbnailProps} />;
    default:
      return <EmptyThumbnail {...props} />;
  }
};

function isVideoLoaded(elem: HTMLVideoElement): boolean {
  return !!elem.src &&
    elem.networkState === HTMLMediaElement.NETWORK_IDLE ||
    elem.networkState === HTMLMediaElement.NETWORK_LOADING;
}

function isImageLoaded(elem: HTMLImageElement): boolean {
  return !!elem.src;
}

const videoVisibilityHandler = (entries: MediaIntersectionObserverEntry[]): void => {
  entries
    .filter(entry => !entry.isIntersecting && isVideoLoaded(entry.target))
    .map(entry => entry.target)
    .forEach(video => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
  entries
    .filter(entry => entry.isIntersecting && !isVideoLoaded(entry.target))
    .map(entry => entry.target)
    .forEach(video => {
      video.src = video.dataset.src || '';
      video.load();
    });
};

const getVideoObserver = memoize(() => new IntersectionObserver(
  videoVisibilityHandler  as unknown as IntersectionObserverCallback,
  { rootMargin: '10%' },
));

const imageVisibilityHandler = (entries: ImageIntersectionObserverEntry[]): void => {
  entries
    .filter(entry => !entry.isIntersecting && isImageLoaded(entry.target))
    .map(entry => entry.target)
    .forEach(image => {
      image.removeAttribute('src');
    });
  entries
    .filter(entry => entry.isIntersecting && !isImageLoaded(entry.target))
    .map(entry => entry.target)
    .forEach(image => {
      image.src = image.dataset.src || '';
    });
};

const getImageObserver = memoize(() => new IntersectionObserver(
  imageVisibilityHandler  as unknown as IntersectionObserverCallback,
  { rootMargin: '10%' },
));

const VideoThumbnail: FC<VideoThumbnailProps> = ({ media, ...additionalProps }): VNode => {
  const videoRef = useRef<HTMLVideoElement>();
  const playVideo = (): void => { videoRef.current?.play(); };
  const pauseVideo = (): void => { videoRef.current?.pause(); };
  useEffect(() => {
    if (!videoRef.current) {
      console.warn('Unable to observe <video> element for thumbnail');
      return;
    }
    getVideoObserver().observe(videoRef.current);
    return () => {
      videoRef.current && getVideoObserver().unobserve(videoRef.current);
    };
  }, []);
  // TODO: Show current playback progress?
  return (
    <div className="thumbnail" {...additionalProps}>
      <video
        ref={videoRef}
        data-src={media.url}
        class="thumbnail__media"
        muted={true}
        controls={false}
        {...{'disablePictureInPicture': true}}
        autoPlay={false}
        preload={'metadata'}
        loop={true}
        onMouseEnter={playVideo}
        onFocus={playVideo}
        onMouseLeave={pauseVideo}
        onBlur={pauseVideo}
      >
      </video>
      <div className="thumbnail__metadata">
        {fromMillis(media.durationMs).slice(0, -4)}
      </div>
    </div>
  );
};

const ImageThumbnail: FC<ImageThumbnailProps> = ({ media, ...additionalProps }): VNode => {
  const imageRef = useRef<HTMLImageElement>();
  useEffect(() => {
    if (!imageRef.current) {
      console.warn('Unable to observe <object> element for thumbnail');
      return;
    }
    getImageObserver().observe(imageRef.current);
    return () => {
      imageRef.current && getImageObserver().unobserve(imageRef.current);
    };
  }, []);
  return (
    <div className="thumbnail" {...additionalProps}>
      <img
        ref={imageRef}
        data-src={media.url}
        class="thumbnail__media"
      />
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const EmptyThumbnail: FC<ThumbnailProps> = ({ media, ...additionalProps }): VNode => {
  return (
    <div className="thumbnail" {...additionalProps}>
      <div class="thumbnail__placeholder" />
    </div>
  );
};
