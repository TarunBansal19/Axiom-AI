import { Innertube } from 'youtubei.js';
import fs from 'fs';

async function test() {
  const youtube = await Innertube.create();
  
  const playlistId = 'PLu71SKxNbfoBuX3f4EOACle2y-tRC5Q37';
  console.log("Fetching playlist info...");
  const playlist = await youtube.getPlaylist(playlistId);
  
  const videos = playlist.items;
  if (videos && videos.length > 0) {
    fs.writeFileSync('video.json', JSON.stringify(videos[0], null, 2));
    console.log("wrote video.json");
  }
}

test().catch(console.error);
