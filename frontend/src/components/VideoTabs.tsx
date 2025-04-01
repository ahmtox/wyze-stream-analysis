export interface VideoSource {
  id: string;
  name: string;
  filename: string;
  description: string;
  isHlsStream?: boolean;
  hlsUrl?: string;
}

interface VideoTabsProps {
  videos: VideoSource[];
  activeVideoId: string;
  onTabChange: (videoId: string) => void;
  onAddStreamClick: () => void;
}

export default function VideoTabs({ videos, activeVideoId, onTabChange, onAddStreamClick }: VideoTabsProps) {
  if (!videos || videos.length === 0) {
    return (
      <div className="flex border-b border-gray-200 w-full mb-4">
        <button
          onClick={onAddStreamClick}
          className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap focus:outline-none"
        >
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Camera
          </div>
        </button>
      </div>
    );
  }
  
  return (
    <div className="flex overflow-x-auto scrollbar-hide mb-4">
      <div className="flex border-b border-gray-200 w-full">
        {videos.map((video) => (
          <button
            key={video.id}
            onClick={() => onTabChange(video.id)}
            className={`
              px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${activeVideoId === video.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
            `}
          >
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                {video.isHlsStream ? (
                  // Live streaming icon
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                ) : (
                  // Regular video icon
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                )}
              </svg>
              {video.name}
              {video.isHlsStream && (
                <span className="ml-1 text-red-500 animate-pulse">●</span>
              )}
            </div>
          </button>
        ))}
        
        {/* Add Camera button */}
        <button
          onClick={onAddStreamClick}
          className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap focus:outline-none"
        >
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Camera
          </div>
        </button>
      </div>
    </div>
  );
}