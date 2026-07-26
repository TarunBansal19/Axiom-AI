import { YoutubeTranscript } from "youtube-transcript";
import { Innertube } from "youtubei.js";

export interface PlaylistVideo {
  videoId: string;
  title: string;
  position: number;
  transcript: string | null;
  durationSeconds?: number;
}

export interface YoutubePlaylistMetadata {
  playlistTitle: string;
  videos: PlaylistVideo[];
}

export async function fetchPlaylistMetadata(playlistId: string): Promise<YoutubePlaylistMetadata> {
  const youtube = await Innertube.create();
  
  let playlist;
  try {
    playlist = await youtube.getPlaylist(playlistId);
  } catch (err) {
    throw new Error(`Failed to fetch playlist metadata: ${(err as Error).message}`);
  }

  const playlistTitle = playlist.info?.title || "Unknown Playlist";
  const rawVideos = playlist.items || [];
  
  const videos: PlaylistVideo[] = [];
  
  for (let i = 0; i < rawVideos.length; i++) {
    const item = rawVideos[i] as any;
    
    // In youtubei.js, the video object structure varies
    const videoId = item.id || item.content_id;
    if (!videoId) continue;
    
    let title = "Unknown Video Title";
    if (item.title?.text) {
      title = item.title.text;
    } else if (item.metadata?.title?.text) {
      title = item.metadata.title.text;
    }
    
    let durationSeconds = 0;
    if (item.duration?.seconds !== undefined) {
      durationSeconds = item.duration.seconds;
    } else {
      // try to find text like "5:05" in overlays
      try {
        const badges = item.content_image?.overlays?.find((o: any) => o.badges)?.badges || [];
        const timeText = badges.find((b: any) => b.text)?.text;
        if (timeText) {
          const parts = timeText.split(':').map(Number);
          if (parts.length === 2) {
            durationSeconds = parts[0] * 60 + parts[1];
          } else if (parts.length === 3) {
            durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
        }
      } catch (e) {
        // ignore
      }
    }
    
    videos.push({
      videoId,
      title,
      position: i,
      durationSeconds,
      transcript: null,
    });
  }

  if (videos.length === 0) {
    throw new Error("Playlist not found or is empty.");
  }

  // Fetch transcripts (in parallel with some concurrency limit if large)
  const concurrencyLimit = 5;
  for (let i = 0; i < videos.length; i += concurrencyLimit) {
    const batch = videos.slice(i, i + concurrencyLimit);
    console.log(`Fetching transcripts for batch ${i / concurrencyLimit + 1}/${Math.ceil(videos.length / concurrencyLimit)}...`);
    await Promise.all(batch.map(async (v) => {
      try {
        const transcriptPromise = YoutubeTranscript.fetchTranscript(v.videoId);
        const timeoutPromise = new Promise<any[]>((_, reject) => 
          setTimeout(() => reject(new Error("Transcript fetch timed out")), 4000)
        );
        const transcriptLines = await Promise.race([transcriptPromise, timeoutPromise]);
        v.transcript = transcriptLines.map((t: any) => t.text).join(" ");
      } catch (err) {
        console.warn(`Failed to fetch transcript for video ${v.videoId}:`, (err as Error).message);
        v.transcript = null;
      }
    }));
  }

  return {
    playlistTitle,
    videos: videos.sort((a, b) => a.position - b.position)
  };
}
