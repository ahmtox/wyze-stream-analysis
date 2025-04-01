import { Fragment, useState, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';

interface AddStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStream: (name: string, url: string) => void;
}

export default function AddStreamModal({ isOpen, onClose, onAddStream }: AddStreamModalProps) {
  const [streamName, setStreamName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [error, setError] = useState('');
  const initialFocusRef = useRef(null);
  
  const handleSubmit = () => {
    // Validate inputs
    if (!streamName.trim()) {
      setError('Please enter a name for the stream');
      return;
    }
    
    if (!streamUrl.trim()) {
      setError('Please enter a valid HLS URL');
      return;
    }
    
    // Validate URL format (simple check for http/https and .m3u8 extension)
    const urlRegex = /^(https?:\/\/).+(\.m3u8)(\?.*)?$/i;
    if (!urlRegex.test(streamUrl)) {
      setError('Please enter a valid HLS URL (must end with .m3u8)');
      return;
    }
    
    // Add the stream
    onAddStream(streamName, streamUrl);
    
    // Reset form and close modal
    setStreamName('');
    setStreamUrl('');
    setError('');
    onClose();
  };
  
  const handleCancel = () => {
    setStreamName('');
    setStreamUrl('');
    setError('');
    onClose();
  };
  
  // Sample HLS URLs for testing
  const sampleUrls = [
    'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    'https://dai.google.com/linear/hls/pa/event/Sid4xiTQTkCT1SLu6rjUSQ/stream/ba5c124f-4fcb-4cb9-a8c9-6575bad90508:DLS/variant/df9d5f9fc8201f0878fd4a77927eea3b/bandwidth/3016996.m3u8',
    'https://content-dtci.uplynk.com/channel/3324f2467c414329b3b0cc5cd987b6be.m3u8',
    'https://videos-3.earthcam.com/fecnetwork/hdtimes10.flv/playlist.m3u8'
  ];
  
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog 
        as="div" 
        className="relative z-10" 
        onClose={handleCancel}
        initialFocus={initialFocusRef}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                  Add Camera Stream
                </Dialog.Title>
                
                <div className="mt-4">
                  <div className="mb-4">
                    <label htmlFor="camera-name" className="block text-sm font-medium text-gray-700">Camera Name</label>
                    <input
                      ref={initialFocusRef}
                      type="text"
                      id="camera-name"
                      value={streamName}
                      onChange={(e) => setStreamName(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Living Room Camera"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="hls-url" className="block text-sm font-medium text-gray-700">HLS Stream URL</label>
                    <input
                      type="text"
                      id="hls-url"
                      value={streamUrl}
                      onChange={(e) => setStreamUrl(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="https://example.com/stream.m3u8"
                    />
                  </div>
                  
                  {error && (
                    <div className="mb-4 p-2 bg-red-50 text-red-700 text-sm rounded-md">
                      {error}
                    </div>
                  )}
                  
                  <div className="mt-6 mb-2">
                    <p className="text-xs text-gray-500">Try one of these sample HLS streams:</p>
                    <div className="mt-2 space-y-2">
                      {sampleUrls.map((url, index) => (
                        <div
                          key={index}
                          className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
                          onClick={() => setStreamUrl(url)}
                        >
                          {url}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-300 focus:outline-none"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none"
                    onClick={handleSubmit}
                  >
                    Add Stream
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}