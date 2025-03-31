export default function LiveIndicator() {
    return (
      <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white text-sm font-medium">LIVE</span>
      </div>
    );
  }