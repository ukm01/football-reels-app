'use client';
import React, { useEffect, useState, useRef } from 'react';

export default function Reels() {
  const [videos, setVideos] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const res = await fetch("https://backend-2et4o31dp-ujjwal-mishras-projects-8b666590.vercel.app/api/videos");
        if (!res.ok) {
          const text = await res.text();
          console.error('❌ Failed to fetch videos:', res.status, text);
          return;
        }
        const data = await res.json();
        setVideos(data);
      } catch (err) {
        console.error('❌ Error fetching videos:', err);
      }
    };
    fetchVideos();
  }, []);

  const toggleMute = (e) => {
    const video = e.currentTarget;
    video.muted = !video.muted;
  };

  return (
    <main
      ref={containerRef}
      className="w-full h-screen overflow-y-scroll snap-y snap-mandatory bg-black"
    >
      {videos.map((video, index) => (
        <div
          key={index}
          className="w-full h-screen snap-start flex justify-center items-center relative"
        >
          <video
            src={video.videoUrl}
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            onClick={toggleMute}
          />
        </div>
      ))}
    </main>
  );
}
