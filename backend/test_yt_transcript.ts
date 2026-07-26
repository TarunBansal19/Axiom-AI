import { Innertube } from 'youtubei.js';

async function main() {
  const yt = await Innertube.create();
  console.log("Fetching video info...");
  const info = await yt.getInfo('Hr5iLG7sUa0'); // The first video that timed out
  console.log("Fetching transcript...");
  try {
    const transcriptData = await info.getTranscript();
    console.log(transcriptData?.transcript?.content?.body?.initial_segments.map(s => s.snippet.text).join(' ').substring(0, 200));
  } catch (err) {
    console.error("No transcript found via yt.getInfo:", err);
  }
}

main().catch(console.error);
