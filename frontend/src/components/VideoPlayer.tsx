import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import LiveIndicator from './LiveIndicator';
import PeopleDetection from './PeopleDetection';
import api from '../services/api';
import Hls from 'hls.js';
import type { VideoSource } from './VideoTabs';

interface VideoPlayerProps {
  currentTime: number;
  onTimeUpdate?: (time: number) => void;
  videoSource?: VideoSource;
  onPeopleCountChange?: (count: number) => void;
  isPeopleDetectionEnabled?: boolean;
  onTogglePeopleDetection?: () => void;
}

export interface VideoPlayerHandle {
  captureSnapshot: () => Promise<string | null>;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({ 
  currentTime, 
  onTimeUpdate, 
  videoSource,
  onPeopleCountChange,
  isPeopleDetectionEnabled = false,
  onTogglePeopleDetection
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  // Simple states for the two phases
  const [connecting, setConnecting] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  
  // Expose the captureSnapshot method to parent components
  useImperativeHandle(ref, () => ({
    captureSnapshot: async () => {
      if (!videoRef.current) return null;
      
      try {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        
        // Draw the current frame to the canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64 string (JPEG format with quality 0.95)
        return canvas.toDataURL('image/jpeg', 0.95);
      } catch (err) {
        console.error('Error capturing snapshot:', err);
        return null;
      }
    }
  }));

  // When the video source changes, restart the connection simulation
  useEffect(() => {
    const isHls = videoSource?.isHlsStream && videoSource?.hlsUrl;
    const filename = videoSource?.filename || 'football.mp4';
    const hlsUrl = videoSource?.hlsUrl;
    
    console.log(`Video source changed: ${isHls ? 'HLS Stream' : filename}`);
    
    // Clear any existing timeout and HLS instance
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    // Always show connecting when source changes
    setConnecting(true);
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    
    // Enable people detection for HLS streams only
    setIsPeopleDetectionEnabled(Boolean(isHls));
    
    // Get random connection time between 1-5 seconds
    const connectionTime = Math.floor(Math.random() * 4000) + 1000;
    console.log(`Simulating connection for ${connectionTime}ms`);
    
    // Set timeout for the connection phase
    timeoutRef.current = window.setTimeout(() => {
      setConnecting(false);
      console.log('Connection phase complete, now loading video');
      
      const videoElement = videoRef.current;
      if (!videoElement) return;
      
      // Handle HLS stream differently
      if (isHls && hlsUrl) {
        console.log(`Loading HLS stream from: ${hlsUrl}`);
        
        if (Hls.isSupported()) {
          const hls = new Hls({
            debug: false,
            enableWorker: true,
            // Add CORS config to help with some streams
            xhrSetup: (xhr) => {
              xhr.withCredentials = false; // Try without credentials
            }
          });
          
          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            console.log('HLS: Media attached');
          });
          
          hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log(`HLS: Manifest parsed, found ${data.levels.length} quality levels`);
            videoElement.play().catch(err => {
              console.warn('HLS: Autoplay prevented:', err);
            });
          });
          
          hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS error:', data);
            
            // Create helpful error message based on error type
            let errorMessage = 'Failed to load stream';
            
            if (data.response) {
              // Handle HTTP errors
              if (data.response.code === 403) {
                errorMessage = 'Access denied (403 Forbidden). This stream requires authorization or is not publicly accessible.';
              } else if (data.response.code === 404) {
                errorMessage = 'Stream not found (404). The URL may be incorrect.';
              } else if (data.response.code) {
                errorMessage = `HTTP error ${data.response.code}`;
              }
            }
            
            if (data.fatal) {
              switch(data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.error('HLS: Fatal network error', data);
                  errorMessage = `Network error: ${errorMessage}`;
                  
                  // Try to reload once for transient issues
                  if (!data.response || data.response.code !== 403) { // Don't retry for 403 errors
                    hls.startLoad();
                  } else {
                    setError('Stream Access Error');
                    setErrorDetails(errorMessage);
                    hls.destroy();
                  }
                  break;
                  
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.error('HLS: Fatal media error', data);
                  errorMessage = 'Media error: The stream format may be incompatible';
                  hls.recoverMediaError();
                  break;
                  
                default:
                  console.error('HLS: Fatal error', data);
                  setError('Stream Error');
                  setErrorDetails(errorMessage);
                  hls.destroy();
                  break;
              }
            }
          });
          
          hls.loadSource(hlsUrl);
          hls.attachMedia(videoElement);
          hlsRef.current = hls;
        } 
        else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
          // For native HLS support (Safari)
          videoElement.src = hlsUrl;
          videoElement.load();
        }
        else {
          setError('Browser Not Supported');
          setErrorDetails('Your browser does not support HLS streaming');
        }
      } 
      else {
        // Regular video file
        videoElement.src = api.getVideoUrl(filename);
        videoElement.load();
      }
    }, connectionTime);
    
    // Cleanup on unmount or source change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoSource]);
  
  // Handle video events
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    
    const handleCanPlay = () => {
      console.log('Video can play now');
      setLoading(false);
      videoElement.play().catch(err => {
        console.warn('Autoplay failed:', err);
      });
    };
    
    const handleTimeUpdate = () => {
      if (onTimeUpdate && !videoSource?.isHlsStream) {
        onTimeUpdate(videoElement.currentTime);
      }
    };
    
    const handleError = (e: Event) => {
      const videoEl = e.target as HTMLVideoElement;
      console.error('Video error:', videoEl.error);
      setError(`Failed to load ${videoSource?.isHlsStream ? 'live stream' : 'video'}`);
      if (videoEl.error) {
        setErrorDetails(`Error code: ${videoEl.error.code} - ${videoEl.error.message || 'Unknown error'}`);
      }
      setLoading(false);
    };
    
    const handlePlaying = () => {
      console.log('Video is now playing');
      setLoading(false);
    };
    
    videoElement.addEventListener('canplay', handleCanPlay);
    videoElement.addEventListener('playing', handlePlaying);
    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('error', handleError);
    
    return () => {
      videoElement.removeEventListener('canplay', handleCanPlay);
      videoElement.removeEventListener('playing', handlePlaying);
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('error', handleError);
      videoElement.pause();
    };
  }, [onTimeUpdate, videoSource]);
  
  // Update video time when needed (only for regular videos, not HLS)
  useEffect(() => {
    if (!videoRef.current || connecting || loading || error || videoSource?.isHlsStream) return;
    
    if (Math.abs(videoRef.current.currentTime - currentTime) > 0.5) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime, connecting, loading, error, videoSource]);

  // Sample HLS URLs that are known to work
  const sampleStreams = [
    { name: "Big Bunny Test Stream", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { name: "CBS News", url: "https://dai.google.com/linear/hls/pa/event/Sid4xiTQTkCT1SLu6rjUSQ/stream/ba5c124f-4fcb-4cb9-a8c9-6575bad90508:DLS/variant/df9d5f9fc8201f0878fd4a77927eea3b/bandwidth/3016996.m3u8" },
    { name: "ABC Live", url: "https://content-dtci.uplynk.com/channel/3324f2467c414329b3b0cc5cd987b6be.m3u8" },
    { name: "Times Square", url: "https://videos-3.earthcam.com/fecnetwork/hdtimes10.flv/chunklist_w609968167.m3u8" }
  ];

  // Toggle people detection
  const togglePeopleDetection = () => {
    setIsPeopleDetectionEnabled(!isPeopleDetectionEnabled);
  };

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      {/* Connecting overlay - shown during the fake connection phase */}
      {connecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4"></div>
          <p className="text-white font-medium">Connecting to camera</p>
          <p className="text-white/70 text-sm mt-2">Please wait...</p>
        </div>
      )}
      
      {/* Loading overlay - shown after connection while video loads */}
      {!connecting && loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4"></div>
          <p className="text-white">Loading {videoSource?.isHlsStream ? 'stream' : 'video'}...</p>
        </div>
      )}
      
      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
          <div className="bg-red-500 rounded-full p-3 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-white font-medium">{error}</p>
          {errorDetails && (
            <p className="text-white/80 text-sm mt-2 mb-4 text-center max-w-md px-4">
              {errorDetails}
            </p>
          )}
          
          {videoSource?.isHlsStream && (
            <div className="mt-2 mb-4 text-center">
              <p className="text-white text-sm mb-2">Try one of these working streams:</p>
              <div className="flex flex-col gap-2">
                {sampleStreams.map((stream, idx) => (
                  <button
                    key={idx}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                    onClick={() => {
                      // Find the component to change the URL
                      const event = new CustomEvent('tryStreamUrl', { 
                        detail: { name: stream.name, url: stream.url }
                      });
                      window.dispatchEvent(event);
                    }}
                  >
                    {stream.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <button 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => {
              setError(null);
              setErrorDetails(null);
              setConnecting(true);
              setLoading(true);
              
              // Force a reload by resetting the source or HLS instance
              if (videoRef.current) {
                videoRef.current.src = '';
                
                if (hlsRef.current) {
                  hlsRef.current.destroy();
                  hlsRef.current = null;
                }
              }
              
              // Restart the connection process
              const connectionTime = Math.floor(Math.random() * 4000) + 1000;
              timeoutRef.current = window.setTimeout(() => {
                setConnecting(false);
                if (videoRef.current) {
                  if (videoSource?.isHlsStream && videoSource.hlsUrl && Hls.isSupported()) {
                    // Reconnect HLS
                    const hls = new Hls();
                    hls.loadSource(videoSource.hlsUrl);
                    hls.attachMedia(videoRef.current);
                    hlsRef.current = hls;
                  } else {
                    // Regular video
                    videoRef.current.src = api.getVideoUrl(videoSource?.filename || 'football.mp4');
                    videoRef.current.load();
                  }
                }
              }, connectionTime);
            }}
          >
            Retry Connection
          </button>
        </div>
      )}
      
      <video 
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        loop={!videoSource?.isHlsStream}
        muted
        playsInline
        controls={videoSource?.isHlsStream}
      />
      
      {/* People detection overlay */}
      {videoSource?.isHlsStream && !error && !connecting && !loading && (
        <PeopleDetection 
          videoRef={videoRef}
          isEnabled={isPeopleDetectionEnabled}
          onPeopleCountChange={onPeopleCountChange}
        />
      )}
      
      <LiveIndicator />
    </div>
  );
});

export default VideoPlayer;