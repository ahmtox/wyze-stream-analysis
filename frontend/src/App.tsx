import { useState, useEffect, useCallback, useRef } from 'react';
import VideoPlayer, { VideoPlayerHandle } from './components/VideoPlayer';
import VideoTabs, { VideoSource } from './components/VideoTabs';
import AnalysisControls from './components/AnalysisControls';
import AnalysisHistory from './components/AnalysisHistory';
import AddStreamModal from './components/AddStreamModal';
import api from './services/api';
import type { AnalysisResult } from './services/api';

function App() {
  const [currentTime, setCurrentTime] = useState(0);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [latestResult, setLatestResult] = useState<AnalysisResult | null>(null);
  const [backendStatus, setBackendStatus] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoSource[]>([]);
  const [activeVideoId, setActiveVideoId] = useState('football');
  const [isAddStreamModalOpen, setIsAddStreamModalOpen] = useState(false);
  const [peopleCount, setPeopleCount] = useState(0);
  const [isPeopleDetectionEnabled, setIsPeopleDetectionEnabled] = useState(false);
  const [showDetectionOverlay, setShowDetectionOverlay] = useState(true);

  // Reference to the video player component to access snapshot method
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  
  // Load videos and initial history
  useEffect(() => {
    loadVideos();
    loadHistory();
  }, []);

  useEffect(() => {
    const handleTryStreamUrl = (event: Event) => {
      const { name, url } = (event as CustomEvent).detail;
      // Add stream and change to it
      handleAddStream(name, url);
    };
    
    window.addEventListener('tryStreamUrl', handleTryStreamUrl);
    
    return () => {
      window.removeEventListener('tryStreamUrl', handleTryStreamUrl);
    };
  }, []);
  
  const loadVideos = async () => {
    const videoList = await api.getVideos();
    setVideos(videoList);
    
    // Set initial active video if videos are available
    if (videoList.length > 0 && !activeVideoId) {
      setActiveVideoId(videoList[0].id);
    }
  };

  const handlePeopleCountChange = useCallback((count: number) => {
    setPeopleCount(count);
  }, []);

  const handleTabChange = useCallback((id: string) => {
    setActiveVideoId(id);
    setCurrentTime(0);
    setIsPeopleDetectionEnabled(false); // Disable people detection when switching cameras
    setPeopleCount(0); // Reset people count
  }, []);
  
  const handleAddStreamClick = () => {
    setIsAddStreamModalOpen(true);
  };
  
  const handleAddStream = (name: string, url: string) => {
    // Generate an ID from the name
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
    
    // Create the new stream source
    const newStream: VideoSource = {
      id,
      name,
      filename: '', // Empty for HLS streams
      description: `Live stream from ${url}`,
      isHlsStream: true,
      hlsUrl: url
    };
    
    // Add to videos array and set as active
    setVideos([...videos, newStream]);
    setActiveVideoId(id);
  };
  
  // Find the current video source based on active ID
  const getCurrentVideoSource = (): VideoSource | undefined => {
    return videos.find(v => v.id === activeVideoId);
  };
  
  // Get current video filename or URL based on active ID
  const getCurrentVideoFilename = (): string => {
    const video = getCurrentVideoSource();
    return video ? video.filename : 'football.mp4';
  };
  
  const testBackendConnection = async () => {
    try {
      const result = await api.testConnection();
      setBackendStatus(`Connected! Server time: ${result.time}`);
      console.log('Backend test successful:', result);
    } catch (error) {
      console.error('Backend connection test failed:', error);
      setBackendStatus('Failed to connect to backend');
    }
  };  

  const togglePeopleDetection = useCallback(() => {
    setIsPeopleDetectionEnabled(prev => !prev);
  }, []);

  const toggleDetectionOverlay = useCallback(() => {
    setShowDetectionOverlay(prev => !prev);
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      // Load both regular and stream history
      const history = await api.getHistory('default', true);
      setAnalysisHistory(history);
      console.log(`Loaded ${history.length} history items`);
    } catch (error) {
      console.error('Failed to load analysis history:', error);
    }
  }, []);

  const handleAnalysisRequest = useCallback(async (time: number, prompt?: string) => {
    setIsProcessing(true);
    try {
      const currentSource = getCurrentVideoSource();
      
      if (!currentSource) {
        throw new Error("No video source selected");
      }
      
      // For HLS streams, capture snapshot from video element
      if (currentSource.isHlsStream) {
        if (!videoPlayerRef.current) {
          throw new Error("Video player reference not available");
        }
        
        // Capture snapshot from the video element
        const snapshotDataUrl = await videoPlayerRef.current.captureSnapshot();
        
        if (!snapshotDataUrl) {
          throw new Error("Failed to capture snapshot from live stream");
        }
        
        // Convert data URL to a file object
        const imgBlob = await (await fetch(snapshotDataUrl)).blob();
        const formData = new FormData();
        formData.append('image', imgBlob, 'livestream_snapshot.jpg');
        formData.append('prompt', prompt || 'Default prompt');
        formData.append('deviceId', 'default');
        formData.append('isLiveStream', 'true');
        formData.append('streamName', currentSource.name);
        
        // Send to backend for analysis
        const result = await api.analyzeStreamSnapshot(formData);
        
        if (result.success) {
          const newResult: AnalysisResult = {
            id: Date.now(),
            timestamp: result.timestamp,
            frame_path: result.frame,
            prompt: prompt || 'Default prompt (livestream)',
            result: result.analysis,
            device_id: 'livestream_' + currentSource.id
          };
          setLatestResult(newResult);
        }
      } else {
        // Regular video file analysis (existing code)
        const videoFilename = getCurrentVideoFilename();
        console.log(`Analyzing ${videoFilename} at ${time}s`);
        
        const result = await api.analyzeFrame(time, 'default', videoFilename, prompt);
        
        if (result.success) {
          const newResult: AnalysisResult = {
            id: Date.now(),
            timestamp: result.timestamp,
            frame_path: result.frame,
            prompt: prompt || 'Default prompt',
            result: result.analysis,
            device_id: 'default'
          };
          setLatestResult(newResult);
        }
      }
      
      // Refresh the history
      await loadHistory();
    } catch (error: any) {
      console.error('Analysis failed:', error);
      const errorMessage = error.message || 'Failed to analyze video frame';
      alert(`Analysis failed: ${errorMessage}. Please try again.`);
    } finally {
      setIsProcessing(false);
    }
  }, [loadHistory, getCurrentVideoSource, getCurrentVideoFilename]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Wyze Smart Vision AI</h1>
          <p className="mt-2 text-gray-600">
            Intelligent video analysis for your security cameras
          </p>
        </header>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Video player */}
          <div className="lg:col-span-2">
            <VideoTabs
              videos={videos}
              activeVideoId={activeVideoId}
              onTabChange={handleTabChange}
              onAddStreamClick={handleAddStreamClick}
            />
            
            <VideoPlayer 
              ref={videoPlayerRef}
              currentTime={currentTime}
              onTimeUpdate={handleTimeUpdate}
              videoSource={getCurrentVideoSource()}
              onPeopleCountChange={handlePeopleCountChange}
              isPeopleDetectionEnabled={isPeopleDetectionEnabled}
              showDetectionOverlay={showDetectionOverlay}
              onTogglePeopleDetection={togglePeopleDetection}
              onToggleOverlay={toggleDetectionOverlay}
            />

            {getCurrentVideoSource()?.isHlsStream && isPeopleDetectionEnabled && (
              <div className="mt-2 bg-gray-800 text-white py-2 px-4 rounded-md flex items-center justify-between">
                <span className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  People Detected
                </span>
                <span className="bg-blue-600 rounded-full h-8 w-8 flex items-center justify-center font-bold">
                  {peopleCount}
                </span>
              </div>
            )}
            
            {/* Latest result display remains the same */}
            {latestResult && (
              <div className="mt-6 bg-white p-4 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-4">
                  Latest Analysis {getCurrentVideoSource()?.isHlsStream ? '(Livestream)' : ''}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Captured Frame</h4>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <img 
                        src={api.getFrameUrl(latestResult.frame_path)} 
                        alt="Captured Frame"
                        className="w-full h-auto"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Analysis Result</h4>
                    <div className="bg-gray-50 p-3 rounded-md flex-grow overflow-auto max-h-96">
                      <div className="prose prose-sm max-w-none">
                        {latestResult.result.split('\n').map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Right column - Controls */}
          <div className="lg:col-span-1">
            <div className="mb-4 text-center">
              <button
                onClick={testBackendConnection}
                className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                disabled={isProcessing}
              >
                Test Backend Connection
              </button>
              {backendStatus && (
                <div className={`mt-2 text-xs p-1 rounded ${backendStatus.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                  {backendStatus}
                </div>
              )}
            </div>
            
            {/* Show analysis controls for all videos AND streams now */}
            <AnalysisControls 
              currentTime={currentTime}
              onAnalysisRequest={handleAnalysisRequest}
              isProcessing={isProcessing}
              isLiveStream={getCurrentVideoSource()?.isHlsStream || false}
              isPeopleDetectionEnabled={isPeopleDetectionEnabled}
              showDetectionOverlay={showDetectionOverlay}
              onTogglePeopleDetection={getCurrentVideoSource()?.isHlsStream ? togglePeopleDetection : undefined}
              onToggleOverlay={getCurrentVideoSource()?.isHlsStream && isPeopleDetectionEnabled ? toggleDetectionOverlay : undefined}
            />
            
            {/* Show HLS stream info if current source is HLS */}
            {getCurrentVideoSource()?.isHlsStream && (
              <div className="bg-white p-4 rounded-lg shadow mt-4">
                <h3 className="text-lg font-medium mb-2">Live Stream Info</h3>
                <div className="text-sm text-gray-700">
                  <p className="mb-1"><strong>Name:</strong> {getCurrentVideoSource()?.name}</p>
                  <p className="mb-1"><strong>URL:</strong></p>
                  <p className="bg-gray-100 p-2 rounded text-xs overflow-auto break-all">
                    {getCurrentVideoSource()?.hlsUrl}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Analysis History */}
        <div className="mt-12">
          <AnalysisHistory history={analysisHistory} />
        </div>
      </div>
      
      {/* Add Stream Modal */}
      <AddStreamModal 
        isOpen={isAddStreamModalOpen}
        onClose={() => setIsAddStreamModalOpen(false)}
        onAddStream={handleAddStream}
      />
    </div>
  );
}

export default App;