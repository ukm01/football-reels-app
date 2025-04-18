'use client';
// const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

import { useEffect, useState } from 'react';

export default function Reels() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/videos`)
      .then((res) => res.json())
      .then((data) => {
        setVideos(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch videos:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="w-full h-screen overflow-y-scroll snap-y snap-mandatory scroll-smooth">
      {loading ? (
        <p className="text-center text-gray-400 py-10">Loading reels...</p>
      ) : videos.length === 0 ? (
        <p className="text-center text-gray-400 py-10">No videos found.</p>
      ) : (
        videos.map((video) => (
          <div
            key={video.id}
            className="h-screen snap-start flex items-center justify-center bg-black"
          >
            <video
              src={video.videoUrl}
              controls
              autoPlay
              loop
              muted
              className="h-full w-auto max-w-full object-cover"
            />
          </div>
        ))
      )}
    </div>
  );
}
