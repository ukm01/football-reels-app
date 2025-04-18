'use client';
import Reels from './components/Reels';
// const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ;

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <header className="w-full text-center py-4 border-b border-gray-700 text-xl font-semibold">
        Football Reels 🎥⚽
      </header>
      <button
  onClick={async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/generate`);
      alert('Video generation started!');
    } catch (err) {
      alert('Failed to trigger generation');
    }
  }}
  className="fixed top-4 right-4 bg-white text-black px-4 py-2 rounded-lg shadow-md z-50 hover:bg-gray-200 transition"
>
  Generate
</button>

      <Reels />
    </main>
  );
}