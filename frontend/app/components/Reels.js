"use client";
import React, { useEffect, useState } from "react";

const API_URL = "https://backend-2et4o31dp-ujjwal-mishras-projects-8b666590.vercel.app/api/videos";

export default function Reels() {
  const [videos, setVideos] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        console.log("📡 Fetching from:", API_URL);
        const res = await fetch(API_URL);

        console.log("📥 Raw response:", res);

        if (!res.ok) {
          const text = await res.text();
          console.error("❌ Failed to fetch videos:", res.status, text);
          setError(`Status: ${res.status}, ${text}`);
          return;
        }

        const data = await res.json();
        console.log("✅ Fetched videos:", data);
        setVideos(data);
      } catch (err) {
        console.error("🔥 Network error:", err);
        setError(err.message);
      }
    };

    fetchVideos();
  }, []);

  if (error) {
    return (
      <div className="text-red-500 text-center mt-10">
        ❌ Error fetching videos: {error}
      </div>
    );
  }

  if (videos.length === 0) {
    return <div className="text-center mt-10 text-gray-600">⏳ Loading videos...</div>;
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {videos.map((video) => (
        <div key={video.id} className="w-full max-w-sm">
          <video
            src={video.videoUrl}
            controls
            loop
            className="w-full h-[500px] object-cover rounded-2xl"
          />
          <p className="mt-2 text-center text-white font-semibold">
            {video.description}
          </p>
        </div>
      ))}
    </div>
  );
}
