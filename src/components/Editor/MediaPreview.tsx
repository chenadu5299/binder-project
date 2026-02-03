import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PlayIcon, PauseIcon, SpeakerWaveIcon, SpeakerXMarkIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline';

interface MediaPreviewProps {
  filePath: string;
  fileType: 'audio' | 'video';
}

const MediaPreview: React.FC<MediaPreviewProps> = ({ filePath, fileType }) => {
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [fileSize, setFileSize] = useState<number>(0);
  const [formatSupported, setFormatSupported] = useState<boolean | null>(null);
  const [skipFormatCheck, setSkipFormatCheck] = useState<boolean>(false);
  const [videoReady, setVideoReady] = useState<boolean>(false);
  
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 格式化文件大小（提前定义，供 useEffect 使用）
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // 获取 MIME 类型
  const getMimeType = (): string => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (fileType === 'audio') {
      if (ext === 'mp3') return 'audio/mpeg';
      if (ext === 'wav') return 'audio/wav';
      if (ext === 'ogg') return 'audio/ogg';
      if (ext === 'aac') return 'audio/aac';
      if (ext === 'm4a') return 'audio/mp4';
      return 'audio/mpeg';
    } else {
      if (ext === 'mp4') return 'video/mp4';
      if (ext === 'webm') return 'video/webm';
      if (ext === 'ogg') return 'video/ogg';
      return 'video/mp4';
    }
  };

  // 获取文件大小（在加载前检查）
  useEffect(() => {
    const getFileSize = async () => {
      try {
        const size = await invoke<number>('get_file_size', { path: filePath });
        setFileSize(size);
        
        // 大文件处理：超过 100MB 提示用户
        const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
        if (size > MAX_FILE_SIZE) {
          setError(`文件过大（${formatFileSize(size)}），超过限制（100 MB）。建议使用其他工具打开。`);
          setLoading(false);
          return;
        }
        
        // 超过 50MB 提示用户（但不阻止加载）
        const LARGE_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        if (size > LARGE_FILE_SIZE) {
          // 显示提示但不阻止加载
          console.warn(`文件较大（${formatFileSize(size)}），加载可能需要一些时间`);
        }
      } catch (err) {
        console.warn('获取文件大小失败:', err);
        // 如果获取失败，继续加载（使用估算值）
      }
    };
    getFileSize();
  }, [filePath]);

  // 格式兼容性检测和加载文件
  useEffect(() => {
    let url: string | null = null;
    let isCancelled = false;

    const loadFile = async () => {
      try {
        setLoading(true);
        setError('');

        // 先检测格式兼容性（如果未跳过检测）
        // 注意：对于主流格式（MP3、MP4等），即使 canPlayType 返回空字符串，也允许尝试加载
        if (!skipFormatCheck) {
          const mimeType = getMimeType();
          let canPlay = false;
          if (fileType === 'audio') {
            const audio = document.createElement('audio');
            const support = audio.canPlayType(mimeType);
            canPlay = support === 'probably' || support === 'maybe';
            // 对于主流格式，即使返回空字符串也允许尝试
            const ext = filePath.split('.').pop()?.toLowerCase();
            if (!canPlay && ['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext || '')) {
              canPlay = true; // 主流格式允许尝试
            }
          } else if (fileType === 'video') {
            const video = document.createElement('video');
            const support = video.canPlayType(mimeType);
            canPlay = support === 'probably' || support === 'maybe';
            // 对于主流格式，即使返回空字符串也允许尝试
            const ext = filePath.split('.').pop()?.toLowerCase();
            if (!canPlay && ['mp4', 'webm', 'ogg'].includes(ext || '')) {
              canPlay = true; // 主流格式允许尝试
            }
          }
          setFormatSupported(canPlay);

          // 如果格式明确不支持（非主流格式且返回空字符串），不加载文件
          if (!canPlay) {
            setLoading(false);
            return;
          }
        } else {
          // 跳过格式检测，直接加载
          setFormatSupported(true);
        }

        // 检查是否已取消
        if (isCancelled) return;

        // 读取文件为 base64
        const base64 = await invoke<string>('read_file_as_base64', { path: filePath });
        
        // 检查是否已取消
        if (isCancelled) return;
        
        // 如果文件大小还未获取，使用估算值
        if (fileSize === 0) {
          const estimatedSize = (base64.length * 3) / 4;
          setFileSize(estimatedSize);
        }
        
        // 将 base64 转换为 Uint8Array
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // 检查是否已取消
        if (isCancelled) return;

        // 创建 Blob 和 Blob URL
        const mimeType = getMimeType();
        const blob = new Blob([bytes], { type: mimeType });
        url = URL.createObjectURL(blob);
        
        // 再次检查是否已取消
        if (isCancelled) {
          URL.revokeObjectURL(url);
          url = null;
          return;
        }
        
        setBlobUrl(url);
        setLoading(false);
        // 重置视频就绪状态
        if (fileType === 'video') {
          setVideoReady(false);
        }
      } catch (err) {
        if (isCancelled) return;
        console.error('加载文件失败:', err);
        setError(`加载文件失败: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
        setFormatSupported(false);
      }
    };

    loadFile();

    // 清理函数：释放 Blob URL 和取消加载
    return () => {
      isCancelled = true;
      if (url) {
        URL.revokeObjectURL(url);
      }
      // 如果媒体元素存在，暂停播放
      if (mediaRef.current) {
        if (fileType === 'audio') {
          (mediaRef.current as HTMLAudioElement).pause();
        } else {
          (mediaRef.current as HTMLVideoElement).pause();
        }
      }
    };
  }, [filePath, fileType, skipFormatCheck]);

  // 清理 Blob URL（当组件卸载或文件路径改变时）
  useEffect(() => {
    return () => {
      if (blobUrl) {
        console.log('[MediaPreview] Cleaning up blob URL');
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // 播放/暂停控制
  const handlePlayPause = async () => {
    if (!mediaRef.current) return;

    try {
      if (isPlaying) {
        mediaRef.current.pause();
        setIsPlaying(false);
      } else {
        await mediaRef.current.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('播放/暂停操作失败:', err);
      setError('播放失败，请检查文件格式');
      setIsPlaying(false);
    }
  };

  // 进度条更新
  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime);
      if (mediaRef.current.duration && !isNaN(mediaRef.current.duration)) {
        setDuration(mediaRef.current.duration);
      }
    }
  };

  // 进度条拖拽
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mediaRef.current || !progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    mediaRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // 音量控制
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (mediaRef.current) {
      (mediaRef.current as HTMLAudioElement | HTMLVideoElement).volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  };

  // 静音切换
  const handleMuteToggle = () => {
    if (!mediaRef.current) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    (mediaRef.current as HTMLAudioElement | HTMLVideoElement).volume = newMuted ? 0 : volume;
  };

  // 播放速度控制
  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (mediaRef.current) {
      (mediaRef.current as HTMLAudioElement | HTMLVideoElement).playbackRate = rate;
    }
  };

  // 全屏功能（仅视频）
  const handleFullscreen = async () => {
    if (fileType !== 'video' || !videoRef.current) return;
    
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await videoRef.current.requestFullscreen();
      }
    } catch (err) {
      console.error('全屏操作失败:', err);
    }
  };

  // 获取格式信息
  const getFormatInfo = (): string => {
    const ext = filePath.split('.').pop()?.toUpperCase() || '';
    return ext;
  };

  // 格式化时间
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 错误处理
  const handleError = () => {
    if (mediaRef.current) {
      const error = mediaRef.current.error;
      if (error) {
        let errorMessage = '播放失败';
        switch (error.code) {
          case error.MEDIA_ERR_ABORTED:
            errorMessage = '播放被中止';
            break;
          case error.MEDIA_ERR_NETWORK:
            errorMessage = '网络错误';
            break;
          case error.MEDIA_ERR_DECODE:
            errorMessage = '文件格式不支持或文件已损坏';
            break;
          case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = '格式不支持，请转换为 MP3/MP4 格式';
            break;
        }
        setError(errorMessage);
      }
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-4">
        <div className="text-center text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  // 格式不支持提示（仅在明确不支持时显示，maybe 状态允许尝试）
  if (formatSupported === false && !skipFormatCheck) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-4">
        <div className="text-center text-yellow-600 dark:text-yellow-400 max-w-md">
          <p className="mb-2 font-semibold">格式不支持</p>
          <p className="text-sm mb-4">
            此格式（{getFormatInfo()}）可能不被浏览器支持，建议转换为 {fileType === 'audio' ? 'MP3/WAV' : 'MP4/WebM'} 格式。
          </p>
          <button
            onClick={() => {
              setSkipFormatCheck(true);
              setFormatSupported(null);
              setError('');
              setLoading(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            仍要尝试
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-4">
        <div className="text-center text-red-500 max-w-md">
          <p className="mb-2 font-semibold">{error}</p>
          <button
            onClick={() => {
              setError('');
              setLoading(true);
              // 重新加载
              window.location.reload();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!blobUrl) {
    return null;
  }

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-800">
      {/* 文件信息显示 */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {filePath.split('/').pop()}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {getFormatInfo()}
              </span>
              {fileSize > 0 && (
                <span className="text-gray-500 dark:text-gray-400">
                  {formatFileSize(fileSize)}
                </span>
              )}
            </div>
            {duration > 0 && (
              <span className="text-gray-500 dark:text-gray-400">
                时长: {formatTime(duration)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 媒体播放器 */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        {fileType === 'audio' ? (
          <div className="w-full max-w-2xl">
            <audio
              ref={(el) => {
                mediaRef.current = el;
                if (el && blobUrl) {
                  console.log('[MediaPreview] Audio element created, src:', blobUrl);
                }
              }}
              src={blobUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => {
                handleTimeUpdate();
                console.log('[MediaPreview] Audio metadata loaded');
              }}
              onCanPlay={() => {
                console.log('[MediaPreview] Audio can play');
              }}
              onPlay={() => {
                console.log('[MediaPreview] Audio started playing');
                setIsPlaying(true);
              }}
              onPause={() => {
                console.log('[MediaPreview] Audio paused');
                setIsPlaying(false);
              }}
              onEnded={() => {
                console.log('[MediaPreview] Audio ended');
                setIsPlaying(false);
              }}
              onError={(e) => {
                console.error('[MediaPreview] Audio error:', e);
                handleError();
              }}
              className="w-full"
              preload="auto"
            />
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            {!videoReady && blobUrl && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-sm z-10 pointer-events-none">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                  <p>加载视频中...</p>
                </div>
              </div>
            )}
            <video
              ref={(el) => {
                mediaRef.current = el;
                videoRef.current = el;
                if (el && blobUrl) {
                  console.log('[MediaPreview] Video element created, src:', blobUrl);
                }
              }}
              src={blobUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => {
                handleTimeUpdate();
                console.log('[MediaPreview] Video metadata loaded');
                // 确保视频尺寸正确
                if (videoRef.current) {
                  const video = videoRef.current;
                  console.log('[MediaPreview] Video dimensions:', {
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                    clientWidth: video.clientWidth,
                    clientHeight: video.clientHeight,
                    readyState: video.readyState
                  });
                  // 如果视频已准备好，尝试显示第一帧
                  if (video.readyState >= 2) {
                    setVideoReady(true);
                    // 尝试显示第一帧（不播放）
                    video.currentTime = 0.1;
                  }
                }
              }}
              onLoadedData={() => {
                console.log('[MediaPreview] Video data loaded');
                if (videoRef.current && videoRef.current.readyState >= 2) {
                  setVideoReady(true);
                }
              }}
              onCanPlay={() => {
                console.log('[MediaPreview] Video can play');
                setVideoReady(true);
                // 显示第一帧
                if (videoRef.current && !isPlaying) {
                  videoRef.current.currentTime = 0.1;
                }
              }}
              onCanPlayThrough={() => {
                console.log('[MediaPreview] Video can play through');
                setVideoReady(true);
              }}
              onPlay={() => {
                console.log('[MediaPreview] Video started playing');
                setIsPlaying(true);
              }}
              onPause={() => {
                console.log('[MediaPreview] Video paused');
                setIsPlaying(false);
              }}
              onEnded={() => {
                console.log('[MediaPreview] Video ended');
                setIsPlaying(false);
              }}
              onError={(e) => {
                console.error('[MediaPreview] Video error:', e);
                if (videoRef.current?.error) {
                  console.error('[MediaPreview] Video error details:', {
                    code: videoRef.current.error.code,
                    message: videoRef.current.error.message
                  });
                }
                handleError();
              }}
              className="w-full h-full object-contain"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
              controls={false}
              preload="auto"
              playsInline
              muted={false}
            />
          </div>
        )}
      </div>

      {/* 播放控制栏 */}
      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="max-w-4xl mx-auto">
          {/* 进度条 */}
          <div
            ref={progressRef}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer mb-4"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-blue-600 rounded-full transition-all"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* 播放/暂停按钮 */}
              <button
                onClick={handlePlayPause}
                className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {isPlaying ? (
                  <PauseIcon className="w-6 h-6" />
                ) : (
                  <PlayIcon className="w-6 h-6" />
                )}
              </button>

              {/* 时间显示 */}
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* 播放速度控制 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">速度:</span>
                <select
                  value={playbackRate}
                  onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                  className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1}>1x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2x</option>
                </select>
              </div>

              {/* 音量控制 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleMuteToggle}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1"
                >
                  {isMuted ? (
                    <SpeakerXMarkIcon className="w-5 h-5" />
                  ) : (
                    <SpeakerWaveIcon className="w-5 h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-24"
                />
              </div>

              {/* 全屏按钮（仅视频） */}
              {fileType === 'video' && (
                <button
                  onClick={handleFullscreen}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1"
                  title="全屏"
                >
                  <ArrowsPointingOutIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaPreview;

